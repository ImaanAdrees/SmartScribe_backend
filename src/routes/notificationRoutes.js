import express from "express";
import {
  createNotification,
  getRecipientCount,
  listNotifications,
  getUserNotifications,
  markNotificationAsRead,
  deleteUserNotification,
} from "../controllers/notificationControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes (must come before admin routes to be matched first)
router.get("/user/list", protect, getUserNotifications);
router.put("/:notificationId/read", protect, markNotificationAsRead);
router.delete("/:notificationId", protect, deleteUserNotification);

// Admin routes
router.get("/", protect, adminOnly, listNotifications);
router.get("/recipients", protect, adminOnly, getRecipientCount);
router.post("/", protect, adminOnly, createNotification);

export default router;
