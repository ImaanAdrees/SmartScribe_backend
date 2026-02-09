import mongoose from "mongoose";

const maintenanceSchema = new mongoose.Schema(
  {
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    maintenanceMessage: {
      type: String,
      default: "System is under maintenance. Please try again later.",
    },
    lastUpdateDate: {
      type: Date,
      default: Date.now,
    },
    systemVersion: {
      type: String,
      default: "2.4.1",
    },
    database: {
      type: String,
      default: "MONGODB",
    },

    // APK Versions Management
    apkVersions: [
      {
        version: {
          type: String,
          required: true,
        },
        releaseDate: {
          type: Date,
          default: Date.now,
        },
        features: [
          {
            type: String,
          },
        ],
        improvements: [
          {
            type: String,
          },
        ],
        bugFixes: [
          {
            type: String,
          },
        ],
        filePath: {
          type: String,
          required: true,
        },
        fileName: {
          type: String,
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // System Uptime & Info
    systemUptime: {
      type: String,
      default: "99.8%",
    },
    serverLoad: {
      type: String,
      default: "34%",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Maintenance", maintenanceSchema);
