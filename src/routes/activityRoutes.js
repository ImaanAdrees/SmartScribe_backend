import express from "express";
import {
  logActivity,
  getActivityLogs,
  getActivityStatistics,
  getTopUsers,
  getTopUsersBreakdown,
  getUsageData,
  getActivitySummary,
  getUserActivities,
} from "../controllers/activityControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes (protected)
router.post("/log", protect, logActivity);
router.get("/user/:userId", protect, getUserActivities);

// Admin routes
router.get("/logs", protect, adminOnly, getActivityLogs);
router.get("/stats", protect, adminOnly, getActivityStatistics);
router.get("/top-users", protect, adminOnly, getTopUsers);
router.get("/top-users-breakdown", protect, adminOnly, getTopUsersBreakdown);
router.get("/usage", protect, adminOnly, getUsageData);
router.get("/summary", protect, adminOnly, getActivitySummary);

export default router;
