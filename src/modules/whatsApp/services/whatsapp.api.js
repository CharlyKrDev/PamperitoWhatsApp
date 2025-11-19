// src/modules/whatsApp/services/whatsApp.api.js
import dotenv from "dotenv";
dotenv.config();

import { loadCatalog } from "../../catalog/services/catalog.api.js";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

async function callWhatsApp(payload) {
  const url = `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("[WhatsApp API] Error:", res.status, txt);
  }
}

// ---------- Mensajes básicos ----------

export async function sendTextMessage(to, text) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };
  await callWhatsApp(payload);
}

// Link de pago (texto simple con URL)
export async function sendOrderLink(to, preferenceUrl, orderId) {
  const refText = orderId ? ` para el pedido *${orderId}*` : "";

  if (!preferenceUrl) {
    // Modo demo / sin link real
    const body =
      `Por ahora estamos en *modo demo*, así que no se generó un link de pago automático${refText}.\n\n` +
      "Avisale al vendedor que el pedido está listo para pagar y coordinan el pago por acá 🔥.";
    await sendTextMessage(to, body);
    return;
  }

  const body =
    `Te dejo el link de pago${refText}:\n\n` +
    `${preferenceUrl}\n\n` +
    "Una vez acreditado el pago, coordinamos la entrega 🔥.";

  await sendTextMessage(to, body);
}

// ---------- Menú principal ----------

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
              title: "🛒 Hacer pedido",
            },
          },
          {
            type: "reply",
            reply: {
              id: "prices",
              title: "💸 Lista de precios",
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

  await callWhatsApp(payload);
}

// ============================================================
//                MENÚ DINÁMICO DESDE LA BASE DE DATOS
// ============================================================

// Mapeo interno de categorías + estética
const PRODUCT_MENU_META = {
  lenia_10kg: { category: "lenias", emoji: "🌲", description: "Ideal para uso diario." },
  lenia_20kg: { category: "lenias", emoji: "🌲", description: "Más cantidad por bolsa." },
  carbon_3kg: { category: "carbones", emoji: "🔥", description: "Para algo rápido y chico." },
  carbon_4kg: { category: "carbones", emoji: "🔥", description: "Un poco más de fuego." },
  carbon_5kg: { category: "carbones", emoji: "🔥", description: "El tamaño clásico del asado." },
  carbon_10kg: { category: "carbones", emoji: "🔥", description: "Para varias comidas o eventos." },
  pack_alamo: { category: "otros", emoji: "🪵", description: "Leña suave para complementar." },
  pastilla_encendido: { category: "otros", emoji: "✨", description: "Para arrancar el fuego fácil." },
};

// Orden visual del menú
const PRODUCT_MENU_CATEGORIES = [
  { key: "lenias", title: "Leñas" },
  { key: "carbones", title: "Carbones" },
  { key: "otros", title: "Otros" },
];
const MAX_ROW_TITLE_LENGTH = 24;

function buildMenuTitle(emoji, label) {
  const base = `${emoji} ${label || ""}`.trim();

  if (base.length <= MAX_ROW_TITLE_LENGTH) {
    return base;
  }

  // Dejamos un carácter para el "…" y recortamos
  const trimmed = base.slice(0, MAX_ROW_TITLE_LENGTH - 1).trimEnd();
  return `${trimmed}…`;
}


export async function sendProductMenu(to) {
  const catalog = await loadCatalog(); // ← ahora sí cargará la DB correctamente

  const rowsByCategory = {
    lenias: [],
    carbones: [],
    otros: [],
  };

  const products = Object.values(catalog).sort((a, b) =>
    (a.label || "").localeCompare(b.label || "", "es")
  );

  for (const product of products) {
    if (!product || !product.id) continue;

    const meta = PRODUCT_MENU_META[product.id] || {};

    // 1) Categoría: DB > meta > 'otros'
    const categoryKey = product.category || meta.category || "otros";
    if (!rowsByCategory[categoryKey]) {
      rowsByCategory[categoryKey] = [];
    }

    // 2) Emoji: DB > meta > genérico
    const emoji = product.emoji || meta.emoji || "🔥";

    // 3) Título recortado a 24 chars
    const title = buildMenuTitle(emoji, product.label);

    // 4) Descripción: meta > fallback en base a unit
    const description =
      meta.description ||
      (product.unit ? `Unidad: ${product.unit}` : "Seleccioná para continuar.");


    rowsByCategory[categoryKey].push({
      id: `product_${product.id}`,
      title,
      description,
    });
  }

  const sections = PRODUCT_MENU_CATEGORIES.reduce((acc, cat) => {
    const rows = rowsByCategory[cat.key];
    if (rows && rows.length > 0) {
      acc.push({
        title: cat.title,
        rows,
      });
    }
    return acc;
  }, []);

  if (!sections.length) {
    await sendTextMessage(
      to,
      "Por el momento no puedo mostrar el menú automático 😕. Probá más tarde."
    );
    return;
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "🔥 Productos Pamperito" },
      body: { text: "Elegí qué querés pedir y después te pregunto la cantidad 😉" },
      footer: { text: "Podés agregar más de un producto en el mismo pedido." },
      action: {
        button: "📋 Ver productos",
        sections,
      },
    },
  };

  await callWhatsApp(payload);
}

// ============================================================
//                RESTO DE FUNCIONES (IGUAL QUE ANTES)
// ============================================================

// Botón para repetir último pedido
export async function sendRepeatButton(to, summaryText) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          "Tenés un pedido anterior:\n\n" +
          summaryText +
          "\n\n¿Querés repetirlo con precios actualizados?",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "repeat_last", title: "🔁 Repetir pedido" },
          },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// Métodos de pago
export async function sendPaymentMethodButtons(to, { enableMp = true, enableCash = true } = {}) {
  if (!enableMp && !enableCash) {
    enableMp = true;
    enableCash = true;
  }

  const buttons = [];

  if (enableMp) buttons.push({ type: "reply", reply: { id: "pay_mp", title: "💳 MercadoPago" } });
  if (enableCash)
    buttons.push({ type: "reply", reply: { id: "pay_cash", title: "💵 Efectivo" } });

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Cómo querés pagar este pedido?" },
      action: { buttons },
    },
  };

  await callWhatsApp(payload);
}

// ¿Agregar más al pedido?
export async function sendOrderMoreButtons(to) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Querés agregar otro producto al pedido?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "order_more", title: "Sí, algo más" } },
          { type: "reply", reply: { id: "order_finish", title: "No, cerrar pedido" } },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// Confirmación de nombre
export async function sendNameConfirmButtons(to, name) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `¿Te llamás *${name}*?` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "name_yes", title: "Sí 👍" } },
          { type: "reply", reply: { id: "name_no", title: "No, cambiar" } },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// Confirmación de dirección
export async function sendAddressConfirmButtons(to, address) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `¿Confirmás esta dirección?\n\n📍 *${address}*` },
      footer: { text: "Si no es correcta, podés volver a escribirla." },
      action: {
        buttons: [
          { type: "reply", reply: { id: "addr_yes", title: "Sí, es correcta" } },
          { type: "reply", reply: { id: "addr_no", title: "No, cambiar" } },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// Día de entrega (igual que antes)
function isWorkingDay(date) {
  const d = date.getDay();
  return d >= 1 && d <= 5;
}

function getAvailableDeliveryDays() {
  const now = new Date();
  const hour = now.getHours();

  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const options = [];

  if (isWorkingDay(today) && hour < 18) {
    options.push({ id: "day_today", title: "Hoy" });
  }

  if (isWorkingDay(tomorrow)) {
    options.push({ id: "day_tomorrow", title: "Mañana" });
  }

  options.push({ id: "day_flexible", title: "Próximos días" });

  return options;
}

export async function sendDeliveryDayButtons(to) {
  const buttons = getAvailableDeliveryDays().map((opt) => ({
    type: "reply",
    reply: opt,
  }));

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          "¿Para qué día te gustaría recibir el pedido? (Es orientativo y puede ajustarse según el reparto) 🗓️",
      },
      action: { buttons },
    },
  };

  await callWhatsApp(payload);
}

// Rangos horarios
export async function sendDeliverySlotButtons(to, dayLabel = "") {
  const now = new Date();
  const hour = now.getHours();
  const isToday = dayLabel.toLowerCase().includes("hoy");

  const buttons = [];

  if (!(isToday && hour >= 12)) {
    buttons.push({ type: "reply", reply: { id: "slot_morning", title: "08 a 12 hs" } });
  }

  if (!(isToday && hour >= 16)) {
    buttons.push({ type: "reply", reply: { id: "slot_afternoon", title: "12 a 16 hs" } });
  }

  buttons.push({ type: "reply", reply: { id: "slot_late", title: "16 a 18 hs" } });

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          (dayLabel ? `Para *${dayLabel}*, ` : "") +
          "¿qué rango horario te viene mejor? (Es sugerido) ⏰",
      },
      action: { buttons },
    },
  };

  await callWhatsApp(payload);
}
