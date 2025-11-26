// src/modules/settings/settings.service.js
import sql from "../../db/postgres.js";

export async function loadPaymentSettings() {
  try {
    const rows = await sql`
      SELECT
        business_name,
        admin_phone,
        enable_mp,
        enable_cash
      FROM bot_settings
      WHERE id = '1'
      LIMIT 1;
    `;

    if (!rows.length) {
      return {
        business_name: "Pamperito",
        admin_phone: null,
        enableMp: true,
        enableCash: true,
      };
    }

    const row = rows[0];

    return {
      business_name: row.business_name || "Pamperito",
      admin_phone: row.admin_phone || null,
      enableMp: row.enable_mp ?? true,
      enableCash: row.enable_cash ?? true,
    };
  } catch (err) {
    console.error("[Settings] Error cargando config:", err);
    return {
      business_name: "Pamperito",
      admin_phone: null,
      enableMp: true,
      enableCash: true,
    };
  }
}