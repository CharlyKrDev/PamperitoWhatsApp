// src/modules/whatsApp/services/whatsApp.api.js
import dotenv from "dotenv";
dotenv.config();

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

// ---------- Menú de productos (lista) ----------

export async function sendProductMenu(to) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "🔥 Productos Pamperito",
      },
      body: {
        text: "Elegí qué querés pedir y después te pregunto la cantidad 😉",
      },
      footer: {
        text: "Podés agregar más de un producto en el mismo pedido.",
      },
      action: {
        button: "📋 Ver productos",
        sections: [
          {
            title: "Leñas",
            rows: [
              {
                id: "product_lenia_10kg",
                title: "🌲 Leña - bolsa 10kg",
                description: "Ideal para uso diario.",
              },
              {
                id: "product_lenia_20kg",
                title: "🌲 Leña - bolsa 20kg",
                description: "Más cantidad por bolsa.",
              },
            ],
          },
          {
            title: "Carbones",
            rows: [
              {
                id: "product_carbon_3kg",
                title: "🔥 Carbón - bolsa 3kg",
                description: "Para algo rápido y chico.",
              },
              {
                id: "product_carbon_4kg",
                title: "🔥 Carbón - bolsa 4kg",
                description: "Un poco más de fuego.",
              },
              {
                id: "product_carbon_5kg",
                title: "🔥 Carbón - bolsa 5kg",
                description: "El tamaño clásico del asado.",
              },
              {
                id: "product_carbon_10kg",
                title: "🔥 Carbón - bolsa 10kg",
                description: "Para varias comidas o eventos.",
              },
            ],
          },
          {
            title: "Otros",
            rows: [
              {
                id: "product_pack_alamo",
                title: "🪵 Pack Álamo",
                description: "Leña más suave para complementar.",
              },
              {
                id: "product_pastilla_encendido",
                title: "✨ Pastillas de encendido",
                description: "Por unidad, para arrancar el fuego fácil.",
              },
            ],
          },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// ---------- Botón para repetir último pedido ----------

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
            reply: {
              id: "repeat_last",
              title: "🔁 Repetir pedido",
            },
          },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// ---------- Método de pago ----------

export async function sendPaymentMethodButtons(
  to,
  { enableMp = true, enableCash = true } = {}
) {
  if (!enableMp && !enableCash) {
    enableMp = true;
    enableCash = true;
  }

  const buttons = [];

  if (enableMp) {
    buttons.push({
      type: "reply",
      reply: {
        id: "pay_mp",
        title: "💳 MercadoPago",
      },
    });
  }

  if (enableCash) {
    buttons.push({
      type: "reply",
      reply: {
        id: "pay_cash",
        title: "💵 Efectivo",
      },
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "¿Cómo querés pagar este pedido?",
      },
      action: {
        buttons,
      },
    },
  };

  await callWhatsApp(payload);
}

// ---------- ¿Querés agregar algo más? ----------

export async function sendOrderMoreButtons(to) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "¿Querés agregar otro producto al pedido?",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "order_more",
              title: "Sí, algo más",
            },
          },
          {
            type: "reply",
            reply: {
              id: "order_finish",
              title: "No, cerrar pedido",
            },
          },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// ---------- Confirmación de nombre ----------

export async function sendNameConfirmButtons(to, name) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `¿Te llamás *${name}*?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "name_yes",
              title: "Sí 👍",
            },
          },
          {
            type: "reply",
            reply: {
              id: "name_no",
              title: "No, cambiar",
            },
          },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// ---------- Confirmación de dirección ----------

export async function sendAddressConfirmButtons(to, address) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `¿Confirmás esta dirección de entrega?\n\n📍 *${address}*`,
      },
      footer: {
        text: "Si no es correcta, podés volver a escribirla.",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "addr_yes",
              title: "Sí, es correcta",
            },
          },
          {
            type: "reply",
            reply: {
              id: "addr_no",
              title: "No, cambiar",
            },
          },
        ],
      },
    },
  };

  await callWhatsApp(payload);
}

// ---------- Día de entrega ----------

// Helpers para lógica de días
function isWorkingDay(date) {
  const d = date.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
  return d >= 1 && d <= 5; // lunes a viernes
}

function getAvailableDeliveryDays() {
  const now = new Date();
  const hour = now.getHours();

  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const options = [];

  // HOY: si hoy es laboral y antes de las 18hs
  if (isWorkingDay(today) && hour < 18) {
    options.push({
      id: "day_today",
      title: "Hoy",
    });
  }

  // MAÑANA: si mañana es laboral (por eso domingo → mañana lunes SÍ)
  if (isWorkingDay(tomorrow)) {
    options.push({
      id: "day_tomorrow",
      title: "Mañana",
    });
  }

  // Siempre opción flexible
  options.push({
    id: "day_flexible",
    title: "Próximos días",
  });

  return options;
}

export async function sendDeliveryDayButtons(to) {
  const buttons = getAvailableDeliveryDays().map((opt) => ({
    type: "reply",
    reply: {
      id: opt.id,
      title: opt.title,
    },
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
      action: {
        buttons,
      },
    },
  };

  await callWhatsApp(payload);
}

// ---------- Rango horario de entrega ----------

export async function sendDeliverySlotButtons(to, dayLabel = "") {
  const now = new Date();
  const hour = now.getHours();
  const isToday = dayLabel.toLowerCase().includes("hoy");

  const buttons = [];

  // Mañana (08–12) solo si no es hoy con la mañana ya pasada
  if (!(isToday && hour >= 12)) {
    buttons.push({
      type: "reply",
      reply: {
        id: "slot_morning",
        title: "08 a 12 hs",
      },
    });
  }

  // Tarde (12–16) solo si no es hoy con la tarde ya muy justa
  if (!(isToday && hour >= 16)) {
    buttons.push({
      type: "reply",
      reply: {
        id: "slot_afternoon",
        title: "12 a 16 hs",
      },
    });
  }

  // Siempre dejamos la franja 16–18 como última opción
  buttons.push({
    type: "reply",
    reply: {
      id: "slot_late",
      title: "16 a 18 hs",
    },
  });

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          (dayLabel ? `Para *${dayLabel}*, ` : "") +
          "¿qué rango horario te viene mejor? (Es a modo sugerido) ⏰",
      },
      action: {
        buttons,
      },
    },
  };

  await callWhatsApp(payload);
}
