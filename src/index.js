import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import whatsappRouter from "./modules/whatsApp/routes/whatsapp.routes.js";
import mpRouter from "./modules/mercadoPago/routes/mp.routes.js";



const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health
app.get("/", (_req, res) => res.send("🔥 Pamperito Bot corriendo OK"));

// Webhooks
app.use("/", whatsappRouter);
app.use("/", mpRouter);

export default app;