import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GRAPH_BASE = process.env.META_GRAPH_BASE;
const VERSION = process.env.META_GRAPH_VERSION;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

export async function sendTextMessage(to, message) {
  try {
    const url = `${GRAPH_BASE}/${VERSION}/${PHONE_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    };

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`📤 Mensaje enviado a ${to}: ${message}`);
  } catch (err) {
    console.error("❌ Error enviando mensaje:", err.response?.data || err.message);
  }
}
