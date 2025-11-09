// src/modules/mercadoPago/routes/mp.router.js
import { Router } from "express";
import bodyParser from "body-parser";
import { mpWebhook } from "../controllers/mp.controller.js";


const router = Router();
router.use(bodyParser.json());

router.post("/webhook/mp", mpWebhook);

export default router;
