import express from "express";
import { sendTextMessage } from "../services/whatsapp.service.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// 👉 Verificación inicial del Webhook
router.get("/", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === verifyToken) {
    console.log("✅ Webhook verificado correctamente");
    return res.status(200).send(challenge);
  } else {
    return res.status(403).send("❌ Verificación fallida");
  }
});

// 👉 Recepción de mensajes
router.post("/", async (req, res) => {
  try {
    const data = req.body;

    if (data.object) {
      const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from; // número del usuario
      const text = message?.text?.body || "";

      console.log(`📩 Mensaje recibido de ${from}: ${text}`);

      // Respuesta simple de ejemplo
      await sendTextMessage(from, `🔥 Hola! Soy el bot de Pamperito. Recibí tu mensaje: "${text}"`);

      return res.sendStatus(200);
    }
  } catch (err) {
    console.error("Error procesando webhook:", err);
    res.sendStatus(500);
  }
});

export default router;
