// src/modules/mercadoPago/services/mp.api.js
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ORDERS_FILE = path.resolve("src/db/orders.json");
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || null;
const MP_WEBHOOK_URL = process.env.MP_WEBHOOK_URL || null;

// --------- helpers de archivo ---------
async function ensureOrdersFile() {
  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await fs.mkdir(path.dirname(ORDERS_FILE), { recursive: true });
    await fs.writeFile(ORDERS_FILE, "[]", "utf8");
  }
}

async function readOrders() {
  await ensureOrdersFile();
  const raw = await fs.readFile(ORDERS_FILE, "utf8").catch(() => "[]");
  try {
    return JSON.parse(raw || "[]");
  } catch {
    // si se rompe el JSON, lo reiniciamos
    return [];
  }
}

async function writeOrders(orders) {
  await ensureOrdersFile();
  await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

// --------- API pública ---------

// Guarda una nueva orden y devuelve la orden completa (con id)
export async function persistOrder(order) {
  const orders = await readOrders();

  const newOrder = {
    id: `PAM-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: order.status || "PENDING",
    ...order,
  };

  orders.push(newOrder);
  await writeOrders(orders);
  return newOrder;
}

// Marca una orden como pagada, devuelve la orden actualizada o null si no existe
export async function markPaid(orderId) {
  const orders = await readOrders();
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx === -1) return null;

  const updated = {
    ...orders[idx],
    status: "PAID",
    paidAt: new Date().toISOString(),
  };

  orders[idx] = updated;
  await writeOrders(orders);
  return updated;
}

// Obtiene la última orden de un número de WhatsApp
export async function getLastOrderByPhone(phone) {
  if (!phone) return null;
  const orders = await readOrders();

  const fromSamePhone = orders.filter((o) => o.from === phone);
  if (!fromSamePhone.length) return null;

  fromSamePhone.sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });

  return fromSamePhone[0];
}

// Crea una preferencia de pago en MP y devuelve el link (o null si no hay token)
export async function createPreference(orderId, total) {
  if (!MP_ACCESS_TOKEN) {
    console.warn(
      "[MercadoPago] MP_ACCESS_TOKEN no configurado. Modo demo, no se crea preferencia real."
    );
    return null;
  }

  const url = "https://api.mercadopago.com/checkout/preferences";

  const body = {
    items: [
      {
        title: `Pedido ${orderId}`,
        quantity: 1,
        currency_id: "ARS",
        unit_price: Number(total) || 0,
      },
    ],
    external_reference: orderId,
    metadata: { orderId },
    // importante para el webhook en modo test
    notification_url: MP_WEBHOOK_URL || undefined,
  };

  try {
    const resp = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const pref = resp.data;
    // en modo test suele venir sandbox_init_point
    return pref.init_point || pref.sandbox_init_point || null;
  } catch (err) {
    console.error(
      "[MercadoPago] Error creando preferencia:",
      err?.response?.data || err.message
    );
    return null;
  }
}
