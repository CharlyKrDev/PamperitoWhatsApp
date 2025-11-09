// src/modules/whatsApp/controllers/whatsapp.controller.js
import "dotenv/config";
import { sendTextMessage, sendButtons, sendOrderLink } from "../services/whatsapp.api.js";
import { parseOrderText, calcTotal } from "../../../utils/calc.js";
import { createPreference, persistOrder, markPaid } from "../../mercadoPago/services/mp.api.js";
import { sleep } from "../../../utils/helpers.js";

/** Verificación inicial del Webhook (Meta) */
export function verifyWebhook(req, res) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token === verifyToken) return res.status(200).send(challenge);
  return res.status(403).send("❌ Verificación fallida");
}

/** Entrada de mensajes desde Meta */
export async function receiveWebhook(req, res) {
  try {
    const body = req.body;
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    if (!from) return res.sendStatus(200);

    const type = message?.type;
    const text = message?.text?.body?.toLowerCase?.() || "";
    const btn  = message?.interactive?.button_reply?.id;

    // 0) Confirmación manual: "pago ok PAM-123..."
    if (type === "text" && /^pago ok\s+pam-\d+/i.test(text)) {
      const orderId = text.match(/(pam-\d+)/i)?.[1].toUpperCase();
      const order = markPaid(orderId);
      if (order) {
        await sendTextMessage(
          from,
          `✔️ Pago aprobado. Pedido #${order.id} confirmado.\n` +
          `Te escribimos en breve para coordinar la entrega. 🔥`
        );
      } else {
        await sendTextMessage(from, `No encontré la orden ${orderId}. Revisá el ID del resumen.`);
      }
      return res.sendStatus(200);
    }

    // 1) “hola” → menú con botones
    if (type === "text" && text.includes("hola")) {
      await sendButtons(from);
      return res.sendStatus(200);
    }

    // 2) Botones
    if (btn === "prices") {
      await sendTextMessage(
        from,
        "💰 Precios:\n• Leña dura $6000/b\n• Leña blanda $5000/b\n• Carbón $4500/b"
      );
      return res.sendStatus(200);
    }
    if (btn === "zones") {
      await sendTextMessage(
        from,
        "🚚 Zonas: Centro $1500 | Norte $2000 | Afuera $3000.\nDecime tu barrio para calcular."
      );
      return res.sendStatus(200);
    }
    if (btn === "make_order") {
      await sendTextMessage(from, "🪵 Escribí el pedido (ej: dura x2, zona centro).");
      return res.sendStatus(200);
    }

    // 3) Texto con pedido
    if (type === "text" && /(dura|blanda|carbón|carbon)/i.test(text)) {
      await sendTextMessage(from, "✅ Pedido recibido. Procesando…");
      await sleep(300);

      const parsed = parseOrderText(text);
      if (!parsed.items.length) {
        await sendTextMessage(from, "No entendí el pedido. Ej: 'dura x2, zona centro'.");
        return res.sendStatus(200);
      }

      const total = calcTotal(parsed);
      const order = persistOrder({ from, parsed, total, status: "PENDING" });

      // Sin MP: puede retornar null (modo demo)
      const link = await createPreference(order.id, total);

      const resumen = [
        "🧾 *Resumen de pedido*",
        `• Ítems: ${parsed.items.map(i => `${i.id.replace("lenia_","leña ")} x${i.qty}`).join(", ")}`,
        `• Zona: ${parsed.zone}`,
        `• Total: $${total}`
      ].join("\n");

      await sendTextMessage(from, resumen);
      await sleep(250);

      await sendOrderLink(from, link, order.id); // maneja link null y sin preview
      return res.sendStatus(200);
    }

    // 4) Fallback
    await sendTextMessage(from, `Recibí: "${text || btn || type}". Decime "hola" para ver el menú.`);
    return res.sendStatus(200);
  } catch (err) {
    console.error("Error procesando webhook:", err?.response?.data || err);
    return res.sendStatus(200);
  }
}
