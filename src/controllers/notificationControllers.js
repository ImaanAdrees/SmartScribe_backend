import Notification from "../models/Notification.js";
import User from "../models/User.js";

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

const buildAudienceQuery = (audience, targetUserId) => {
  if (audience === "students") {
    return { isAdmin: false, role: "student" };
  }
  if (audience === "teachers") {
    return { isAdmin: false, role: "teacher" };
  }
  if (audience === "user") {
    return { isAdmin: false, _id: targetUserId };
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

    const targetUserId = req.query.targetUserId || null;
    if (audience === "user" && !targetUserId) {
      return res.status(400).json({ message: "targetUserId is required" });
    }

    if (audience === "user") {
      const user = await User.findById(targetUserId).select("_id isAdmin");
      if (!user || user.isAdmin) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    const count = await User.countDocuments(buildAudienceQuery(audience, targetUserId));
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: "Failed to get recipient count", error: error.message });
  }
};

export const createNotification = async (req, res) => {
  try {
    const { title, message, type, audience, targetUserId, scheduledAt } = req.body;

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

    if (normalizedAudience === "user" && !targetUserId) {
      return res.status(400).json({ message: "targetUserId is required" });
    }

    let targetUser = null;
    if (normalizedAudience === "user") {
      targetUser = await User.findById(targetUserId).select("_id email isAdmin");
      if (!targetUser || targetUser.isAdmin) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    const scheduledDate = parseScheduledAt(scheduledAt);
    if (scheduledAt && !scheduledDate) {
      return res.status(400).json({ message: "Invalid scheduled date" });
    }

    const now = new Date();
    const isScheduled = scheduledDate && scheduledDate > now;
    const recipientCount = await User.countDocuments(
      buildAudienceQuery(normalizedAudience, targetUserId)
    );

    const notification = await Notification.create({
      title: String(title).trim(),
      message: String(message).trim(),
      type: normalizedType,
      audience: normalizedAudience,
      targetUserId: normalizedAudience === "user" ? targetUserId : null,
      recipientCount,
      scheduledAt: isScheduled ? scheduledDate : null,
      sentAt: isScheduled ? null : now,
      status: isScheduled ? "scheduled" : "sent",
      createdBy: req.user._id,
    });

    res.status(201).json({
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      audience: notification.audience,
      audienceLabel: audienceLabel(notification.audience, targetUser),
      sentDate: notification.sentAt,
      scheduledAt: notification.scheduledAt,
      status: notification.status,
      recipientCount: notification.recipientCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create notification", error: error.message });
  }
};

export const listNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate("createdBy", "name email")
      .populate("targetUserId", "email")
      .sort({ createdAt: -1 });

    const payload = notifications.map((notif) => ({
      id: notif._id,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      audience: notif.audience,
      audienceLabel: audienceLabel(notif.audience, notif.targetUserId),
      sentBy: notif.createdBy?.name || notif.createdBy?.email || "Admin",
      sentDate: notif.sentAt || notif.scheduledAt || notif.createdAt,
      status: notif.status,
    }));

    res.json({ notifications: payload });
  } catch (error) {
    res.status(500).json({ message: "Failed to load notifications", error: error.message });
  }
};
