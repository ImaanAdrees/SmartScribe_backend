import UserActivity from "../models/UserActivity.js";
import User from "../models/User.js";
import {
  logUserActivity,
  getUserActivityLogs,
  getActivityStats,
  getTopActiveUsers,
} from "../utils/activityLogger.js";

// Import io to emit real-time updates
import { io } from "../../index.js";

/**
 * Log user activity - called from app when user performs action
 * POST /api/activity/log
 */
export const logActivity = async (req, res) => {
  try {
    const { action, description, metadata } = req.body;
    const userId = req.user.id;

    // Get user info
    const user = await User.findById(userId).select("email name");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Validate action
    const validActions = [
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
    ];

    if (!validActions.includes(action)) {
      return res.status(400).json({ message: "Invalid action type" });
    }

    // Extract IP and user agent
    const ipAddress =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    // Log the activity
    const activity = await logUserActivity(
      userId,
      user.email,
      user.name,
      action,
      description || null,
      metadata || {},
      ipAddress,
      userAgent,
    );

    // Emit real-time analytics update to connected clients
    try {
      if (io && activity) {
        io.emit("analytics_update", {
          action: activity.action,
          userId: activity.userId,
          userEmail: activity.userEmail,
          timestamp: activity.timestamp,
        });
      }
    } catch (emitErr) {
      console.error("Failed to emit analytics update:", emitErr.message);
    }

    res.status(201).json({
      message: "Activity logged successfully",
      activity,
    });
  } catch (error) {
    console.error("Error logging activity:", error.message);
    res
      .status(500)
      .json({ message: "Failed to log activity", error: error.message });
  }
};

/**
 * Get activity logs - admin only
 * GET /api/activity/logs?limit=50&skip=0&userId=&action=&startDate=&endDate=
 */
export const getActivityLogs = async (req, res) => {
  try {
    const {
      limit = 50,
      skip = 0,
      userId,
      action,
      startDate,
      endDate,
      userEmail,
    } = req.query;

    const filters = {
      userId,
      userEmail,
      action,
      startDate,
      endDate,
    };

    const { activities, total } = await getUserActivityLogs(
      filters,
      limit,
      skip,
    );

    // Format activities for response
    const formattedActivities = activities.map((log) => ({
      _id: log._id,
      timestamp: log.timestamp,
      user: log.userEmail,
      userName: log.userName || "Unknown",
      action: log.action,
      description: log.description,
    }));

    res.json({
      activities: formattedActivities,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch activity logs", error: error.message });
  }
};

/**
 * Get activity statistics - admin only
 * GET /api/activity/stats?daysBack=30
 */
export const getActivityStatistics = async (req, res) => {
  try {
    const { daysBack = 30 } = req.query;

    const stats = await getActivityStats(parseInt(daysBack));

    res.json({
      timeRange: {
        days: parseInt(daysBack),
        from: new Date(Date.now() - parseInt(daysBack) * 24 * 60 * 60 * 1000),
        to: new Date(),
      },
      stats,
    });
  } catch (error) {
    console.error("Error fetching activity statistics:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch statistics", error: error.message });
  }
};

/**
 * Get usage data bucketed by day/week/month
 * GET /api/activity/usage?filter=daily|weekly|monthly&daysBack=30
 */
export const getUsageData = async (req, res) => {
  try {
    const { filter = "daily", daysBack = 30 } = req.query;
    const days = parseInt(daysBack, 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Choose unit for $dateTrunc
    let unit = "day";
    if (filter === "weekly") unit = "week";
    if (filter === "monthly") unit = "month";

    // Build aggregation pipeline to return per-period totals and action breakdowns
    const pipeline = [
      { $match: { timestamp: { $gte: startDate } } },
      {
        $addFields: {
          period: {
            $dateTrunc: { date: "$timestamp", unit: unit, timezone: "UTC" },
          },
        },
      },
      // Count per period+action
      {
        $group: {
          _id: { period: "$period", action: "$action" },
          count: { $sum: 1 },
        },
      },
      // Aggregate actions into per-period document
      {
        $group: {
          _id: "$_id.period",
          actions: { $push: { action: "$_id.action", count: "$count" } },
          transcriptions: {
            $sum: {
              $cond: [{ $eq: ["$_id.action", "Transcription Created"] }, "$count", 0],
            },
          },
          summaries: {
            $sum: { $cond: [{ $eq: ["$_id.action", "Summary Generated"] }, "$count", 0] },
          },
          total: { $sum: "$count" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await UserActivity.aggregate(pipeline);

    const data = results.map((r) => ({
      period: r._id,
      transcriptions: r.transcriptions || 0,
      summaries: r.summaries || 0,
      activities: r.total || 0,
      actions: r.actions || [],
    }));

    res.json({ data });
  } catch (error) {
    console.error("Error fetching usage data:", error.message);
    res.status(500).json({ message: "Failed to fetch usage data", error: error.message });
  }
};

/**
 * Get top active users - admin only
 * GET /api/activity/top-users?limit=5&daysBack=30
 */
export const getTopUsers = async (req, res) => {
  try {
    const { limit = 5, daysBack = 30 } = req.query;

    const topUsers = await getTopActiveUsers(
      parseInt(limit),
      parseInt(daysBack),
    );

    res.json({
      topUsers: topUsers.map((user, idx) => ({
        rank: idx + 1,
        email: user._id,
        name: user.userName || "Unknown",
        transcriptions: user.activityCount,
      })),
      timeRange: {
        days: parseInt(daysBack),
        from: new Date(Date.now() - parseInt(daysBack) * 24 * 60 * 60 * 1000),
        to: new Date(),
      },
    });
  } catch (error) {
    console.error("Error fetching top users:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch top users", error: error.message });
  }
};

/**
 * Get top users with breakdown per action
 * GET /api/activity/top-users-breakdown?limit=5&daysBack=1
 */
export const getTopUsersBreakdown = async (req, res) => {
  try {
    const { limit = 5, daysBack = 1 } = req.query;
    const days = parseInt(daysBack, 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Aggregate counts per user per action, then pivot actions into object
    const pipeline = [
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { userEmail: "$userEmail", action: "$action" },
          count: { $sum: 1 },
          userName: { $first: "$userName" },
          userId: { $first: "$userId" },
        },
      },
      {
        $group: {
          _id: "$_id.userEmail",
          userName: { $first: "$userName" },
          userId: { $first: "$userId" },
          actions: {
            $push: { action: "$_id.action", count: "$count" },
          },
          total: { $sum: "$count" },
        },
      },
      { $sort: { total: -1 } },
      { $limit: parseInt(limit) },
    ];

    const results = await UserActivity.aggregate(pipeline);

    const mapped = results.map((r) => {
      const counts = {};
      (r.actions || []).forEach((a) => {
        counts[a.action] = a.count;
      });
      return {
        userEmail: r._id,
        userName: r.userName || r._id,
        userId: r.userId,
        counts,
        total: r.total || 0,
      };
    });

    res.json({ topUsers: mapped, timeRange: { days } });
  } catch (error) {
    console.error("Error fetching top users breakdown:", error.message);
    res.status(500).json({ message: "Failed to fetch top users breakdown", error: error.message });
  }
};

/**
 * Get activity summary - admin only
 * GET /api/activity/summary
 */
export const getActivitySummary = async (req, res) => {
  try {
    const { daysBack = 30 } = req.query;
    const days = parseInt(daysBack);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get total activities
    const totalActivities = await UserActivity.countDocuments({
      timestamp: { $gte: startDate },
    });

    // Get unique users
    const uniqueUsers = await UserActivity.distinct("userId", {
      timestamp: { $gte: startDate },
    });

    // Get activity breakdown by type
    const activityBreakdown = await UserActivity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    res.json({
      summary: {
        timeRange: {
          days,
          from: startDate,
          to: new Date(),
        },
        totalActivities,
        uniqueUsers: uniqueUsers.length,
        activityBreakdown,
      },
    });
  } catch (error) {
    console.error("Error fetching activity summary:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch summary", error: error.message });
  }
};

/**
 * Get user activities - admin only or own activities
 * GET /api/activity/user/:userId
 */
export const getUserActivities = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    // Check if user is admin or requesting own activities
    if (req.user.id !== userId && !req.user.isAdmin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const filters = { userId };
    const { activities, total } = await getUserActivityLogs(
      filters,
      limit,
      skip,
    );

    const formattedActivities = activities.map((log) => ({
      _id: log._id,
      timestamp: log.timestamp,
      action: log.action,
      description: log.description,
    }));

    res.json({
      activities: formattedActivities,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error fetching user activities:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch activities", error: error.message });
  }
};
