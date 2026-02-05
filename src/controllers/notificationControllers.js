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
