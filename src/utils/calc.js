import fs from "fs";

const CATALOG_FILE = "src/db/catalog.json";

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
}

export function parseOrderText(text) {
  // ejemplo entrada: "dura x2, centro" ó "carbon x1 zona norte"
  const lower = text.toLowerCase();
  const items = [];
  const zone = /centro|norte|afuera/.exec(lower)?.[0] || "centro";

  const map = {
    dura: "lenia_dura",
    "leña dura": "lenia_dura",
    blanda: "lenia_blanda",
    "leña blanda": "lenia_blanda",
    carbon: "carbon",
    carbón: "carbon"
  };

  const qtyMatch = /x\s*(\d+)/.exec(lower);
  const qty = qtyMatch ? Number(qtyMatch[1]) : 1;

  const prod =
    lower.includes("dura") ? "lenia_dura" :
    lower.includes("blanda") ? "lenia_blanda" :
    (lower.includes("carbon") || lower.includes("carbón")) ? "carbon" : null;

  if (prod) items.push({ id: prod, qty });

  return { items, zone };
}

export function calcTotal(parsed) {
  const catalog = loadCatalog();
  const priceById = Object.fromEntries(catalog.map(c => [c.id, c.price]));
  const base = parsed.items.reduce((acc, it) => acc + (priceById[it.id] || 0) * it.qty, 0);
  const shipping =
    parsed.zone === "centro" ? 1500 :
    parsed.zone === "norte" ? 2000 :
    3000;
  return base + shipping;
}
