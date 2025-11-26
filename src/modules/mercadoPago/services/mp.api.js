// src/modules/mercadoPago/services/mp.api.js
import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { query } from "../../../db/postgres.js";
import { getUnitPrice } from "../../../utils/calc.js";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || null;
const MP_WEBHOOK_URL = process.env.MP_WEBHOOK_URL || null;

// ---------- Helpers internos ----------

// Genera IDs tipo PAM-<timestamp>
function generateOrderId() {
  return `PAM-${Date.now()}`;
}

// Mapea fila de orders a objeto que espera el bot
function mapOrderRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    from: row.from_phone || row.phone || null,
    parsed: row.parsed,
    total: Number(row.total ?? 0),

    // estado de pago (PENDING, PAID, etc.)
    status: row.status,

    // estado logístico de entrega (PENDING, IN_DELIVERY, DELIVERED)
    deliveryStatus: row.delivery_status || null,

    meta: row.meta || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    // fecha efectiva de entrega (puede ser null)
    deliveredAt: row.delivered_at || null,
  };
}



// ---------- Persistencia de PEDIDOS ----------

/**
 * persistOrder({ from, parsed, total, status, meta }) -> order
 *
 * - Crea la orden en la tabla `orders`
 * - Graba items en `order_items` (si vienen en parsed.items)
 */
export async function persistOrder({
  from,
  parsed,
  total,
  status = "PENDING",
  meta = {},
}) {
  if (!from) {
    throw new Error("[MP] persistOrder requiere 'from'");
  }

  const id = generateOrderId();
  const safeTotal = Number(total ?? 0);

  // 1) Insert en orders
  await query(
    `
    INSERT INTO orders (id, from_phone, parsed, total, status, meta)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, from, parsed || {}, safeTotal, status, meta || {}]
  );

  // 2) Insert en order_items (opcional)
  if (parsed && Array.isArray(parsed.items) && parsed.items.length) {
    for (const item of parsed.items) {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = await getUnitPrice(item.id || null, quantity);

      await query(
        `
      INSERT INTO order_items
        (order_id, product_id, label, quantity, unit, unit_price)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          id,
          item.id || null,
          item.label || null,
          quantity,
          item.unit || null,
          unitPrice,
        ]
      );
    }
  }

  // 3) Devolvemos la orden recién creada
  const res = await query(
    `
    SELECT
      id,
      from_phone,
      parsed,
      total,
      status,
      meta,
      created_at,
      updated_at
    FROM orders
    WHERE id = $1
    `,
    [id]
  );

  return mapOrderRow(res.rows[0]);
}

/**
 * Devuelve el último pedido de un teléfono (o null si no hay)
 */
export async function getLastOrderByPhone(phone) {
  if (!phone) return null;

  const res = await query(
    `
    SELECT
      id,
      from_phone,
      parsed,
      total,
      status,
      meta,
      created_at,
      updated_at
    FROM orders
    WHERE from_phone = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [phone]
  );

  return mapOrderRow(res.rows[0]);
}

/**
 * Marca una orden como pagada.
 * - Se usa tanto desde el webhook de MP como desde el "pago ok PAM-123".
 * - Opcionalmente registra un row en `payments`.
 *
 * @param {string} orderId   ej. 'PAM-1763344334658'
 * @param {object} opts      { mpPaymentId, rawPayment }
 */
export async function markPaid(orderId, opts = {}) {
  if (!orderId) return null;

  const { mpPaymentId = null, rawPayment = null } = opts;

  // 1) Actualizamos estado de la orden
  const res = await query(
    `
    UPDATE orders
    SET
      status     = 'PAID',
      meta       = COALESCE(meta, '{}'::jsonb) || '{"paymentStatus":"PAID"}',
      updated_at = NOW()
    WHERE id = $1
    RETURNING
      id,
      from_phone,
      parsed,
      total,
      status,
      meta,
      created_at,
      updated_at
    `,
    [orderId]
  );

  const row = res.rows[0];
  if (!row) {
    return null;
  }

  const order = mapOrderRow(row);

  // 2) Guardamos registro básico en payments (opcional)
  try {
    await query(
      `
      INSERT INTO payments (order_id, mp_payment_id, status, amount, raw)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        orderId,
        mpPaymentId,
        "approved", // por ahora fijo; si queremos lo leemos del pago real
        order.total,
        rawPayment || {},
      ]
    );
  } catch (e) {
    console.warn("[MP] No se pudo insertar en payments:", e.message || e);
  }

  return order;
}

export async function updateOrderStatus(orderId, newStatus) {
  if (!orderId) {
    throw new Error("[Orders] updateOrderStatus requiere 'orderId'");
  }

  if (!newStatus) {
    throw new Error("[Orders] updateOrderStatus requiere 'newStatus'");
  }

  const normalized = String(newStatus).toUpperCase().trim();
  const allowed = ["PENDING", "PAID", "IN_DELIVERY", "DELIVERED"];

  if (!allowed.includes(normalized)) {
    throw new Error(
      `[Orders] Estado inválido '${newStatus}'. Debe ser uno de: ${allowed.join(
        ", "
      )}`
    );
  }

  // Si el estado es PAID, dejamos que lo maneje la lógica ya existente
  if (normalized === "PAID") {
    return await markPaid(orderId);
  }

  let queryText;

  if (normalized === "IN_DELIVERY") {
    queryText = `
      UPDATE orders
      SET
        delivery_status = 'IN_DELIVERY',
        updated_at      = NOW()
      WHERE id = $1
      RETURNING
        id,
        from_phone,
        parsed,
        total,
        status,
        delivery_status,
        meta,
        created_at,
        updated_at,
        delivered_at
    `;
  } else if (normalized === "DELIVERED") {
    // Al marcar ENTREGADO, asumimos que el pedido quedó PAGADO
    queryText = `
      UPDATE orders
      SET
        delivery_status = 'DELIVERED',
        delivered_at    = COALESCE(delivered_at, NOW()),
        status          = 'PAID',
        meta            = COALESCE(meta, '{}'::jsonb) || '{"paymentStatus":"PAID"}',
        updated_at      = NOW()
      WHERE id = $1
      RETURNING
        id,
        from_phone,
        parsed,
        total,
        status,
        delivery_status,
        meta,
        created_at,
        updated_at,
        delivered_at
    `;
  } else {
    // PENDING → estado logístico pendiente (no tocamos status si no es necesario)
    queryText = `
      UPDATE orders
      SET
        delivery_status = 'PENDING',
        updated_at      = NOW()
      WHERE id = $1
      RETURNING
        id,
        from_phone,
        parsed,
        total,
        status,
        delivery_status,
        meta,
        created_at,
        updated_at,
        delivered_at
    `;
  }

  const res = await query(queryText, [orderId]);
  const row = res.rows[0];
  return row ? mapOrderRow(row) : null;
}



/**
 * Crea una preferencia de pago en Mercado Pago y devuelve la URL (init_point)
 */
export async function createPreference(orderId, total) {
  if (!MP_ACCESS_TOKEN) {
    console.warn(
      "[MP] MP_ACCESS_TOKEN no configurado. No se puede crear preferencia."
    );
    return null;
  }

  const amount = Number(total ?? 0);

  const body = {
    items: [
      {
        title: `Pedido ${orderId}`,
        quantity: 1,
        currency_id: "ARS",
        unit_price: amount,
      },
    ],
    external_reference: orderId,
    notification_url: MP_WEBHOOK_URL || undefined,
  };

  try {
    const resp = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      body,
      {
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const pref = resp.data || {};
    return pref.init_point || pref.sandbox_init_point || null;
  } catch (err) {
    console.error(
      "[MP] Error creando preferencia:",
      err?.response?.data || err?.message || err
    );
    return null;
  }
}

// ---------- Log de notificaciones MP ----------

/**
 * logMpNotification(topic, paymentId, rawPayload)
 *
 * IMPORTANTE:
 *   Tu tabla `mp_notifications` NO tiene la columna `payment_id`,
 *   así que acá sólo guardamos: topic + raw.
 */
export async function logMpNotification(topic, paymentId, rawPayload) {
  try {
    await query(
      `
      INSERT INTO mp_notifications (topic, raw)
      VALUES ($1, $2)
      `,
      [topic || null, rawPayload || {}]
    );
  } catch (e) {
    console.warn(
      "[MP] No se pudo loguear notificación en mp_notifications:",
      e.message || e
    );
  }
}
