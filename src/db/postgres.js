// src/db/postgres.js
import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[DB] DATABASE_URL no configurada. La conexión a Postgres fallará."
  );
}

// Cliente principal (tag sql``)
const sql = postgres(connectionString, {
  ssl: "require", // Supabase lo necesita
});

// Helper opcional por si querés una función tipo query(text, params)
export async function query(text, params = []) {
  // Armamos un SQL parametrizado a partir de text + params
  // Ej: query("select * from customers where phone = $1", [phone])
  const prepared = sql.unsafe(
    text.replace(/\$(\d+)/g, (_m, idx) => `$${idx}`),
    params
  );
  const res = await prepared;
  return {
    rows: res,
    rowCount: res.length,
  };
}

export default sql;
