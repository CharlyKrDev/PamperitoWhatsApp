// src/modules/whatsApp/controllers/whatsapp.controller.js
import dotenv from "dotenv";
dotenv.config();

import {
  sendButtons,
  sendTextMessage,
  sendOrderLink,
  sendRepeatButton,
} from "../services/whatsApp.api.js";
import { parseOrderText, calcTotal } from "../../../utils/calc.js";
import {
  persistOrder,
  createPreference,
  markPaid,
  getLastOrderByPhone,
} from "../../mercadoPago/services/mp.api.js";
import {
  getCustomerByPhone,
  upsertCustomer,
  updateCustomerLastOrder,
} from "../../customers/services/customers.api.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const ADMIN_PHONE = process.env.ADMIN_PHONE || null;

// Estado simple en memoria para manejar pasos (nombre, etc.)
const sessionState = new Map();

// Estado simple para detectar clientes con problemas
const troubleState = new Map();
const TROUBLE_THRESHOLD = 3;

// ---------- Helpers internos ----------

function extractMessage(body) {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  return message || null;
}

function getInteractiveButtonId(message) {
  if (message.type !== "interactive") return null;
  const interactive = message.interactive;
  if (interactive?.type === "button_reply") {
    return interactive.button_reply?.id || null;
  }
  return null;
}

function summarizeOrder(order) {
  if (!order) return "un pedido anterior";

  const { parsed } = order;
  const total =
    typeof order.total === "number" ? order.total : Number(order.total) || 0;

  if (!parsed || !Array.isArray(parsed.items)) {
    return `un pedido anterior por un total de $${total}`;
  }

  const itemsStr = parsed.items
    .map((item) => {
      const qty = item.quantity || 1;
      const label = item.label || item.id || "producto";
      return `${qty} x ${label}`;
    })
    .join(", ");

  const zoneStr = parsed.zone ? ` (zona: ${parsed.zone})` : "";

  return `${itemsStr}${zoneStr} por un total de $${total}`;
}

// 🆕 Registrar problema para un cliente y, si corresponde, avisar a Dante
async function registerTrouble(from, lastText) {
  const current = troubleState.get(from) || 0;
  const next = current + 1;
  troubleState.set(from, next);

  // Si todavía no llega al umbral, no hacemos nada especial
  if (next < TROUBLE_THRESHOLD) return false;

  // Llegó al umbral → avisamos al cliente y a Dante
  troubleState.delete(from);

  await sendTextMessage(
    from,
    "Estoy teniendo problemas para tomar tu pedido automáticamente 😅. En breve te va a contactar alguien del local para ayudarte."
  );

  if (ADMIN_PHONE) {
    const msg =
      `⚠ Cliente con dificultades para operar con el bot.\n\n` +
      `📞 Número: ${from}\n` +
      (lastText
        ? `📝 Último mensaje: "${lastText}"`
        : "") +
      `\n\nRevisá la conversación y, si hace falta, contactalo desde el número del negocio.`;
    await sendTextMessage(ADMIN_PHONE, msg);
  } else {
    console.warn(
      "[Trouble] ADMIN_PHONE no configurado. No se puede notificar a Dante."
    );
  }

  return true;
}

// 🆕 Maneja la repetición de pedido (texto "repetir" o botón) con precio dinámico
async function handleRepeatOrder(from) {
  const lastOrder = await getLastOrderByPhone(from);

  if (!lastOrder || !lastOrder.parsed) {
    await sendTextMessage(
      from,
      "Por ahora no tengo ningún pedido anterior tuyo para repetir. Podés hacer uno nuevo escribiendo qué leña querés o diciendo 'hola' para ver el menú."
    );
    return;
  }

  const parsed = lastOrder.parsed;

  // 🔥 Recalculamos total usando la lista de precios actual (catalog.json)
  const newTotal = calcTotal(parsed);

  const newOrder = await persistOrder({
    from,
    parsed,
    total: newTotal,
    status: "PENDING",
    meta: { source: "repeat_last", baseOrderId: lastOrder.id },
  });

  // guardamos último pedido en el perfil del cliente
  await updateCustomerLastOrder(from, newOrder.id);

  const summaryText = summarizeOrder(newOrder);

  await sendTextMessage(
    from,
    `Perfecto, repetimos tu último pedido con precios actualizados:\n\n${summaryText}\n\nGenerando el link de pago...`
  );

  const prefLink = await createPreference(newOrder.id, newTotal);
  await sendOrderLink(from, prefLink, newOrder.id);
}

// ---------- Verificación del webhook (GET) ----------

export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }

  console.warn("[WhatsApp] Verificación de webhook fallida");
  return res.sendStatus(403);
}

// ---------- Recepción de mensajes (POST) ----------

export async function receiveWebhook(req, res) {
  try {
    const body = req.body;

    if (!body || body.object !== "whatsapp_business_account") {
      return res.sendStatus(200);
    }

    const message = extractMessage(body);
    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const type = message.type;
    const btn = getInteractiveButtonId(message);

    let text = "";
    if (type === "text") {
      text = (message.text?.body || "").trim();
    } else if (type === "interactive") {
      text = (message.interactive?.button_reply?.title || "").trim();
    }

    const lower = text.toLowerCase();
    const state = sessionState.get(from);

    // -------- A) Flujo de captura de NOMBRE (cliente nuevo) --------
    if (state?.step === "ASK_NAME") {
      const raw = text.trim().toLowerCase();

      // Palabras comunes que no queremos tomar como nombre
      const blacklist = [
        "soy",
        "me",
        "llamo",
        "llamo.",
        "nombre",
        "es",
        "con",
        "hola",
        "buenas",
        "buenos",
        "dias",
        "día",
        "días",
        "tardes",
        "noches",
        "son",
        "buenos",
        "buen",
        "dia"
      ];

      let parts = raw.split(/[\s,;.!?]+/g).filter(Boolean);
      parts = parts.filter((p) => !blacklist.includes(p));

      const cleanedName = parts[0] || raw.split(/\s+/)[0] || "cliente";
      const name = cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1);

      await upsertCustomer({
        phone: from,
        name,
      });

      sessionState.delete(from);

      await sendTextMessage(
        from,
        `Gracias, *${name}* 😊 ¿En qué te puedo ayudar?`
      );
      await sendButtons(from);
      return res.status(200).end();
    }

    // -------- 1) Confirmación manual de pago: "pago ok pam-123456"
    if (lower.startsWith("pago ok pam-")) {
      const match = lower.match(/pago ok (pam-\d+)/i);
      const ref = match?.[1]?.toUpperCase();
      if (!ref) {
        await sendTextMessage(
          from,
          "No pude leer el número de pedido después de 'pago ok'. Probá de nuevo, por ejemplo: pago ok PAM-123456"
        );
        return res.sendStatus(200);
      }

      const updated = await markPaid(ref);
      if (!updated) {
        await sendTextMessage(
          from,
          `No encontré el pedido ${ref}. Verificá el número e intentá de nuevo.`
        );
        return res.sendStatus(200);
      }

      await sendTextMessage(
        from,
        `✔️ Pago aprobado. Tu pedido ${ref} fue confirmado. En breve coordinamos la entrega 🔥`
      );
      return res.sendStatus(200);
    }

    // -------- 2) Repetición de pedido: texto "repetir"
    if (lower === "repetir" || lower.includes("repetir pedido")) {
      await handleRepeatOrder(from);
      return res.sendStatus(200);
    }

    // -------- 3) Botón "repeat_last"
    if (btn === "repeat_last") {
      await handleRepeatOrder(from);
      return res.sendStatus(200);
    }

    // -------- 4) "hola" → cliente nuevo / registrado / frecuente
    if (lower.includes("hola")) {
      const customer = await getCustomerByPhone(from);
      const lastOrder = await getLastOrderByPhone(from);

      // Cliente nuevo (sin registro)
      if (!customer) {
        await sendTextMessage(
          from,
          "¡Hola! Soy el asistente de Pamperito 🔥 ¿Con quién tengo el gusto?\n\nDecime *solo tu nombre*, por ejemplo: *Carlos*"
        );
        sessionState.set(from, { step: "ASK_NAME" });
        return res.sendStatus(200);
      }

      // Cliente registrado
      const name = customer.name || "";

      if (lastOrder) {
        // recalculamos total con precios actuales SOLO para mostrar en el resumen
        const recalculatedTotal = calcTotal(lastOrder.parsed || {});
        const orderWithNewTotal = {
          ...lastOrder,
          total: recalculatedTotal,
        };
        const summary = summarizeOrder(orderWithNewTotal);

        await sendTextMessage(
          from,
          `Hola *${name}*, soy el asistente de Pamperito 🔥`
        );
        await sendRepeatButton(from, summary);
        await sendButtons(from);
        return res.sendStatus(200);
      }

      // Cliente registrado pero sin pedidos anteriores
      await sendTextMessage(
        from,
        `Hola *${name}*, soy el asistente de Pamperito 🔥. Usá el menú de abajo para ver opciones o escribí qué leña querés pedir.`
      );
      await sendButtons(from);
      return res.sendStatus(200);
    }

    // -------- 5) Botones del menú principal
    if (btn === "prices") {
      await sendTextMessage(
        from,
        "💸 Precios actuales:\n\n- Leña dura: $6000\n- Leña blanda: $5000\n- Carbón: $4500\n\nEstos valores pueden variar, consultá siempre ante la duda."
      );
      return res.sendStatus(200);
    }

    if (btn === "zones") {
      await sendTextMessage(
        from,
        "🚚 Zonas de envío:\n\n- Centro: $1500\n- Norte: $2000\n- Afuera: $3000\n\nDecime en qué zona estás para calcular bien el total."
      );
      return res.sendStatus(200);
    }

    if (btn === "make_order") {
      await sendTextMessage(
        from,
        "Perfecto, contame qué querés pedir. Ejemplo:\n\n`2x leña dura zona norte`"
      );
      return res.sendStatus(200);
    }

    // -------- 6) Pedido escrito (leña dura/blanda/carbón)
    if (type === "text") {
      const hasKeywords =
        lower.includes("dura") ||
        lower.includes("blanda") ||
        lower.includes("carbón") ||
        lower.includes("carbon");

      if (hasKeywords) {
        await sendTextMessage(from, "✅ Pedido recibido, procesando...");

        const parsed = parseOrderText(lower);
        if (!parsed || !parsed.items || parsed.items.length === 0) {
          // No lo entendió → lo contamos como problema
          const alreadyEscalated = await registerTrouble(from, text);
          if (!alreadyEscalated) {
            await sendTextMessage(
              from,
              "No pude entender el pedido. Probá con algo así:\n\n`2x leña dura zona norte`\n`1x carbón zona centro`"
            );
          }
          return res.sendStatus(200);
        }

        const total = calcTotal(parsed);

        const order = await persistOrder({
          from,
          parsed,
          total,
          status: "PENDING",
        });

        await updateCustomerLastOrder(from, order.id);

        const summary = summarizeOrder(order);

        await sendTextMessage(
          from,
          `Resumen de tu pedido:\n\n${summary}\n\nTotal estimado: $${total}`
        );

        const prefLink = await createPreference(order.id, total);
        await sendOrderLink(from, prefLink, order.id);

        return res.sendStatus(200);
      }
    }

    // -------- 7) Fallback (mensaje que no encaja en nada)
    const escalated = await registerTrouble(from, text);
    if (!escalated) {
      await sendTextMessage(
        from,
        `Recibí: "${text}".\n\nDecime *hola* para ver el menú, o escribí directamente algo como:\n\n\`2x leña dura zona norte\`\n\`1x carbón zona centro\``
      );
    }
    return res.sendStatus(200);
  } catch (err) {
    console.error("[WhatsApp] Error en receiveWebhook:", err);
    return res.sendStatus(500);
  }
}
