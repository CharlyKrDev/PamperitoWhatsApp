// src/modules/customers/services/customers.api.js
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const CUSTOMERS_FILE = path.resolve("src/db/customers.json");

// ---------- helpers internos ----------
async function ensureCustomersFile() {
  try {
    await fs.access(CUSTOMERS_FILE);
  } catch {
    await fs.mkdir(path.dirname(CUSTOMERS_FILE), { recursive: true });
    await fs.writeFile(CUSTOMERS_FILE, "[]", "utf8");
  }
}

async function readCustomers() {
  await ensureCustomersFile();
  const raw = await fs.readFile(CUSTOMERS_FILE, "utf8").catch(() => "[]");
  try {
    return JSON.parse(raw || "[]");
  } catch {
    console.warn("[Customers] JSON inválido, reiniciando customers.json");
    return [];
  }
}

async function writeCustomers(customers) {
  await ensureCustomersFile();
  await fs.writeFile(
    CUSTOMERS_FILE,
    JSON.stringify(customers, null, 2),
    "utf8"
  );
}

// ---------- API pública ----------

// Devuelve el cliente por número de WhatsApp o null si no existe
export async function getCustomerByPhone(phone) {
  if (!phone) return null;
  const customers = await readCustomers();
  return customers.find((c) => c.phone === phone) || null;
}

// Crea o actualiza un cliente.
// data DEBE incluir phone. El resto es opcional: name, address, zone, lastOrderId, etc.
export async function upsertCustomer(data) {
  if (!data || !data.phone) {
    throw new Error("[Customers] upsertCustomer requiere 'phone'");
  }

  const customers = await readCustomers();
  const now = new Date().toISOString();

  const idx = customers.findIndex((c) => c.phone === data.phone);

  if (idx === -1) {
    const newCustomer = {
      phone: data.phone,
      name: data.name || null,
      address: data.address || null,
      zone: data.zone || null,
      lastOrderId: data.lastOrderId || null,
      createdAt: now,
      updatedAt: now,
    };
    customers.push(newCustomer);
  } else {
    customers[idx] = {
      ...customers[idx],
      ...data,
      updatedAt: now,
    };
  }

  await writeCustomers(customers);
  return customers.find((c) => c.phone === data.phone) || null;
}

// Helper opcional para actualizar último pedido
export async function updateCustomerLastOrder(phone, orderId) {
  if (!phone || !orderId) return null;
  return upsertCustomer({ phone, lastOrderId: orderId });
}
