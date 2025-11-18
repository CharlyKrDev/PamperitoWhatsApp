// src/modules/mercadoPago/controllers/mp.controller.js
import "dotenv/config";
import axios from "axios";
import { markPaid } from "../services/mp.api.js";
import { sendTextMessage } from "../../whatsApp/services/whatsapp.api.js";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || null;
const ADMIN_PHONE = process.env.ADMIN_PHONE || null;

// Para evitar procesar dos veces el mismo pago (webhooks duplicados)
const processedPayments = new Set();

export async function mpWebhook(req, res) {
  try {
    // MP puede mandar la info en query o en body según el tipo de evento
    const topic =
      req.query.topic ||
      req.query.type ||
      req.body?.topic ||
      req.body?.type ||
      null;

    const paymentId =
      req.query["data.id"] ||
      req.body?.data?.id ||
      req.body?.data?.payment?.id ||
      null;

    console.log("[MP Webhook] Incoming:", { topic, paymentId });

    // Ignoramos todo lo que no sea "payment"
    if (topic !== "payment") {
      console.log("[MP Webhook] Evento ignorado:", { topic, paymentId });
      return res.sendStatus(200);
    }

    if (!paymentId) {
      console.warn("[MP Webhook] Sin paymentId, no se puede procesar.");
      return res.sendStatus(200);
    }

    if (!MP_ACCESS_TOKEN) {
      console.warn(
        "[MP Webhook] MP_ACCESS_TOKEN no configurado, no se consulta el pago."
      );
      return res.sendStatus(200);
    }

    // 🔁 Idempotencia: si ya procesamos este pago, lo ignoramos
    if (processedPayments.has(paymentId)) {
      console.log(
        "[MP Webhook] Pago ya procesado, ignorando duplicado:",
        paymentId
      );
      return res.sendStatus(200);
    }

    // Lo marcamos como procesado
    processedPayments.add(paymentId);

    // Consultamos el pago a la API de MP para obtener status y external_reference
    const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
    });

    const payment = resp.data || {};
    const status = payment.status;
    const orderId = payment.external_reference || null;

    console.log("[MP Webhook] Pago recibido:", {
      paymentId,
      status,
      orderId,
    });

    // Solo nos interesa cuando está aprobado y tenemos referencia de orden
    if (status !== "approved" || !orderId) {
      return res.sendStatus(200);
    }

    const order = await markPaid(orderId, {
      mpPaymentId: paymentId,
      rawPayment: payment,
    });

    if (!order) {
      console.warn(
        "[MP Webhook] No se encontró la orden para marcar como pagada:",
        orderId
      );
      return res.sendStatus(200);
    }

    // Mensaje al cliente
    await sendTextMessage(
      order.from,
      `✅ *Pago aprobado*\n\n` +
        `Tu pedido *${order.id}* quedó confirmado 🔥\n` +
        `Lo vamos a entregar en la dirección y rango horario que elegiste.\n\n` +
        `Gracias por confiar en Pamperito. Cualquier cosa, escribinos por acá 😉`
    );

    // Avisamos también al admin que el pago quedó aprobado
    if (ADMIN_PHONE) {
      const totalTxt =
        typeof order.total === "number"
          ? order.total
          : Number(order.total) || 0;

      await sendTextMessage(
        ADMIN_PHONE,
        `✅ *Pago aprobado por MercadoPago*\n\n` +
          `Pedido: *${order.id}*\n` +
          `Cliente: ${order.from || "teléfono desconocido"}\n` +
          (totalTxt ? `Total: $${totalTxt}\n` : "") +
          `Estado: PAGADO`
      );
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error(
      "[MP Webhook] Error:",
      e?.response?.data || e?.message || e
    );
    // devolvemos 200 igual para que MP no se quede reintentando en loop
    return res.sendStatus(200);
  }
}
