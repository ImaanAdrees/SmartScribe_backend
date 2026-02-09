import Backup from "../models/Backup.js";
import { getNextBackupDate } from "./backupUtils.js";

/**
 * Performs the actual backup process.
 * currently simulating backup as per existing code.
 */
export const performBackup = async (triggeredBy = null, backupType = "automatic") => {
  try {
    let backup = await Backup.findOne();
    if (!backup) {
      backup = await Backup.create({});
    }

    const backupId = `backup-${Date.now()}`;
    const backupDate = new Date();

    const newBackup = {
      backupId,
      backupDate,
      backupSize: "2.5GB", // Simulated size
      status: "completed",
      backupPath: `/backups/${backupId}`,
      triggeredBy,
      backupType,
    };

    backup.backupHistory.push(newBackup);
    backup.lastBackupDate = backupDate;

    // Refresh next scheduled backup if it's automatic
    if (backup.autoBackupEnabled) {
        const backupConfig = {
          backupTime: backup.backupTime,
          backupFrequency: backup.backupFrequency,
          backupDay: backup.backupDay,
        };
        backup.nextScheduledBackup = getNextBackupDate(backupConfig);
    }

    // If it was a one-time backup, disable it after completion
    if (backupType === "manual" && backup.oneTimeBackupEnabled) {
        backup.oneTimeBackupEnabled = false;
        backup.oneTimeScheduledBackup = null;
    }

    await backup.save();
    console.log(`[BackupService] Backup ${backupId} completed successfully.`);
    return newBackup;
  } catch (error) {
    console.error("[BackupService] Error performing backup:", error);
    throw error;
  }
};
