// src/modules/whatsApp/services/whatsapp.api.js
import "dotenv/config";
import axios from "axios";

const GRAPH_BASE = process.env.META_GRAPH_BASE;
const VERSION   = process.env.META_GRAPH_VERSION;
const PHONE_ID  = process.env.WHATSAPP_PHONE_ID;
const TOKEN     = process.env.WHATSAPP_TOKEN;

// 🔍 Validación temprana de entorno
(function validateEnv() {
  const missing = [];
  if (!GRAPH_BASE) missing.push("META_GRAPH_BASE");
  if (!VERSION)    missing.push("META_GRAPH_VERSION");
  if (!PHONE_ID)   missing.push("WHATSAPP_PHONE_ID");
  if (!TOKEN)      missing.push("WHATSAPP_TOKEN");
  if (missing.length) {
    console.error("❌ Faltan variables de entorno para WhatsApp Cloud API:", missing);
    throw new Error("Configuración incompleta de WhatsApp API (.env)");
  }
})();

function waUrl(path = "messages") {
  return `${GRAPH_BASE}/${VERSION}/${PHONE_ID}/${path}`;
}

async function callWhatsApp(payload) {
  const url = waUrl("messages");
  try {
    const { data } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`📤 Enviado a ${payload?.to} | tipo: ${payload?.type}`);
    return data;
  } catch (err) {
    const e = err?.response?.data || err;
    // Mensaje claro si el token expiró
    if (e?.error?.code === 190) {
      console.error("🔑 Token vencido. Generá uno nuevo en Meta y actualizá WHATSAPP_TOKEN en .env");
    }
    // Si PolicyAgent bloquea por preview/link u otra policy
    if (e?.error?.code === 200 && e?.error?.error_subcode === 2534028) {
      console.error("🛡️ PolicyAgent bloqueó el mensaje. Evitá previews de URL o revisá el contenido.");
    }
    console.error("❌ Error enviando mensaje:", e);
    throw err;
  }
}

export async function sendTextMessage(to, body) {
  return callWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body, preview_url: false }, // evita preview de links
  });
}

export async function sendButtons(to) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Qué querés hacer? 👇" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "make_order", title: "🪵 Hacer pedido" } },
          { type: "reply", reply: { id: "prices",     title: "💰 Ver precios" } },
          { type: "reply", reply: { id: "zones",      title: "🚚 Zonas de envío" } }
        ]
      }
    }
  };
  return callWhatsApp(payload);
}

export async function sendOrderLink(to, link, orderId) {
  // Soporta modo MOCK (link nulo cuando no hay MP)
  const msg = link
    ? `🧾 Pedido #${orderId}\nPagá acá para confirmar 👉 ${link}\n` +
      `Una vez acreditado te confirmamos la franja de entrega. 🔥`
    : `🧾 Pedido #${orderId}\n(🧪 Modo demo) El link de pago no está habilitado.\n` +
      `Podés simular confirmación enviando "pago ok ${orderId}" o vía /webhook/mp.`;
  return sendTextMessage(to, msg);
}
