import Backup from "../models/Backup.js";
import { performBackup } from "./backupService.js";

/**
 * Checks for due backups and triggers them.
 */
export const checkAndRunBackups = async () => {
    try {
        const now = new Date();
        const backup = await Backup.findOne();
        
        if (!backup) return;

        let shouldRunBackup = false;
        let backupType = "automatic";

        // Check Auto-Backup
        if (backup.autoBackupEnabled && backup.nextScheduledBackup && now >= new Date(backup.nextScheduledBackup)) {
            console.log("[BackupScheduler] Auto-backup is due.");
            shouldRunBackup = true;
            backupType = "automatic";
        } 
        // Check One-time Scheduled Backup
        else if (!backup.autoBackupEnabled && backup.oneTimeBackupEnabled && backup.oneTimeScheduledBackup && now >= new Date(backup.oneTimeScheduledBackup)) {
            console.log("[BackupScheduler] One-time scheduled backup is due.");
            shouldRunBackup = true;
            backupType = "manual"; // Treating scheduled as manual in types? Or add "scheduled"
        }

        if (shouldRunBackup) {
            await performBackup(null, backupType);
        }
    } catch (error) {
        console.error("[BackupScheduler] Error checking backups:", error);
    }
};

/**
 * Starts the backup scheduler.
 */
export const startBackupScheduler = () => {
    console.log("[BackupScheduler] Initializing...");
    
    // Run once on start
    checkAndRunBackups();

    // Run every 30 minutes
    const INTERVAL = 30 * 60 * 1000;
    setInterval(checkAndRunBackups, INTERVAL);
    
    console.log(`[BackupScheduler] Scheduled to run every ${INTERVAL / (60 * 1000)} minutes.`);
};
