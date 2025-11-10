import fs from "fs";
import path from "path";

const dst = path.resolve("src/db/catalog.json");
const src = path.resolve("db/seeds/catalog.seed.json");

fs.copyFileSync(src, dst);
console.log("✅ Seed catalog.json copiado a src/db/catalog.json");
