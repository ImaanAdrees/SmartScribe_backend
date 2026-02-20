import mongoose from "mongoose";

const backupSchema = new mongoose.Schema(
  {
    // Backup Configuration
    autoBackupEnabled: {
      type: Boolean,
      default: true,
    },
    backupFrequency: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "daily",
    },
    backupTime: {
      type: String,
      default: "02:00", // HH:mm format
    },
    backupDay: {
      type: String,
      enum: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      default: "Sunday", // for weekly backups
    },

    // One-time Scheduled Backup (When autoBackupEnabled is false)
    oneTimeBackupEnabled: {
      type: Boolean,
      default: false,
    },
    oneTimeScheduledBackup: {
      
      type: Date,
    },


    // Backup History
    backupHistory: [
      {
        backupId: {
          type: String,
          required: true,
        },
        backupDate: {
          type: Date,
          default: Date.now,
        },
        backupSize: {
          type: String, // Store as string like "1.5GB"
        },
        status: {
          type: String,
          enum: ["completed", "failed", "in-progress"],
          default: "completed",
        },
        backupPath: {
          type: String,
        },
        triggeredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        backupType: {
          type: String,
          enum: ["manual", "automatic"],
          default: "automatic",
        },
      },
    ],

    lastBackupDate: {
      type: Date,
    },
    nextScheduledBackup: {
      type: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Backup", backupSchema);
