// src/utils/calc.js
import fs from "fs";
import path from "path";

const CATALOG_FILE = path.resolve("src/db/catalog.json");

// --- Carga de catálogo ---

export function loadCatalog() {
  try {
    const raw = fs.readFileSync(CATALOG_FILE, "utf8");
    const data = JSON.parse(raw);
    return data || {};
  } catch (err) {
    console.error("[calc] Error cargando catálogo:", err.message);
    return {};
  }
}

// --- Helpers internos ---

/**
 * Extrae una cantidad "humana" del texto.
 * Ejemplos que debería entender:
 *  - "5 bolsas de leña 10kg"
 *  - "quiero 3x carbon 5kg"
 *  - "2 leña 20"
 */
function extractQuantity(lower) {
  // Primero intentamos cosas tipo "3x", "3 x"
  let match = lower.match(/(\d+)\s*x/);
  if (match) return Number(match[1]);

  // Después "5 bolsas", "5 bolsa", "5 u", "5 unidades"
  match = lower.match(/(\d+)\s*(bolsa|bolsas|u|unidad|unidades)\b/);
  if (match) return Number(match[1]);

  // Si no, el primer número que aparezca lo tomamos como cantidad
  match = lower.match(/(\d+)/);
  if (match) return Number(match[1]);

  // Default: 1 unidad
  return 1;
}

/**
 * Detecta el producto según las palabras clave del texto.
 * Soporta:
 *  - leña 10kg / 20kg
 *  - leña dura -> 20kg (compatibilidad)
 *  - leña blanda -> 10kg
 *  - carbón 3/4/5/10kg
 *  - pack álamo
 *  - pastilla de encendido
 */
function detectProductId(lower) {
  // Normalizamos algunas variantes
  const txt = lower
    .replace("le\u00f1a", "lenia") // ñ -> n
    .replace("á", "a")
    .replace("é", "e")
    .replace("í", "i")
    .replace("ó", "o")
    .replace("ú", "u");

  // PACK / OTROS
  if (txt.includes("alamo")) return "pack_alamo";
  if (txt.includes("pastilla")) return "pastilla_encendido";

  const hasLenia = txt.includes("lenia");
  const hasCarbon = txt.includes("carbon");

  // LEÑA: por peso
  if (hasLenia) {
    const has20 =
      txt.includes("20kg") || txt.includes("20 kg") || txt.includes("de 20");
    const has10 =
      txt.includes("10kg") || txt.includes("10 kg") || txt.includes("de 10");

    // Compatibilidad con "dura/blanda"
    const isDura = txt.includes("dura");
    const isBlanda = txt.includes("blanda");

    if (has20 || isDura) return "lenia_20kg";
    if (has10 || isBlanda) return "lenia_10kg";

    // Si solo dice "leña" y nada más, por ahora asumimos 10kg
    return "lenia_10kg";
  }

  // CARBÓN: por peso
  if (hasCarbon) {
    if (txt.includes("3kg") || txt.includes("3 kg") || txt.includes("de 3"))
      return "carbon_3kg";
    if (txt.includes("4kg") || txt.includes("4 kg") || txt.includes("de 4"))
      return "carbon_4kg";
    if (txt.includes("5kg") || txt.includes("5 kg") || txt.includes("de 5"))
      return "carbon_5kg";
    if (txt.includes("10kg") || txt.includes("10 kg") || txt.includes("de 10"))
      return "carbon_10kg";

    // Si solo dice carbón, sin peso, asumimos 5kg
    return "carbon_5kg";
  }

  // No se reconoció producto
  return null;
}

/**
 * Determina el precio unitario según cantidad y las reglas de Dante:
 * - 1 a 9 → precio 1_9
 * - 10 a 19 → precio 10_19
 * - 20 o más → precio 20_plus
 */
function getUnitPriceForQuantity(product, quantity) {
  if (!product || !product.pricing) return 0;
  const tiers = product.pricing;

  if (quantity >= 20) return tiers["20_plus"] ?? tiers["10_19"] ?? tiers["1_9"] ?? 0;
  if (quantity >= 10) return tiers["10_19"] ?? tiers["1_9"] ?? 0;
  return tiers["1_9"] ?? 0;
}

// --- API usada por el bot ---

/**
 * parseOrderText(text) -> { items: [{id,label,quantity,unit}], zone }
 *
 * Por ahora asumimos UN tipo de producto por mensaje,
 * pero ya devolvemos un array items por si más adelante
 * permitimos combos tipo "5 de leña 10kg y 3 de carbón 5kg".
 */
export function parseOrderText(text) {
  if (!text || typeof text !== "string") return null;

  const lower = text.toLowerCase();
  const catalog = loadCatalog();

  const productId = detectProductId(lower);
  if (!productId) {
    return {
      items: [],
      zone: "venado_tuerto"
    };
  }

  const product = catalog[productId];
  if (!product) {
    return {
      items: [],
      zone: "venado_tuerto"
    };
  }

  const quantity = extractQuantity(lower);

  return {
    items: [
      {
        id: product.id,
        label: product.label,
        quantity,
        unit: product.unit || "unidad"
      }
    ],
    // Por diseño actual: solo Venado Tuerto, sin costo extra
    zone: "venado_tuerto"
  };
}

/**
 * calcTotal(parsed) -> número
 *
 * Suma (precio_unitario_por_tramo * cantidad) para cada item.
 * No agrega costo de envío (entrega en Venado Tuerto sin costo).
 */
export function calcTotal(parsed) {
  if (!parsed || !Array.isArray(parsed.items)) return 0;

  const catalog = loadCatalog();
  let total = 0;

  for (const item of parsed.items) {
    const product = catalog[item.id];
    if (!product) continue;

    const qty = Number(item.quantity) || 1;
    const unitPrice = getUnitPriceForQuantity(product, qty);

    total += unitPrice * qty;
  }

  return total;
}
