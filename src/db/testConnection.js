import sql from "./postgres.js";

try {
  const result = await sql`select now()`;
  console.log("🔥 Conexión exitosa:", result);
} catch (err) {
  console.error("❌ Error de conexión:", err);
}
