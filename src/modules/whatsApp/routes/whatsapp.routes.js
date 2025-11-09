import { Router } from "express";
import { verifyWebhook, receiveWebhook } from "../controllers/whatsapp.controller.js";

const router = Router();
router.get("/webhook/whatsapp", verifyWebhook);
router.post("/webhook/whatsapp", receiveWebhook);

export default router;
