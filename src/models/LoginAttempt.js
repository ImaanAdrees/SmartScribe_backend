import mongoose from "mongoose";

const loginAttemptSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: String,
    success: {
      type: Boolean,
      required: true,
    },
    attemptType: {
      type: String,
      enum: ["admin", "user"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for faster queries
loginAttemptSchema.index({ email: 1, timestamp: -1 });
loginAttemptSchema.index({ ipAddress: 1, timestamp: -1 });

// Auto-delete old attempts after 24 hours
loginAttemptSchema.index({ timestamp: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model("LoginAttempt", loginAttemptSchema);
