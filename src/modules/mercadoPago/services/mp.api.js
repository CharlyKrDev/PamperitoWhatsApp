// src/modules/mercadoPago/services/mp.api.js
import "dotenv/config";
import axios from "axios";
import fs from "fs";

const ORDERS_FILE = "src/db/orders.json";

function ensureFile() {
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
}
function readOrders() {
  ensureFile();
  return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
}
function writeOrders(arr) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(arr, null, 2));
}

export function persistOrder(order) {
  const orders = readOrders();
  const id = `PAM-${Date.now()}`;
  const saved = { id, createdAt: new Date().toISOString(), ...order };
  orders.push(saved);
  writeOrders(orders);
  return saved;
}

export function markPaid(orderId) {
  const orders = readOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx >= 0) {
    orders[idx].status = "PAID";
    orders[idx].paidAt = new Date().toISOString();
    writeOrders(orders);
    return orders[idx];
  }
  return null;
}

export async function createPreference(orderId, total) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.warn("⚠️ MP_ACCESS_TOKEN ausente: usando MODO DEMO (sin link real).");
    return null; // <- Modo demo
  }

  const pref = {
    items: [{ title: `Pedido ${orderId}`, quantity: 1, unit_price: Number(total) }],
    external_reference: orderId,
    notification_url: process.env.MP_WEBHOOK_URL, // tu ngrok /webhook/mp
  };

  const { data } = await axios.post(
    "https://api.mercadopago.com/checkout/preferences",
    pref,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );

  return data.init_point || data.sandbox_init_point;
}
