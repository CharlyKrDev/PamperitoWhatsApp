// src/modules/whatsApp/controllers/whatsapp.controller.js
import dotenv from "dotenv";
dotenv.config();

import {
  sendButtons,
  sendTextMessage,
  sendAdminOrderStatusButtons,
  sendOrderLink,
  sendRepeatButton,
  sendProductMenu,
  sendPaymentMethodButtons,
  sendOrderMoreButtons,
  sendNameConfirmButtons,
  sendAddressConfirmButtons,
  sendDeliveryDayButtons,
  sendDeliverySlotButtons,
} from "../services/whatsapp.api.js";
import { loadPaymentSettings } from "../../settings/settings.service.js";
import { loadCatalog } from "../../catalog/services/catalog.api.js";

import { calcTotal } from "../../../utils/calc.js";

import {
  persistOrder,
  createPreference,
  markPaid,
  getLastOrderByPhone,
  updateOrderStatus,
} from "../../mercadoPago/services/mp.api.js";

import {
  getCustomerByPhone,
  upsertCustomer,
  updateCustomerLastOrder,
} from "../../customers/services/customers.api.js";

import { blacklist } from "../constants/blackList.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Estado en memoria (simple) para pasos del flujo
export const sessionState = new Map();
/*
shape aproximado:

{
  step: "ASK_NAME" | "CONFIRM_NAME" |
        "CART_IDLE" | "ASK_QTY_PRODUCT" | "ASK_MORE" |
        "ASK_ADDRESS" | "CONFIRM_ADDRESS" |
        "ASK_DELIVERY_DAY" | "ASK_DELIVERY_SLOT" |
        "ASK_PAYMENT_METHOD",
  tempName: string,
  cartItems: [...],
  productId: string,
  pendingParsed: { items, zone },
  pendingTotal: number,
  tempAddress: string,
  deliveryDayKey: string,
  deliveryDayLabel: string,
  deliverySlotKey: string,
  deliverySlotLabel: string,
  lastOrderId: string,
  lastTotal: number,
  lastParsed: any,
  lastUpdated: number,
  nudged: boolean,
}
*/

// Para detectar clientes con problemas
const troubleState = new Map();
const TROUBLE_THRESHOLD = 3;

async function getAdminPhone() {
  const settings = await loadPaymentSettings();
  return settings.admin_phone || null;
}

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

  if (interactive?.type === "list_reply") {
    return interactive.list_reply?.id || null;
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

  const addrStr = parsed.address ? `\n📍 Dirección: ${parsed.address}` : "";

  let deliveryStr = "";
  if (parsed.delivery) {
    const d = parsed.delivery;
    const dayLabel = d.dayLabel || d.day || "";
    const slotLabel = d.slotLabel || d.slot || "";
    if (dayLabel || slotLabel) {
      deliveryStr = `\n🚚 Entrega sugerida: ${dayLabel || ""}${
        dayLabel && slotLabel ? " - " : ""
      }${slotLabel || ""}`;
    }
  }

  return `${itemsStr}${zoneStr} por un total de $${total}${addrStr}${deliveryStr}`;
}

async function registerTrouble(from, lastText) {
  const current = troubleState.get(from) || 0;
  const next = current + 1;
  troubleState.set(from, next);

  if (next < TROUBLE_THRESHOLD) return false;

  troubleState.delete(from);

  await sendTextMessage(
    from,
    "Estoy teniendo problemas para tomar tu pedido automáticamente 😅. En breve te va a contactar alguien del local para ayudarte."
  );
  const adminPhone = await getAdminPhone();
  if (adminPhone) {
    const msg =
      `⚠ Cliente con dificultades para operar con el bot.\n\n` +
      `📞 Número: ${from}\n` +
      (lastText ? `📝 Último mensaje: "${lastText}"` : "") +
      `\n\nRevisá la conversación y, si hace falta, contactalo desde el número del negocio.`;
    await sendTextMessage(adminPhone, msg);
  } else {
    console.warn(
      "[Trouble] ADMIN_PHONE no configurado. No se puede notificar a Dante."
    );
  }

  return true;
}

// Helper para setear estado de sesión con timestamp
export function setSessionState(from, patch) {
  const prev = sessionState.get(from) || {};

  sessionState.set(from, {
    ...prev,
    ...patch,
    lastUpdated: Date.now(),
    nudged: patch.nudged ?? prev.nudged ?? false,
  });
}

export function clearSessionState(from) {
  sessionState.delete(from);
}

// Repetir pedido → rehace carrito y vuelve a pedir dirección / día / horario / pago
async function handleRepeatOrder(from) {
  const lastOrder = await getLastOrderByPhone(from);

  if (
    !lastOrder ||
    !lastOrder.parsed ||
    !Array.isArray(lastOrder.parsed.items) ||
    !lastOrder.parsed.items.length
  ) {
    await sendTextMessage(
      from,
      "Por ahora no tengo ningún pedido anterior tuyo para repetir. Podés hacer uno nuevo usando el menú."
    );
    return;
  }

  const baseParsed = lastOrder.parsed;
  const items = baseParsed.items;
  const zone = baseParsed.zone || "Venado Tuerto";

  const parsedPreview = { items, zone };
  const totalPreview = await calcTotal(parsedPreview);
  const previewOrder = { parsed: parsedPreview, total: totalPreview };
  const summaryText = summarizeOrder(previewOrder);

  await sendTextMessage(
    from,
    `Perfecto, repetimos tu último pedido con precios actualizados:\n\n${summaryText}\n\nAntes de confirmar, necesito la dirección de entrega 📍.\n\nEscribí la dirección completa (calle, número, barrio si aplica).\n\nSi querés cancelar y volver al inicio, escribí *cancelar*.`
  );

  setSessionState(from, {
    step: "ASK_ADDRESS",
    cartItems: items,
    pendingParsed: parsedPreview,
    pendingTotal: totalPreview,
  });
}

// 👉 Helper para obtener el nombre del negocio desde la config
async function getBusinessName() {
  try {
    const settings = await loadPaymentSettings();
    return settings.business_name || "Pamperito";
  } catch (err) {
    console.error("[Settings] Error cargando business_name:", err);
    return "Pamperito";
  }
}

// ---- Admin: cambio de estado por texto ----
async function handleAdminCommands({ from, text }) {
  // Comandos soportados:
  //  - "envio PAM-123..." / "envío PAM-123..."
  //  - "envio 123..." (solo números, sin PAM- → se completa solo)
  //  - "entregado PAM-123..."
  //  - "entregado 123..."

  const trimmed = (text || "").trim();

  let targetStatus = null;
  let match = null;

  // 1) Comando "envio <id>" o "envío <id>" o "en camino <id>"
  match =
    trimmed.match(/env[ií]o\s+([A-Za-z0-9\-]+)/i) ||
    trimmed.match(/en\s+camino\s+([A-Za-z0-9\-]+)/i);

  if (match) {
    targetStatus = "IN_DELIVERY";
  } else {
    // 2) Comando "entregado <id>"
    match = trimmed.match(/entregado\s+([A-Za-z0-9\-]+)/i);
    if (match) {
      targetStatus = "DELIVERED";
    }
  }

  // Si no matchea ningún comando → dejamos que el flujo normal maneje el mensaje
  if (!targetStatus || !match) {
    return false;
  }

  // Normalizamos el ID del pedido
  let rawId = (match[1] || "").trim();
  let orderId;

  if (/^\d+$/.test(rawId)) {
    // Si puso solo números → armamos PAM-<números>
    orderId = `PAM-${rawId}`;
  } else {
    // Si puso algo tipo pam-123, Pam-123 → lo pasamos a mayúsculas
    orderId = rawId.toUpperCase();
  }

  return await processAdminStatusChange({ from, orderId, targetStatus });
}

// ---- Admin: cambio de estado por botones ----
async function handleAdminButtons({ from, btnId }) {
  // IDs de botones:
  //  - "admin:in_delivery:PAM-123..."
  //  - "admin:delivered:PAM-123..."

  const parts = (btnId || "").split(":");
  if (parts.length < 3 || parts[0] !== "admin") {
    return false;
  }

  const action = parts[1];
  const orderId = parts.slice(2).join(":"); // por si el ID tuviera ":"

  let targetStatus = null;
  if (action === "in_delivery") {
    targetStatus = "IN_DELIVERY";
  } else if (action === "delivered") {
    targetStatus = "DELIVERED";
  } else {
    return false;
  }

  return await processAdminStatusChange({ from, orderId, targetStatus });
}

// ---- Admin: aplica cambio de estado y notifica ----
async function processAdminStatusChange({ from, orderId, targetStatus }) {
  // 1) Actualizamos estado en la DB
  let order;
  try {
    order = await updateOrderStatus(orderId, targetStatus);
  } catch (err) {
    console.error("[Admin] Error en updateOrderStatus:", err);
    await sendTextMessage(
      from,
      "Hubo un error al actualizar el estado del pedido 🤕. Probá de nuevo en un momento."
    );
    return true;
  }

  if (!order) {
    await sendTextMessage(
      from,
      `No encontré ningún pedido con ID *${orderId}* ❌.\nRevisá el código e intentá de nuevo.`
    );
    return true;
  }

  // 2) Obtenemos datos del negocio y del cliente
  const businessName = await getBusinessName();
  const safeBusiness = businessName || "Pamperito";

  let customer = null;
  if (order.from) {
    try {
      customer = await getCustomerByPhone(order.from);
    } catch (err) {
      console.warn(
        "[Admin] No se pudo cargar customer para notificar estado:",
        err
      );
    }
  }

  // 3) Notificamos al cliente (si tenemos teléfono)
  if (order.from) {
    const lines = [];

    lines.push("¡Hola! 👋");
    lines.push(`Te escribimos de *${safeBusiness}*.`);

    if (targetStatus === "IN_DELIVERY") {
      lines.push(`Tu pedido *${order.id}* ya está *en camino* 🚚.`);
    } else if (targetStatus === "DELIVERED") {
      lines.push(`Tu pedido *${order.id}* fue marcado como *entregado* ✅.`);
    }

    if (order.total != null) {
      lines.push(`Total: $${order.total}`);
    }

    lines.push("");
    lines.push("¡Muchas gracias por tu compra! 😊");

    await sendTextMessage(order.from, lines.join("\n"));
  }

  // 4) Confirmación al admin
  const customerName = customer?.name || null;
  const customerLabel =
    customerName && order.from
      ? `${customerName} (${order.from})`
      : order.from || customerName || "cliente no identificado";

  let statusLabel;
  if (targetStatus === "IN_DELIVERY") statusLabel = "EN CAMINO";
  else if (targetStatus === "DELIVERED") statusLabel = "ENTREGADO";
  else statusLabel = targetStatus;

  let adminMsg =
    `Listo ✅. El pedido *${order.id}* ahora figura como *${statusLabel}*.\n` +
    `Cliente: ${customerLabel}`;

  if (order.total != null) {
    adminMsg += `\nTotal: $${order.total}`;
  }

  if (order.from) {
    adminMsg += `\nSe envió notificación automática al cliente.`;
  } else {
    adminMsg += `\nNo se pudo notificar al cliente (no hay teléfono asociado).`;
  }

  await sendTextMessage(from, adminMsg);

  return true;
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
      text =
        (message.interactive?.button_reply?.title ||
          message.interactive?.list_reply?.title ||
          "").trim();
    }

    const lower = text.toLowerCase();
    const state = sessionState.get(from);

    // ---- MODO ADMIN: comandos especiales (envio / entregado) ----
    const adminPhone = await getAdminPhone();
    if (adminPhone && from === adminPhone) {
      // 1) Primero intentamos ver si tocó un botón
      if (btn && btn.startsWith("admin:")) {
        const handledBtn = await handleAdminButtons({ from, btnId: btn });
        if (handledBtn) {
          return res.sendStatus(200);
        }
      }

      // 2) Si no fue botón, probamos comandos por texto (envio / entregado)
      const handledText = await handleAdminCommands({ from, text });
      if (handledText) {
        return res.sendStatus(200);
      }
      // Si no fue ni botón ni comando, sigue el flujo normal del bot (sin timeout especial)
    }

    // === COMANDO GLOBAL: CANCELAR ===
    if (lower === "cancelar" || lower === "cancelar pedido") {
      clearSessionState(from);

      await sendTextMessage(
        from,
        "Listo, cancelé el pedido en curso 🙂. Volvemos al menú principal."
      );
      await sendButtons(from);
      return res.sendStatus(200);
    }

    // -------- A) Flujo de captura de NOMBRE (cliente nuevo) --------
    if (state?.step === "ASK_NAME") {
      const raw = text.trim().toLowerCase();

      // cortamos en espacios/puntuación
      let parts = raw.split(/[\s,;.!?]+/g).filter(Boolean);

      // normalizamos a minúsculas
      parts = parts.map((p) => p.toLowerCase());

      // filtramos usando la blacklist (también en minúsculas)
      parts = parts.filter((p) => !blacklist.includes(p));

      // si no queda nada → no entendimos el nombre, pedimos de nuevo
      if (!parts.length) {
        setSessionState(from, { step: "ASK_NAME" });
        await sendTextMessage(
          from,
          'No llegué a entender tu nombre 😅.\n\nProbá escribiendo *solo tu nombre*, sin frases como "soy" o "me llamo".\nEjemplo: *Cristian*'
        );
        return res.status(200).end();
      }

      // usamos el primer token válido como nombre
      const cleanedName = parts[0];
      const capitalized =
        cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1);

      setSessionState(from, {
        step: "CONFIRM_NAME",
        tempName: capitalized,
      });

      await sendNameConfirmButtons(from, capitalized);
      return res.status(200).end();
    }

    // -------- A.1) Confirmación de nombre --------
    if (state?.step === "CONFIRM_NAME") {
      if (btn === "name_yes") {
        const name = state.tempName || "Cliente";

        await upsertCustomer({
          phone: from,
          name,
        });

        clearSessionState(from);

        const businessName = await getBusinessName();

        await sendTextMessage(
          from,
          `Perfecto, *${name}* 😊 ¿En qué te puedo ayudar en ${businessName}?`
        );
        await sendButtons(from);
        return res.sendStatus(200);
      }

      if (btn === "name_no") {
        // Volvemos a pedir el nombre
        setSessionState(from, { step: "ASK_NAME" });
        await sendTextMessage(
          from,
          "Ok, decime de nuevo cómo querés que te llame 🙂.\n\nEscribí *solo tu nombre*, por ejemplo: *Cristian*"
        );
        return res.sendStatus(200);
      }
    }

    // -------- B) Cantidad luego de elegir producto --------

    if (state?.step === "ASK_QTY_PRODUCT") {
      const qtyMatch = lower.match(/(\d+)/);
      if (!qtyMatch) {
        await sendTextMessage(
          from,
          "Necesito que me digas cuántas unidades querés, por ejemplo: 5"
        );
        return res.sendStatus(200);
      }

      const quantity = Number(qtyMatch[1]) || 1;
      const catalog = await loadCatalog();
      const product = catalog[state.productId];

      if (!product) {
        clearSessionState(from);
        await sendTextMessage(
          from,
          "No pude encontrar el producto. Probá de nuevo desde el menú principal diciendo *hola*."
        );
        return res.sendStatus(200);
      }

      const prevItems = state.cartItems || [];

      const newItem = {
        id: product.id,
        label: product.label,
        quantity,
        unit: product.unit || "unidad",
      };

      const newItems = [...prevItems, newItem];

      const parsedPreview = {
        items: newItems,
        zone: "Venado Tuerto",
      };

      const totalPreview = await calcTotal(parsedPreview);
      const previewOrder = {
        parsed: parsedPreview,
        total: totalPreview,
      };

      const summary = summarizeOrder(previewOrder);

      await sendTextMessage(from, `Por ahora tu pedido es:\n\n${summary}`);

      setSessionState(from, {
        step: "ASK_MORE",
        cartItems: newItems,
      });

      await sendOrderMoreButtons(from);
      return res.sendStatus(200);
    }

    // -------- C) Dirección de entrega --------

    if (state?.step === "ASK_ADDRESS") {
      const addr = text.trim();
      if (!addr) {
        await sendTextMessage(
          from,
          "Necesito que me indiques la dirección completa de entrega 📍.\nPor ejemplo: *San Martín 1234, barrio Centro*."
        );
        return res.sendStatus(200);
      }

      setSessionState(from, {
        ...state,
        step: "CONFIRM_ADDRESS",
        tempAddress: addr,
      });

      await sendAddressConfirmButtons(from, addr);
      return res.sendStatus(200);
    }

    if (state?.step === "CONFIRM_ADDRESS") {
      if (btn === "addr_yes") {
        setSessionState(from, {
          ...state,
          step: "ASK_DELIVERY_DAY",
        });

        await sendDeliveryDayButtons(from);
        return res.sendStatus(200);
      }

      if (btn === "addr_no") {
        setSessionState(from, {
          ...state,
          step: "ASK_ADDRESS",
          tempAddress: undefined,
        });

        await sendTextMessage(
          from,
          "No hay problema 🙂. Escribime de nuevo la dirección completa de entrega."
        );
        return res.sendStatus(200);
      }
    }

    // -------- D) Día y rango horario sugeridos --------

    if (state?.step === "ASK_DELIVERY_DAY") {
      if (
        btn === "day_today" ||
        btn === "day_tomorrow" ||
        btn === "day_flexible"
      ) {
        const today = new Date(
          new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
          })
        );

        const formatShort = (d) =>
          d.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            timeZone: "America/Argentina/Buenos_Aires",
          });

        let dayLabel;

        if (btn === "day_today") {
          dayLabel = `Hoy (${formatShort(today)})`;
        } else if (btn === "day_tomorrow") {
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          dayLabel = `Mañana (${formatShort(tomorrow)})`;
        } else {
          dayLabel = "Próximos días (flexible)";
        }

        setSessionState(from, {
          ...state,
          step: "ASK_DELIVERY_SLOT",
          deliveryDayKey: btn,
          deliveryDayLabel: dayLabel,
        });

        await sendDeliverySlotButtons(from, dayLabel);
        return res.sendStatus(200);
      }
    }

    if (state?.step === "ASK_DELIVERY_SLOT") {
      if (
        btn === "slot_morning" ||
        btn === "slot_afternoon" ||
        btn === "slot_late"
      ) {
        const slotLabels = {
          slot_morning: "08:00 a 12:00 hs",
          slot_afternoon: "12:00 a 16:00 hs",
          slot_late: "16:00 a 18:00 hs",
        };

        const slotLabel = slotLabels[btn] || "";

        const {
          cartItems,
          pendingParsed,
          pendingTotal,
          tempAddress,
          deliveryDayKey,
          deliveryDayLabel,
        } = state || {};

        if (!cartItems || !cartItems.length || !pendingParsed) {
          clearSessionState(from);
          await sendTextMessage(
            from,
            "Se perdió la información del pedido. Probá de nuevo diciendo *hola*."
          );
          return res.sendStatus(200);
        }

        const parsed = {
          ...pendingParsed,
          address: tempAddress,
          delivery: {
            day: deliveryDayKey,
            dayLabel: deliveryDayLabel,
            slot: btn,
            slotLabel,
          },
        };

        const total = pendingTotal ?? (await calcTotal(parsed));

        const order = await persistOrder({
          from,
          parsed,
          total,
          status: "PENDING",
          meta: { paymentMethod: "PENDING" },
        });

        // Actualizamos también la ficha del cliente con dirección y zona
        await updateCustomerLastOrder(from, order.id, {
          address: parsed.address || null,
          zone: parsed.zone || null,
        });

        const summary = summarizeOrder(order);

        await sendTextMessage(
          from,
          `Resumen final de tu pedido:\n\n${summary}\n\nRecordá que el día y horario de entrega son *orientativos* y pueden ajustarse según el reparto.`
        );

        // Guardamos estado para el paso de pago (incluyendo el parsed)
        setSessionState(from, {
          step: "ASK_PAYMENT_METHOD",
          lastOrderId: order.id,
          lastTotal: total,
          lastParsed: parsed,
        });

        // ⬇️ Config del dashboard + regla de fallback
        const paymentSettings = await loadPaymentSettings();

        let enableMp = paymentSettings.enableMp;
        let enableCash = paymentSettings.enableCash;

        // Nunca ambas apagadas → si pasa, forzamos efectivo
        if (!enableMp && !enableCash) {
          enableCash = true;
        }

        await sendPaymentMethodButtons(from, {
          enableMp,
          enableCash,
        });

        return res.sendStatus(200);
      }
    }

    // -------- 1) Confirmación manual de pago --------

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

    // -------- 2) Repetición de pedido --------

    if (lower === "repetir" || lower.includes("repetir pedido")) {
      await handleRepeatOrder(from);
      return res.sendStatus(200);
    }

    if (btn === "repeat_last") {
      await handleRepeatOrder(from);
      return res.sendStatus(200);
    }

    // -------- 3) "hola" → cliente nuevo / registrado / frecuente --------

    if (lower.includes("hola")) {
      const businessName = await getBusinessName();
      const customer = await getCustomerByPhone(from);
      const lastOrder = await getLastOrderByPhone(from);

      if (!customer) {
        await sendTextMessage(
          from,
          `¡Hola! Soy el asistente de ${businessName} 🔥 ¿Con quién tengo el gusto?\n\nDecime *solo tu nombre*, por ejemplo: *Cristian*`
        );
        setSessionState(from, { step: "ASK_NAME" });
        return res.sendStatus(200);
      }

      const name = customer.name || "";

      if (lastOrder) {
        const recalculatedTotal = await calcTotal(lastOrder.parsed || {});
        const orderWithNewTotal = {
          ...lastOrder,
          total: recalculatedTotal,
        };
        const summary = summarizeOrder(orderWithNewTotal);

        await sendTextMessage(
          from,
          `Hola *${name}*, soy el asistente de ${businessName} 🔥`
        );
        await sendRepeatButton(from, summary);
        await sendButtons(from);
        return res.sendStatus(200);
      }

      await sendTextMessage(
        from,
        `Hola *${name}*, soy el asistente de ${businessName} 🔥. Usá el menú de abajo para ver opciones y hacer tu pedido.`
      );
      await sendButtons(from);
      return res.sendStatus(200);
    }

    // -------- 4) Botones del menú principal --------

    if (btn === "prices") {
      const catalog = await loadCatalog();

      const lines = Object.values(catalog).map((p) => {
        const pr = p.pricing || {};
        const p1 = pr["1_9"] ?? "-";
        const p2 = pr["10_19"] ?? "-";
        const p3 = pr["20_plus"] ?? "-";
        return [
          `🔥 *${p.label}*`,
          `   • 1–9 u.:    $${p1}`,
          `   • 10–19 u.:  $${p2}`,
          `   • 20+ u.:    $${p3}`,
        ].join("\n");
      });

      const msg =
        "💸 *Lista de productos y precios Pamperito*\n\n" +
        lines.join("\n\n") +
        "\n\n📌 Los precios pueden actualizarse. Ante cualquier duda, escribinos por acá 😉";

      await sendTextMessage(from, msg);
      return res.sendStatus(200);
    }

    if (btn === "zones") {
      await sendTextMessage(
        from,
        "🚚 *Zonas de entrega*\n\nRealizamos entregas únicamente dentro de *Venado Tuerto*.\n\n🕗 *Horarios*: Lunes a Viernes\n⏰ *08:00 a 18:00 hs*\n💵 *Sin costo adicional*."
      );
      return res.sendStatus(200);
    }

    if (btn === "make_order") {
      setSessionState(from, {
        step: "CART_IDLE",
        cartItems: [],
      });

      await sendTextMessage(
        from,
        "Perfecto, empecemos por el producto 🔥. Elegí qué querés pedir:\n\nSi en algún momento querés volver al inicio, escribí *cancelar*."
      );
      await sendProductMenu(from);
      return res.sendStatus(200);
    }

    // -------- 5) Selección de producto desde la lista --------

    if (btn && btn.startsWith("product_")) {
      const productId = btn.replace("product_", "");

      const catalog = await loadCatalog();
      const product = catalog[productId];

      if (!product) {
        await sendTextMessage(
          from,
          "No pude identificar el producto. Probá de nuevo desde el menú principal diciendo *hola*."
        );
        return res.sendStatus(200);
      }

      const prevState = sessionState.get(from) || { cartItems: [] };

      setSessionState(from, {
        step: "ASK_QTY_PRODUCT",
        productId,
        cartItems: prevState.cartItems || [],
      });

      await sendTextMessage(
        from,
        `Elegiste *${product.label}*.\n\nDecime cuántas unidades querés, por ejemplo: 5`
      );
      return res.sendStatus(200);
    }

    // -------- 6) Método de pago --------

    if (btn === "pay_mp") {
      const st = sessionState.get(from);
      if (!st?.lastOrderId || !st?.lastParsed) {
        await sendTextMessage(
          from,
          "No encontré un pedido pendiente para pagar. Probá de nuevo diciendo *hola*."
        );
        return res.sendStatus(200);
      }

      const prefLink = await createPreference(st.lastOrderId, st.lastTotal);
      await sendOrderLink(from, prefLink, st.lastOrderId);

      // Notificamos al admin
      const customer = await getCustomerByPhone(from);
      const orderForAdmin = {
        id: st.lastOrderId,
        from,
        parsed: st.lastParsed,
        total: st.lastTotal,
        meta: { paymentMethod: "MercadoPago (PENDIENTE)" },
      };
      await notifyAdminNewOrder(orderForAdmin, customer);

      // Mensaje de despedida
      await sendTextMessage(
        from,
        "🔥 Gracias por confiar en Pamperito.\nCualquier cosa que necesites, estamos por acá 😉"
      );

      clearSessionState(from);
      return res.sendStatus(200);
    }

    if (btn === "pay_cash") {
      const st = sessionState.get(from);
      if (!st?.lastOrderId || !st?.lastParsed) {
        await sendTextMessage(
          from,
          "No encontré un pedido pendiente para pagar. Probá de nuevo diciendo *hola*."
        );
        return res.sendStatus(200);
      }

      await sendTextMessage(
        from,
        "Perfecto, dejamos registrado que pagás en *efectivo* al momento de la entrega 💵."
      );

      // Notificamos al admin
      const customer = await getCustomerByPhone(from);
      const orderForAdmin = {
        id: st.lastOrderId,
        from,
        parsed: st.lastParsed,
        total: st.lastTotal,
        meta: { paymentMethod: "Efectivo (AL ENTREGAR)" },
      };
      await notifyAdminNewOrder(orderForAdmin, customer);

      // Mensaje de despedida
      await sendTextMessage(
        from,
        "🔥 Gracias por comprar en Pamperito.\nCuando quieras volver a pedir, mandanos un mensaje 😉"
      );

      clearSessionState(from);
      return res.sendStatus(200);
    }

    // -------- 7) ¿Querés agregar algo más? --------

    if (btn === "order_more") {
      const st = sessionState.get(from);
      const cartItems = st?.cartItems || [];

      setSessionState(from, {
        step: "CART_IDLE",
        cartItems,
      });

      await sendTextMessage(from, "Genial, agreguemos otro producto 🔥");
      await sendProductMenu(from);
      return res.sendStatus(200);
    }

    if (btn === "order_finish") {
      const st = sessionState.get(from);
      const cartItems = st?.cartItems || [];

      if (!cartItems.length) {
        clearSessionState(from);
        await sendTextMessage(
          from,
          "No encontré productos en tu pedido. Probá de nuevo desde el menú diciendo *hola*."
        );
        return res.sendStatus(200);
      }

      const parsed = {
        items: cartItems,
        zone: "Venado Tuerto",
      };

      const total = await calcTotal(parsed);
      const previewOrder = { parsed, total };
      const summary = summarizeOrder(previewOrder);

      await sendTextMessage(
        from,
        `Resumen final de tu pedido:\n\n${summary}\n\nAntes de confirmar, necesito la dirección de entrega 📍.\n\nEscribí la dirección completa (calle, número, barrio si aplica).`
      );

      setSessionState(from, {
        step: "ASK_ADDRESS",
        cartItems,
        pendingParsed: parsed,
        pendingTotal: total,
      });

      return res.sendStatus(200);
    }

    // -------- 8) Casos de texto simple útiles (zona de envío) --------

    if (type === "text" && lower.includes("zona") && lower.includes("env")) {
      await sendTextMessage(
        from,
        "🚚 *Zonas de entrega*\n\nRealizamos entregas únicamente dentro de *Venado Tuerto*.\n\n🕗 *Horarios*: Lunes a Viernes\n⏰ *08:00 a 18:00 hs*\n💵 *Sin costo adicional*."
      );
      return res.sendStatus(200);
    }

    // -------- 9) Fallback --------

    const escalated = await registerTrouble(from, text);
    if (!escalated) {
      await sendTextMessage(
        from,
        `Recibí: "${text}".\n\nPara hacer un pedido, decime *hola* y usá el menú de botones.`
      );
    }
    return res.sendStatus(200);
  } catch (err) {
    console.error("[WhatsApp] Error en receiveWebhook:", err);
    return res.sendStatus(500);
  }
}

//---- Helper para notificar al Admin de la compra ---//
async function notifyAdminNewOrder(order, customer) {
  const adminPhone = await getAdminPhone();
  if (!adminPhone) return;

  const adminLines = [];

  adminLines.push("🧾 *Nuevo pedido recibido*");
  adminLines.push("");
  adminLines.push(`ID: *${order.id}*`);

  const name = customer?.name || "No registrado";
  adminLines.push(`Cliente: ${name}`);

  adminLines.push(`WhatsApp: ${order.from || "desconocido"}`);

  if (order.total != null) {
    adminLines.push(`Total: $${order.total}`);
  }

  if (order.meta?.paymentMethod) {
    adminLines.push(`Medio de pago: ${order.meta.paymentMethod}`);
  }

  adminLines.push("");
  adminLines.push("Elegí una acción para este pedido:");

  await sendAdminOrderStatusButtons(
    adminPhone,
    adminLines.join("\n"),
    order.id
  );
}
