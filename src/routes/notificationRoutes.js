import express from "express";
import { createNotification, getRecipientCount, listNotifications } from "../controllers/notificationControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, adminOnly, listNotifications);
router.get("/recipients", protect, adminOnly, getRecipientCount);
router.post("/", protect, adminOnly, createNotification);

export default router;
