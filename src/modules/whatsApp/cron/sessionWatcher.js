// src/modules/whatsApp/cron/sessionWatcher.js
import {
  sessionState,
  setSessionState,
  clearSessionState,
} from "../controllers/whatsapp.controller.js";
import { sendTextMessage } from "../services/whatsapp.api.js";
import { getCustomerByPhone } from "../../customers/services/customers.api.js";

// Cada cuánto corre el watcher
const TICK_MS = 60 * 1000; // 1 minuto

// Timeouts
const NUDGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos → enviar recordatorio
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos → expirar sesión

export function startSessionWatcher() {
  console.log(
    `[SessionWatcher] Iniciado. Tick cada ${TICK_MS / 1000} segundos.`
  );

  setInterval(async () => {
    try {
      const now = Date.now();

      for (const [from, state] of sessionState.entries()) {
        if (!state) continue;

        const last = state.lastUpdated ?? now;
        const elapsed = now - last;

        // 1) Sesión vencida → la borramos y avisamos
        if (elapsed >= SESSION_TIMEOUT_MS) {
          await handleSessionExpired(from);
          continue;
        }

        // 2) Nudge si pasaron 5 minutos y todavía no se envió
        if (!state.nudged && elapsed >= NUDGE_TIMEOUT_MS) {
          await handleSessionNudge(from);
          continue;
        }
      }
    } catch (err) {
      console.error("[SessionWatcher] Error en ciclo:", err);
    }
  }, TICK_MS);
}

async function handleSessionExpired(from) {
  clearSessionState(from);

  try {
    await sendTextMessage(
      from,
      "El pedido anterior quedó vencido porque pasó mucho tiempo sin respuesta 😊.\n" +
        "Si querés hacer un nuevo pedido, podés decirme *hola* y arrancamos de cero."
    );
  } catch (err) {
    console.error("[SessionWatcher] Error al enviar mensaje de expiración:", err);
  }
}

async function handleSessionNudge(from) {
  let name = null;
  try {
    const customer = await getCustomerByPhone(from);
    name = customer?.name || null;
  } catch (err) {
    console.warn("[SessionWatcher] No se pudo cargar customer:", err);
  }

  const hi = name ? `Hola *${name}*` : "Hola";

  try {
    await sendTextMessage(
      from,
      `${hi}, noté que dejaste un pedido a medias 🧾.\n` +
        "Si querés seguirlo, podés responder donde lo dejaste.\n" +
        "Si preferís cancelarlo y empezar de nuevo, escribí *cancelar* en cualquier momento."
    );

    // Marcamos que ya nudgemos
    setSessionState(from, { nudged: true });
  } catch (err) {
    console.error("[SessionWatcher] Error al enviar nudge:", err);
  }
}
