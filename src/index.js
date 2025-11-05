import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";

import whatsappRouter from "./routes/whatsapp.router.js";
import mpRouter from "./routes/mp.router.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use("/webhook/whatsapp", whatsappRouter);
app.use("/webhook/mp", mpRouter);

app.get("/", (req, res) => res.send("🔥 Pamperito Bot corriendo OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
