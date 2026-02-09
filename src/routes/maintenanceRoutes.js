import express from "express";
import {
  toggleMaintenanceMode,
  checkMaintenanceMode,
  uploadAPK,
  getAPKVersions,
  getLatestAPK,
  updateBackupConfig,
  getBackupConfig,
  triggerBackup,
  getSystemInfo,
  getUpdateHistory,
  getBackupHistory,
  deleteAPKVersion,
  getPublicAPKHistory,
} from "../controllers/maintenanceControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { apkUpload } from "../middleware/apkUploadMiddleware.js";

const router = express.Router();

// Public route - Check maintenance mode (for app)
router.get("/check-maintenance", checkMaintenanceMode);

// Admin-only routes (protected and admin verification required)

// Maintenance Mode Management
router.post("/toggle-mode", protect, adminOnly, toggleMaintenanceMode);

// APK Management
router.post("/upload-apk", protect, adminOnly, apkUpload.single("apk"), uploadAPK);
router.get("/apk-versions", protect, adminOnly, getAPKVersions);
router.get("/latest-apk", protect, adminOnly, getLatestAPK);
router.get("/latest-apk-public", getLatestAPK); // Public endpoint for app to check latest version
router.get("/public-apk-history", getPublicAPKHistory); // Public endpoint for demo page history
router.delete("/delete-apk/:versionId", protect, adminOnly, deleteAPKVersion);

// Backup Management
router.post("/update-backup-config", protect, adminOnly, updateBackupConfig);
router.get("/backup-config", protect, adminOnly, getBackupConfig);
router.post("/trigger-backup", protect, adminOnly, triggerBackup);
router.get("/backup-history", protect, adminOnly, getBackupHistory);

// System Information
router.get("/system-info", protect, adminOnly, getSystemInfo);
router.get("/update-history", protect, adminOnly, getUpdateHistory);

export default router;
