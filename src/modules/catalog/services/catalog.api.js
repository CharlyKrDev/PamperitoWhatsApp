// src/modules/catalog/services/catalog.api.js
import postgres from "postgres";

const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null;

// 🔹 Catálogo de fallback (plan B) en memoria
//    Lo usamos si no hay DB o si la consulta falla.
const seedCatalog = {
  lenia_10kg: {
    id: "lenia_10kg",
    label: "Leña - bolsa 10kg",
    unit: "bolsa",
    pricing: {
      "1_9": 6000,
      "10_19": 5000,
      "20_plus": 4000,
    },
  },
  lenia_20kg: {
    id: "lenia_20kg",
    label: "Leña - bolsa 20kg",
    unit: "bolsa",
    pricing: {
      "1_9": 10000,
      "10_19": 9000,
      "20_plus": 7000,
    },
  },
  carbon_3kg: {
    id: "carbon_3kg",
    label: "Carbón - bolsa 3kg",
    unit: "bolsa",
    pricing: {
      "1_9": 3000,
      "10_19": 2700,
      "20_plus": 2400,
    },
  },
  carbon_4kg: {
    id: "carbon_4kg",
    label: "Carbón - bolsa 4kg",
    unit: "bolsa",
    pricing: {
      "1_9": 4000,
      "10_19": 3700,
      "20_plus": 3000,
    },
  },
  carbon_5kg: {
    id: "carbon_5kg",
    label: "Carbón - bolsa 5kg",
    unit: "bolsa",
    pricing: {
      "1_9": 5000,
      "10_19": 4700,
      "20_plus": 3500,
    },
  },
  carbon_10kg: {
    id: "carbon_10kg",
    label: "Carbón - bolsa 10kg",
    unit: "bolsa",
    pricing: {
      "1_9": 10000,
      "10_19": 8500,
      "20_plus": 7000,
    },
  },
  pack_alamo: {
    id: "pack_alamo",
    label: "Pack Álamo x unidad",
    unit: "unidad",
    pricing: {
      "1_9": 1500,
      "10_19": 1300,
      "20_plus": 1100,
    },
  },
  pastilla_encendido: {
    id: "pastilla_encendido",
    label: "Pastilla de encendido x unidad",
    unit: "unidad",
    pricing: {
      "1_9": 150,
      "10_19": 130,
      "20_plus": 100,
    },
  },
};

let sql = null;

if (DB_URL) {
  sql = postgres(DB_URL, { ssl: "require" });
} else {
  console.warn(
    "[Catalog] No hay SUPABASE_DB_URL / DATABASE_URL; usando catálogo seed en memoria."
  );
}

export async function loadCatalog() {
  // Si no hay conexión configurada, devolvemos directamente el seed.
  if (!sql) {
    return seedCatalog;
  }

  try {
    const rows = await sql`
      SELECT
        id,
        label,
        unit,
        price_1_9,
        price_10_19,
        price_20_plus,
        is_active
      FROM catalog_items
      WHERE is_active = true
      ORDER BY sort_order ASC, id ASC
    `;

    if (!rows.length) {
      console.warn(
        "[Catalog] catalog_items está vacío; usando catálogo seed en memoria."
      );
      return seedCatalog;
    }

    const catalog = {};
    for (const r of rows) {
      catalog[r.id] = {
        id: r.id,
        label: r.label,
        unit: r.unit,
        pricing: {
          "1_9": r.price_1_9 != null ? Number(r.price_1_9) : 0,
          "10_19": r.price_10_19 != null ? Number(r.price_10_19) : 0,
          "20_plus": r.price_20_plus != null ? Number(r.price_20_plus) : 0,
        },
      };
    }

    return catalog;
  } catch (e) {
    console.error(
      "[Catalog] Error leyendo catalog_items; usando catálogo seed:",
      e.message || e
    );
    return seedCatalog;
  }
}
