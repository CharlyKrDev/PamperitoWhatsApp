import "dotenv/config";
const required = [
  "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_VERIFY_TOKEN",
  "META_GRAPH_VERSION", "META_GRAPH_BASE", "PORT"
];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error("❌ Faltan variables:", missing);
  process.exit(1);
}
console.log("✅ Health OK. Entorno listo.");
