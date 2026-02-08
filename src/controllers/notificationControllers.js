import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import UserNotification from "../models/UserNotification.js";
import { io } from "../../index.js";

const normalizeType = (type) => {
  if (!type) return "info";
  const normalized = String(type).trim().toLowerCase();
  if (normalized === "error") return "alert";
  const allowed = new Set(["info", "success", "warning", "alert"]);
  return allowed.has(normalized) ? normalized : null;
};

const normalizeAudience = (audience) => {
  if (!audience) return "all";
  const normalized = String(audience).trim().toLowerCase();
  const allowed = new Set(["all", "students", "teachers", "user"]);
  return allowed.has(normalized) ? normalized : null;
};

const audienceLabel = (audience, targetUser) => {
  switch (audience) {
    case "students":
      return "Students Only";
    case "teachers":
      return "Teachers Only";
    case "user":
      return targetUser ? `User: ${targetUser.email}` : "Specific User";
    default:
      return "All Users";
  }
};

const buildAudienceQuery = (audience, targetUserIds) => {
  if (audience === "students") {
    return { isAdmin: false, role: "student" };
  }
  if (audience === "teachers") {
    return { isAdmin: false, role: "teacher" };
  }
  if (audience === "user") {
    if (!targetUserIds || targetUserIds.length === 0) {
      return { _id: { $in: [] } };
    }
    return { isAdmin: false, _id: { $in: targetUserIds } };
  }
  return { isAdmin: false };
};

const parseScheduledAt = (scheduledAt) => {
  if (!scheduledAt) return null;
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export const getRecipientCount = async (req, res) => {
  try {
    const audience = normalizeAudience(req.query.audience);
    if (!audience) {
      return res.status(400).json({ message: "Invalid audience" });
    }

    let targetUserIds = [];
    if (audience === "user") {
      const targetUserIdsParam = req.query.targetUserIds;
      if (!targetUserIdsParam) {
        return res.status(400).json({ message: "targetUserIds is required" });
      }
      targetUserIds = Array.isArray(targetUserIdsParam)
        ? targetUserIdsParam
        : String(targetUserIdsParam).split(",");

      if (targetUserIds.length === 0) {
        return res.status(400).json({ message: "At least one user ID is required" });
      }
    }

    const count = await User.countDocuments(buildAudienceQuery(audience, targetUserIds));
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: "Failed to get recipient count", error: error.message });
  }
};

export const createNotification = async (req, res) => {
  try {
    const { title, message, type, audience, targetUserIds, scheduledAt } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    const normalizedType = normalizeType(type);
    if (!normalizedType) {
      return res.status(400).json({ message: "Invalid notification type" });
    }

    const normalizedAudience = normalizeAudience(audience);
    if (!normalizedAudience) {
      return res.status(400).json({ message: "Invalid audience" });
    }

    let userIds = [];
    if (normalizedAudience === "user") {
      if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
        return res.status(400).json({ message: "At least one user must be selected" });
      }
      userIds = targetUserIds;

      const validUsers = await User.find({
        isAdmin: false,
        _id: { $in: userIds },
      }).select("_id");

      if (validUsers.length === 0) {
        return res.status(404).json({ message: "No valid users found" });
      }
    }

    const scheduledDate = parseScheduledAt(scheduledAt);
    if (scheduledAt && !scheduledDate) {
      return res.status(400).json({ message: "Invalid scheduled date" });
    }

    const now = new Date();
    const isScheduled = scheduledDate && scheduledDate > now;
    const recipientCount = await User.countDocuments(
      buildAudienceQuery(normalizedAudience, userIds)
    );

    const notification = await Notification.create({
      title: String(title).trim(),
      message: String(message).trim(),
      type: normalizedType,
      audience: normalizedAudience,
      targetUserIds: normalizedAudience === "user" ? userIds : [],
      recipientCount,
      scheduledAt: isScheduled ? scheduledDate : null,
      sentAt: isScheduled ? null : now,
      status: isScheduled ? "scheduled" : "sent",
      createdBy: req.user._id,
    });

    // Emit real-time notification via Socket.IO if notification is sent immediately
    if (!isScheduled) {
      await emitNotificationViaSocket(notification, normalizedAudience, userIds);
    }

    res.status(201).json({
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      audience: notification.audience,
      audienceLabel: normalizedAudience === "user" ? `${userIds.length} user(s) selected` : "Specific User",
      sentDate: notification.sentAt,
      scheduledAt: notification.scheduledAt,
      status: notification.status,
      recipientCount: notification.recipientCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create notification", error: error.message });
  }
};

// Helper function to emit notifications via Socket.IO and store in database
const emitNotificationViaSocket = async (notification, audience, targetUserIds) => {
  try {
    const notificationPayload = {
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      audience: notification.audience,
      sentDate: notification.sentAt,
      status: notification.status,
      tag: notification.tag || "SmartScribe",
    };

    let usersToNotify = [];

    // Determine which users to notify
    if (audience === "all") {
      // Get all non-admin users
      usersToNotify = await User.find({ isAdmin: false }).select("_id");
      console.log(`[Notification] Sending to ALL users. Count: ${usersToNotify.length}`);
      usersToNotify.forEach((user) => {
        const roomName = `user_${user._id}`;
        console.log(`[Notification] Emitting to room: ${roomName}`);
        io.to(roomName).emit("new_notification", notificationPayload);
      });
    }
    // Emit to students only
    else if (audience === "students") {
      usersToNotify = await User.find({ isAdmin: false, role: "student" }).select("_id");
      console.log(`[Notification] Sending to STUDENTS. Count: ${usersToNotify.length}`);
      usersToNotify.forEach((student) => {
        io.to(`user_${student._id}`).emit("new_notification", notificationPayload);
      });
    }
    // Emit to teachers only
    else if (audience === "teachers") {
      usersToNotify = await User.find({ isAdmin: false, role: "teacher" }).select("_id");
      console.log(`[Notification] Sending to TEACHERS. Count: ${usersToNotify.length}`);
      usersToNotify.forEach((teacher) => {
        io.to(`user_${teacher._id}`).emit("new_notification", notificationPayload);
      });
    }
    // Emit to specific users
    else if (audience === "user" && targetUserIds && targetUserIds.length > 0) {
      usersToNotify = targetUserIds.map((id) => ({ _id: id }));
      console.log(`[Notification] Sending to SPECIFIC USERS. Count: ${usersToNotify.length}`);
      targetUserIds.forEach((userId) => {
        io.to(`user_${userId}`).emit("new_notification", notificationPayload);
      });
    }

    // Store notification records in database for offline users
    if (usersToNotify.length > 0) {
      const userNotificationRecords = usersToNotify.map((user) => ({
        userId: user._id,
        notificationId: notification._id,
        isRead: false,
      }));

      console.log(`[Notification] Storing ${userNotificationRecords.length} records in UserNotification`);
      
      const result = await UserNotification.insertMany(userNotificationRecords, { ordered: false }).catch(
        (err) => {
          // Ignore duplicate key errors
          if (err.code !== 11000) {
            console.error("[Notification] Error inserting records:", err);
            throw err;
          }
          console.warn("[Notification] Duplicate key errors (expected for retries)");
        }
      );
      
      console.log(`[Notification] Successfully stored notifications. Result:`, result?.length);
    } else {
      console.warn("[Notification] No users to notify!");
    }
  } catch (error) {
    console.error("[Notification] Error emitting notification via Socket.IO:", error);
  }
};

export const listNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate("createdBy", "name email")
      .populate("targetUserIds", "email")
      .sort({ createdAt: -1 });

    const payload = notifications.map((notif) => {
      let displayLabel = "";
      if (notif.audience === "user") {
        const count = notif.targetUserIds ? notif.targetUserIds.length : 0;
        displayLabel = count > 0 ? `${count} user(s) selected` : "Specific User";
      } else {
        displayLabel = audienceLabel(notif.audience, null);
      }

      return {
        id: notif._id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        audience: notif.audience,
        audienceLabel: displayLabel,
        sentBy: notif.createdBy?.name || notif.createdBy?.email || "Admin",
        sentDate: notif.sentAt || notif.scheduledAt || notif.createdAt,
        status: notif.status,
      };
    });

    res.json({ notifications: payload });
  } catch (error) {
    res.status(500).json({ message: "Failed to load notifications", error: error.message });
  }
};

// Get user's notifications (for logged-in users)
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[API] Fetching notifications for user: ${userId}`);

    // Fetch all user notifications sorted by newest first
    const userNotifications = await UserNotification.find({ userId })
      .populate({
        path: "notificationId",
        select: "title message type sentAt status",
      })
      .sort({ createdAt: -1 });

    console.log(`[API] Found ${userNotifications.length} user notifications`);

    // Map to notification format
    const notifications = userNotifications
      .filter((un) => un.notificationId) // Ensure notification exists
      .map((un) => ({
        id: un.notificationId._id,
        title: un.notificationId.title,
        message: un.notificationId.message,
        type: un.notificationId.type,
        receivedAt: un.createdAt,
        isRead: un.isRead,
        userNotificationId: un._id, // To mark as read later
        tag: un.notificationId.tag || "SmartScribe",
      }));

    console.log(`[API] Returning ${notifications.length} formatted notifications`);
    res.json({ notifications });
  } catch (error) {
    console.error(`[API] Error fetching user notifications:`, error);
    res.status(500).json({ message: "Failed to load user notifications", error: error.message });
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    console.log(`[MarkAsRead] userId: ${userId}, notificationId: ${notificationId}`);

    // Convert notificationId string to ObjectId
    const notifId = new mongoose.Types.ObjectId(notificationId);

    // Find user notification record
    const userNotification = await UserNotification.findOne({
      userId,
      notificationId: notifId,
    });

    console.log(`[MarkAsRead] Found notification:`, userNotification ? 'Yes' : 'No');

    if (!userNotification) {
      return res.status(404).json({ message: "Notification not found for this user" });
    }

    // Mark as read
    userNotification.isRead = true;
    await userNotification.save();

    console.log(`[MarkAsRead] Notification marked as read`);
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    console.error(`[MarkAsRead] Error:`, error);
    res.status(500).json({ message: "Failed to mark notification as read", error: error.message });
  }
};

// Delete user notification
export const deleteUserNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    console.log(`[DeleteNotification] userId: ${userId}, notificationId: ${notificationId}`);

    // Convert notificationId string to ObjectId
    const notifId = new mongoose.Types.ObjectId(notificationId);

    // Delete user notification record
    const result = await UserNotification.findOneAndDelete({
      userId,
      notificationId: notifId,
    });

    console.log(`[DeleteNotification] Delete result:`, result ? 'Success' : 'Not Found');

    if (!result) {
      console.warn(`[DeleteNotification] Notification not found for user`);
      return res.status(404).json({ message: "Notification not found for this user" });
    }

    console.log(`[DeleteNotification] Notification deleted successfully`);
    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error(`[DeleteNotification] Error:`, error);
    res.status(500).json({ message: "Failed to delete notification", error: error.message });
  }
};

