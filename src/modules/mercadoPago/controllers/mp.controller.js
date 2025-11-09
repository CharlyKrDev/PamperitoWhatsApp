// src/modules/mercadoPago/controllers/mp.controller.js
import "dotenv/config";
import { markPaid } from "../services/mp.api.js";
import { sendTextMessage } from "../../whatsApp/services/whatsapp.api.js";

export async function mpWebhook(req, res) {
  try {
    // Payload demo esperado:
    // { data: { status: "approved", external_reference: "PAM-123..." } }
    const status = req.body?.data?.status;
    const ref    = req.body?.data?.external_reference;

    if (status === "approved" && ref) {
      const order = markPaid(ref);
      if (order) {
        await sendTextMessage(
          order.from,
          `✔️ Pago aprobado. Pedido #${order.id} confirmado.\n` +
          `Coordinamos la entrega por este medio. 🙌`
        );
      }
    }
    return res.sendStatus(200);
  } catch (e) {
    console.error("Error en webhook MP:", e?.response?.data || e);
    return res.sendStatus(200);
  }
}
