import path from "path";
import fs from "fs";
import Maintenance from "../models/Maintenance.js";
import Backup from "../models/Backup.js";
import { performBackup } from "../utils/backupService.js";
import { getNextBackupDate } from "../utils/backupUtils.js";
import { io } from "../../index.js";

// Initialize maintenance and backup records if not exist
export const initializeMaintenance = async () => {
  try {
    const maintenance = await Maintenance.findOne();
    if (!maintenance) {
      await Maintenance.create({});
    }

    const backup = await Backup.findOne();
    if (!backup) {
      const nextBackup = getNextBackupDate({
        backupTime: "02:00",
        backupFrequency: "daily",
        backupDay: "Sunday",
      });

      await Backup.create({
        nextScheduledBackup: nextBackup,
      });
    }
  } catch (error) {
    console.error("Error initializing maintenance:", error);
  }
};

// Toggle Maintenance Mode
export const toggleMaintenanceMode = async (req, res) => {
  try {
    const { maintenanceMode, maintenanceMessage } = req.body;

    let maintenance = await Maintenance.findOne();
    if (!maintenance) {
      maintenance = await Maintenance.create({});
    }

    maintenance.maintenanceMode = maintenanceMode;
    if (maintenanceMessage) {
      maintenance.maintenanceMessage = maintenanceMessage;
    }

    await maintenance.save();

    res.status(200).json({
      success: true,
      message: maintenanceMode
        ? "Maintenance mode activated"
        : "Maintenance mode deactivated",
      data: {
        maintenanceMessage: maintenance.maintenanceMessage,
      },
    });

    // Notify all connected clients
    if (io) {
      io.emit("maintenance_mode_changed", {
        maintenanceMode: maintenance.maintenanceMode,
        maintenanceMessage: maintenance.maintenanceMessage,
      });
    }
  } catch (error) {
    console.error("Error toggling maintenance mode:", error);
    res.status(500).json({
      success: false,
      message: "Error toggling maintenance mode",
      error: error.message,
    });
  }
};

// Check Maintenance Mode (for app)
export const checkMaintenanceMode = async (req, res) => {
  try {
    const maintenance = await Maintenance.findOne();

    if (!maintenance) {
      return res.status(200).json({
        maintenanceMode: false,
        maintenanceMessage: "",
      });
    }

    res.status(200).json({
      maintenanceMode: maintenance.maintenanceMode,
      maintenanceMessage: maintenance.maintenanceMessage,
    });
  } catch (error) {
    console.error("Error checking maintenance mode:", error);
    res.status(500).json({
      success: false,
      message: "Error checking maintenance mode",
      error: error.message,
    });
  }
};

// Upload APK
export const uploadAPK = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { version, features, improvements, bugFixes } = req.body;

    if (!version) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Version is required",
      });
    }

    let maintenance = await Maintenance.findOne();
    if (!maintenance) {
      maintenance = await Maintenance.create({});
    }

    const releaseDate = new Date(); // Auto-detect current day

    const newAPK = {
      version,
      releaseDate,
      features: features ? JSON.parse(features) : [],
      improvements: improvements ? JSON.parse(improvements) : [],
      bugFixes: bugFixes ? JSON.parse(bugFixes) : [],
      filePath: `/uploads/apk/${req.file.filename}`,
      fileName: req.file.originalname,
      uploadedAt: new Date(),
      uploadedBy: req.user._id,
    };

    maintenance.apkVersions.push(newAPK);
    maintenance.lastUpdateDate = new Date();
    maintenance.systemVersion = version;

    await maintenance.save();

    // Emit socket event for real-time update
    if (io) {
      io.emit("apk_list_updated");
    }

    // Return populated version
    await maintenance.populate("apkVersions.uploadedBy", "name email");

    res.status(201).json({
      success: true,
      message: "APK uploaded successfully",
      data: {
        apk: newAPK,
        lastUpdateDate: maintenance.lastUpdateDate,
        systemVersion: maintenance.systemVersion,
      },
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Error uploading APK:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading APK",
      error: error.message,
    });
  }
};

// Get All APK Versions
export const getAPKVersions = async (req, res) => {
  try {
    const maintenance = await Maintenance.findOne().populate(
      "apkVersions.uploadedBy",
      "name email"
    );

    if (!maintenance || !maintenance.apkVersions) {
      return res.status(200).json({
        success: true,
        data: [],
        totalVersions: 0,
      });
    }

    // Sort by upload date (newest first)
    const sortedVersions = maintenance.apkVersions.sort(
      (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
    );

    res.status(200).json({
      success: true,
      data: sortedVersions,
      totalVersions: sortedVersions.length,
    });
  } catch (error) {
    console.error("Error fetching APK versions:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching APK versions",
      error: error.message,
    });
  }
};

// Get Latest APK Version
export const getLatestAPK = async (req, res) => {
  try {
    const maintenance = await Maintenance.findOne().populate(
      "apkVersions.uploadedBy",
      "name email"
    );

    if (!maintenance || !maintenance.apkVersions || maintenance.apkVersions.length === 0) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No APK versions available",
      });
    }

    const latestAPK = maintenance.apkVersions.reduce((latest, current) => {
      return new Date(current.uploadedAt) > new Date(latest.uploadedAt)
        ? current
        : latest;
    });

    res.status(200).json({
      success: true,
      data: latestAPK,
    });
  } catch (error) {
    console.error("Error fetching latest APK:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching latest APK",
      error: error.message,
    });
  }
};

// Get Public APK History (Sorted by Newest First)
export const getPublicAPKHistory = async (req, res) => {
  try {
    const maintenance = await Maintenance.findOne().select("apkVersions");

    if (!maintenance || !maintenance.apkVersions || maintenance.apkVersions.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const sortedVersions = maintenance.apkVersions
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .map(apk => ({
        version: apk.version,
        features: apk.features,
        improvements: apk.improvements,
        bugFixes: apk.bugFixes,
        uploadedAt: apk.uploadedAt,
        releaseDate: apk.releaseDate,
        filePath: apk.filePath
      }));

    res.status(200).json({
      success: true,
      data: sortedVersions,
    });
  } catch (error) {
    console.error("Error fetching public APK history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching public APK history",
      error: error.message,
    });
  }
};

// Update Backup Configuration
export const updateBackupConfig = async (req, res) => {
  try {
    const { autoBackupEnabled, backupFrequency, backupTime, backupDay } =
      req.body;

    let backup = await Backup.findOne();
    if (!backup) {
      backup = await Backup.create({});
    }

    if (autoBackupEnabled !== undefined) {
      backup.autoBackupEnabled = autoBackupEnabled;
    }
    if (backupFrequency) {
      backup.backupFrequency = backupFrequency;
    }
    if (backupTime) {
      backup.backupTime = backupTime;
    }
    if (backupDay) {
      backup.backupDay = backupDay;
    }

    // Handle One-time Scheduled Backup
    if (req.body.oneTimeBackupEnabled !== undefined) {
      backup.oneTimeBackupEnabled = req.body.oneTimeBackupEnabled;
    }
    if (req.body.oneTimeScheduledBackup) {
      backup.oneTimeScheduledBackup = new Date(req.body.oneTimeScheduledBackup);
    }

    // Calculate next backup date
    if (backup.autoBackupEnabled) {
        const backupConfig = {
          backupTime: backup.backupTime,
          backupFrequency: backup.backupFrequency,
          backupDay: backup.backupDay,
        };
        backup.nextScheduledBackup = getNextBackupDate(backupConfig);
    } else if (backup.oneTimeBackupEnabled && backup.oneTimeScheduledBackup) {
        backup.nextScheduledBackup = backup.oneTimeScheduledBackup;
    } else {
        backup.nextScheduledBackup = null;
    }

    await backup.save();

    res.status(200).json({
      success: true,
      message: "Backup configuration updated",
      data: {
        backupConfig: {
          autoBackupEnabled: backup.autoBackupEnabled,
          backupFrequency: backup.backupFrequency,
          backupTime: backup.backupTime,
          backupDay: backup.backupDay,
          oneTimeBackupEnabled: backup.oneTimeBackupEnabled,
          oneTimeScheduledBackup: backup.oneTimeScheduledBackup,
        },
        nextScheduledBackup: backup.nextScheduledBackup,
      },
    });
  } catch (error) {
    console.error("Error updating backup config:", error);
    res.status(500).json({
      success: false,
      message: "Error updating backup configuration",
      error: error.message,
    });
  }
};

// Get Backup Configuration
export const getBackupConfig = async (req, res) => {
  try {
    let backup = await Backup.findOne();
    if (!backup) {
      backup = await Backup.create({});
    }

    res.status(200).json({
      success: true,
      data: {
        backupConfig: {
          autoBackupEnabled: backup.autoBackupEnabled,
          backupFrequency: backup.backupFrequency,
          backupTime: backup.backupTime,
          backupDay: backup.backupDay,
          oneTimeBackupEnabled: backup.oneTimeBackupEnabled,
          oneTimeScheduledBackup: backup.oneTimeScheduledBackup,
        },
        nextScheduledBackup: backup.nextScheduledBackup,
        lastBackupDate: backup.lastBackupDate,
      },
    });
  } catch (error) {
    console.error("Error fetching backup config:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching backup configuration",
      error: error.message,
    });
  }
};

// Trigger Manual Backup
export const triggerBackup = async (req, res) => {
  try {
    const newBackup = await performBackup(req.user._id, "manual");
    
    // Fetch updated backup config for nextScheduledBackup
    const backup = await Backup.findOne();

    res.status(200).json({
      success: true,
      message: "Backup triggered successfully",
      data: {
        backup: newBackup,
        nextScheduledBackup: backup.nextScheduledBackup,
      },
    });
  } catch (error) {
    console.error("Error triggering backup:", error);
    res.status(500).json({
      success: false,
      message: "Error triggering backup",
      error: error.message,
    });
  }
};

// Get System Information
export const getSystemInfo = async (req, res) => {
  try {
    let maintenance = await Maintenance.findOne();
    if (!maintenance) {
      maintenance = await Maintenance.create({});
    }

    let backup = await Backup.findOne();
    if (!backup) {
      backup = await Backup.create({});
    }

    const systemInfo = {
      version: maintenance.systemVersion,
      lastUpdate: maintenance.lastUpdateDate,
      uptime: maintenance.systemUptime,
      serverLoad: maintenance.serverLoad,
      database: maintenance.database,
      maintenanceMode: maintenance.maintenanceMode,
      lastBackupDate: backup.lastBackupDate,
      nextScheduledBackup: backup.autoBackupEnabled 
        ? backup.nextScheduledBackup 
        : (backup.oneTimeBackupEnabled ? backup.oneTimeScheduledBackup : null),
      backupConfig: {
        autoBackupEnabled: backup.autoBackupEnabled,
        backupFrequency: backup.backupFrequency,
        backupTime: backup.backupTime,
        backupDay: backup.backupDay,
        oneTimeBackupEnabled: backup.oneTimeBackupEnabled,
        oneTimeScheduledBackup: backup.oneTimeScheduledBackup,
      },
    };

    res.status(200).json({
      success: true,
      data: systemInfo,
    });
  } catch (error) {
    console.error("Error fetching system info:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching system information",
      error: error.message,
    });
  }
};

// Get Update History
export const getUpdateHistory = async (req, res) => {
  try {
    const maintenance = await Maintenance.findOne().populate(
      "apkVersions.uploadedBy",
      "name email"
    );

    if (!maintenance || !maintenance.apkVersions) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const updateHistory = maintenance.apkVersions
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
      .map((apk) => ({
        id: apk._id,
        version: apk.version,
        date: apk.releaseDate,
        description: `Version ${apk.version} released`,
        improvements: apk.improvements,
        type: apk.improvements.length > 0 ? "Minor" : (apk.bugFixes.length > 0 ? "Patch" : "No changes"),
        features: apk.features,
        bugFixes: apk.bugFixes,
      }));

    res.status(200).json({
      success: true,
      data: updateHistory,
      totalUpdates: updateHistory.length,
    });
  } catch (error) {
    console.error("Error fetching update history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching update history",
      error: error.message,
    });
  }
};

// Get Backup History
export const getBackupHistory = async (req, res) => {
  try {
    const backup = await Backup.findOne().populate(
      "backupHistory.triggeredBy",
      "name email"
    );

    if (!backup || !backup.backupHistory) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const backupHistory = backup.backupHistory.sort(
      (a, b) => new Date(b.backupDate) - new Date(a.backupDate)
    );

    res.status(200).json({
      success: true,
      data: backupHistory,
      totalBackups: backupHistory.length,
    });
  } catch (error) {
    console.error("Error fetching backup history:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching backup history",
      error: error.message,
    });
  }
};

// Delete APK Version
export const deleteAPKVersion = async (req, res) => {
  try {
    const { versionId } = req.params;

    const maintenance = await Maintenance.findOne();
    if (!maintenance) {
      return res.status(404).json({
        success: false,
        message: "Maintenance record not found",
      });
    }

    const apkIndex = maintenance.apkVersions.findIndex(
      (apk) => apk._id.toString() === versionId
    );

    if (apkIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "APK version not found",
      });
    }

    const apk = maintenance.apkVersions[apkIndex];

    // Delete the file
    const filePath = path.join(process.cwd(), apk.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    maintenance.apkVersions.splice(apkIndex, 1);
    await maintenance.save();

    // Emit socket event for real-time update
    if (io) {
      io.emit("apk_list_updated");
    }

    res.status(200).json({
      success: true,
      message: "APK version deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting APK version:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting APK version",
      error: error.message,
    });
  }
};
