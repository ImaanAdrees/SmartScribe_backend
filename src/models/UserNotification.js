import mongoose from "mongoose";

const userNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index to prevent duplicates and enable efficient querying
userNotificationSchema.index({ userId: 1, notificationId: 1 }, { unique: true });

export default mongoose.model("UserNotification", userNotificationSchema);
