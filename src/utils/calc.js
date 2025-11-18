// utils/calc.js
import { loadCatalog as loadCatalogFromDb } from "../modules/catalog/services/catalog.api.js";

// 🔹 Calcula precio unitario según cantidad y catálogo (sin ir a la BD)
export function getUnitPriceFromCatalog(catalog, productId, quantity) {
  const item = catalog[productId];
  if (!item || !item.pricing) return 0;

  const q = Number(quantity) || 1;
  const pricing = item.pricing;

  if (q >= 20 && pricing["20_plus"] != null) return pricing["20_plus"];
  if (q >= 10 && pricing["10_19"] != null) return pricing["10_19"];
  return pricing["1_9"] ?? 0;
}

// 🔹 Versión async para usar desde cualquier parte sin preocuparse del catálogo
//    Firma compatible con lo que usabas en mp.api: getUnitPrice(productId, quantity)
export async function getUnitPrice(productId, quantity) {
  const catalog = await loadCatalogFromDb();
  return getUnitPriceFromCatalog(catalog, productId, quantity);
}

// 🔹 Versión "async" de calcTotal que ya se encarga de traer el catálogo
export async function calcTotal(parsed) {
  const catalog = await loadCatalogFromDb();
  return calcTotalWithCatalog(catalog, parsed);
}

// 🔹 Versión pura, por si alguna vez tenés el catálogo ya cargado
export function calcTotalWithCatalog(catalog, parsed) {
  if (!parsed || !Array.isArray(parsed.items)) return 0;

  let total = 0;
  for (const item of parsed.items) {
    const qty = Number(item.quantity) || 1;
    const unitPrice = getUnitPriceFromCatalog(catalog, item.id, qty);
    total += unitPrice * qty;
  }
  return total;
}
