// src/modules/whatsApp/services/whatsapp.api.js
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const META_GRAPH_BASE = process.env.META_GRAPH_BASE || "https://graph.facebook.com";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v19.0";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
  console.warn(
    "[WhatsApp] Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_ID. Las llamadas a la API van a fallar."
  );
}

function waUrl(path) {
  return `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${WHATSAPP_PHONE_ID}/${path}`;
}

async function callWhatsApp(payload) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn("[WhatsApp] Config incompleta, no se envía mensaje:", payload);
    return;
  }

  try {
    const url = waUrl("messages");
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    return res.data;
  } catch (err) {
    const code = err?.response?.data?.error?.code;
    const subcode = err?.response?.data?.error?.error_subcode;

    if (code === 190) {
      console.error("[WhatsApp] Token inválido o vencido (code 190).");
    } else if (code === 200 && subcode === 2534028) {
      console.error(
        "[WhatsApp] Mensaje bloqueado por políticas (PolicyAgent). Revisar contenido/previews."
      );
    } else {
      console.error("[WhatsApp] Error llamando a la API:", err.response?.data || err.message);
    }
  }
}

// Texto simple
export async function sendTextMessage(to, body) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body,
      preview_url: false,
    },
  };

  return callWhatsApp(payload);
}

// Menú principal con 3 botones (pedido / precios / zonas)
export async function sendButtons(to) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Elegí una opción 👇",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "make_order",
              title: "🧺 Hacer pedido",
            },
          },
          {
            type: "reply",
            reply: {
              id: "prices",
              title: "💸 Ver precios",
            },
          },
          {
            type: "reply",
            reply: {
              id: "zones",
              title: "🚚 Zonas de envío",
            },
          },
        ],
      },
    },
  };

  return callWhatsApp(payload);
}

// Link de pago (o modo demo si no hay link)
export async function sendOrderLink(to, link, orderId) {
  if (!link) {
    const body =
      `Tu pedido ${orderId} quedó registrado ✅.\n\n` +
      `Por ahora estamos en modo demo: avisale al vendedor que el pago está hecho ` +
      `escribiendo algo como:\n\n*pago ok ${orderId}*`;
    return sendTextMessage(to, body);
  }

  const body =
    `Para pagar tu pedido ${orderId} usá este enlace:\n\n${link}\n\n` +
    `Una vez aprobado el pago coordinamos la entrega 🔥`;

  return sendTextMessage(to, body);
}

// 🆕 Botón "Repetir último pedido"
export async function sendRepeatButton(to, summary) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          `La última vez pediste:\n${summary}\n\n` +
          `¿Querés repetir ese pedido?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "repeat_last",
              title: "🔁 Repetir pedido",
            },
          },
        ],
      },
    },
  };

  return callWhatsApp(payload);
}
