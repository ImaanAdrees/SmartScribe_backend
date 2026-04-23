
import Backup from "../models/Backup.js";
import User from "../models/User.js";
import Transcription from "../models/Transcription.js";
import Summary from "../models/Summary.js";
import UserActivity from "../models/UserActivity.js";
import { getNextBackupDate } from "./backupUtils.js";
import path from "path";
import fs from "fs";
import { generateBackupReportPDF } from "./backupReportPdf.js";

/**
 * Performs the actual backup process.
 * currently simulating backup as per existing code.
 */
export const performBackup = async (
  triggeredBy = null,
  backupType = "automatic",
) => {
  try {
    let backup = await Backup.findOne();
    if (!backup) {
      backup = await Backup.create({});
    }

    const backupId = `backup-${Date.now()}`;
    const backupDate = new Date();

    // --- Gather stats for PDF ---
    const [totalUsers, totalTranscriptions, totalSummaries, totalExports, topUsers] = await Promise.all([
      User.countDocuments({}),
      Transcription.countDocuments({}),
      Summary.countDocuments({}),
      UserActivity.countDocuments({ action: { $in: ["Export PDF", "Export TXT"] } }),
      User.find({ isAdmin: { $ne: true } })
        .sort({ transcriptions: -1 })
        .limit(5)
        .select("name email transcriptions")
        .lean(),
    ]);

    // Prepare data for PDF
    const pdfData = {
      totalUsers,
      totalTranscriptions,
      totalSummaries,
      totalExports,
      topUsers: topUsers.map(u => ({
        name: u.name || "-",
        email: u.email,
        transcriptions: u.transcriptions || 0,
      })),
    };

    // --- Generate PDF ---
    const reportsDir = path.resolve("uploads/reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const pdfFileName = `${backupId}.pdf`;
    const pdfPath = path.join(reportsDir, pdfFileName);
    const logoPath = path.resolve("src/logo/mainlogo.png");

    await generateBackupReportPDF({
      outputPath: pdfPath,
      logoPath,
      data: pdfData,
      date: backupDate,
    });


    // Get PDF file size in human readable format
    let backupSize = '0B';
    try {
      const stats = fs.statSync(pdfPath);
      const bytes = stats.size;
      if (bytes < 1024) backupSize = `${bytes} B`;
      else if (bytes < 1024 * 1024) backupSize = `${(bytes / 1024).toFixed(2)} KB`;
      else if (bytes < 1024 * 1024 * 1024) backupSize = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      else backupSize = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } catch (e) {
      backupSize = 'Unknown';
    }

    // --- Store backup entry with PDF path and size ---
    const newBackup = {
      backupId,
      backupDate,
      backupSize,
      status: "completed",
      backupPath: `/backups/${backupId}`,
      triggeredBy,
      backupType,
      reportPdfPath: `/uploads/reports/${pdfFileName}`,
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
    console.log(`[BackupService] Backup ${backupId} completed successfully. PDF report generated.`);
    return newBackup;
  } catch (error) {
    console.error("[BackupService] Error performing backup:", error);
    throw error;
  }
};
