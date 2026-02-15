import mongoose from "mongoose";

const userActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
    userName: {
      type: String,
      required: false,
    },
    action: {
      type: String,
      enum: [
        "Login",
        "Logout",
        "Transcription Created",
        "Summary Generated",
        "Profile Updated",
        "Export PDF",
        "File Upload",
        "File Download",
        "Settings Changed",
        "Password Changed",
        "Account Deleted",
        "Recording Started",
        "Recording Completed",
        "Notification Viewed",
        "Share Document",
      ],
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Indexes for faster queries
userActivitySchema.index({ userId: 1, timestamp: -1 });
userActivitySchema.index({ userEmail: 1, timestamp: -1 });
userActivitySchema.index({ action: 1, timestamp: -1 });
userActivitySchema.index({ timestamp: -1 });

// Auto-delete old activities after 90 days
userActivitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model("UserActivity", userActivitySchema);
