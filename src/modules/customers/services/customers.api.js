// src/modules/customers/services/customers.api.js
import dotenv from "dotenv";
dotenv.config();

import { query } from "../../../db/postgres.js";

// Mapea una fila de customers a objeto simple
function mapCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    address: row.address || null,
    zone: row.zone || null,
  };
}

export async function getCustomerByPhone(phone) {
  if (!phone) return null;

  const res = await query(
    `
    SELECT id, phone, name, address, zone
    FROM customers
    WHERE phone = $1
    LIMIT 1
    `,
    [phone]
  );

  return mapCustomer(res.rows[0]);
}

/**
 * upsertCustomer({ phone, name, address, zone })
 * - Si existe el phone -> actualiza datos no nulos
 * - Si no existe -> inserta
 */
export async function upsertCustomer({
  phone,
  name = null,
  address = null,
  zone = null,
}) {
  if (!phone) throw new Error("[customers] upsertCustomer requiere phone");

  const existing = await getCustomerByPhone(phone);

  if (existing) {
    await query(
      `
      UPDATE customers
      SET
        name    = COALESCE($2, name),
        address = COALESCE($3, address),
        zone    = COALESCE($4, zone)
      WHERE phone = $1
      `,
      [phone, name, address, zone]
    );
  } else {
    await query(
      `
      INSERT INTO customers (phone, name, address, zone)
      VALUES ($1, $2, $3, $4)
      `,
      [phone, name, address, zone]
    );
  }

  return getCustomerByPhone(phone);
}

/**
 * updateCustomerLastOrder(phone, orderId, { address, zone })
 *
 * Por ahora ignoramos orderId (no tenemos columna last_order_id en tu tabla),
 * pero lo dejamos en la firma por compatibilidad.
 * Sí aprovechamos para actualizar address/zone si vienen.
 */
export async function updateCustomerLastOrder(
  phone,
  orderId,
  { address = null, zone = null } = {}
) {
  if (!phone) return null;

  await query(
    `
    UPDATE customers
    SET
      address = COALESCE($2, address),
      zone    = COALESCE($3, zone)
    WHERE phone = $1
    `,
    [phone, address, zone]
  );

  return getCustomerByPhone(phone);
}
