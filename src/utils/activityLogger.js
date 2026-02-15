import UserActivity from "../models/UserActivity.js";

/**
 * Log user activity
 * @param {String} userId - User ID
 * @param {String} userEmail - User email
 * @param {String} userName - User name
 * @param {String} action - Action type (from enum)
 * @param {String} description - Optional description
 * @param {Object} metadata - Optional metadata
 * @param {String} ipAddress - Optional IP address
 * @param {String} userAgent - Optional user agent
 */
export const logUserActivity = async (
  userId,
  userEmail,
  userName,
  action,
  description = null,
  metadata = {},
  ipAddress = null,
  userAgent = null,
) => {
  try {
    const activity = await UserActivity.create({
      userId,
      userEmail,
      userName,
      action,
      description,
      metadata,
      ipAddress,
      userAgent,
    });
    return activity;
  } catch (error) {
    console.error("Error logging user activity:", error.message);
    // Don't throw error, just log it - activity tracking shouldn't break main functionality
  }
};

/**
 * Get user activity logs with filtering
 * @param {Object} filters - Filter object { userId, userEmail, action, startDate, endDate }
 * @param {Number} limit - Pagination limit
 * @param {Number} skip - Pagination skip
 */
export const getUserActivityLogs = async (
  filters = {},
  limit = 50,
  skip = 0,
) => {
  try {
    const query = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.userEmail) query.userEmail = filters.userEmail.toLowerCase();
    if (filters.action) query.action = filters.action;

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
      if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
    }

    const activities = await UserActivity.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await UserActivity.countDocuments(query);

    return {
      activities,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    };
  } catch (error) {
    console.error("Error fetching activity logs:", error.message);
    throw error;
  }
};

/**
 * Get activity statistics
 */
export const getActivityStats = async (daysBack = 30) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const stats = await UserActivity.aggregate([
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

    return stats;
  } catch (error) {
    console.error("Error fetching activity stats:", error.message);
    throw error;
  }
};

/**
 * Get top active users
 */
export const getTopActiveUsers = async (limit = 5, daysBack = 30) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const topUsers = await UserActivity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$userEmail",
          userName: { $first: "$userName" },
          userId: { $first: "$userId" },
          activityCount: { $sum: 1 },
        },
      },
      {
        $sort: { activityCount: -1 },
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    return topUsers;
  } catch (error) {
    console.error("Error fetching top active users:", error.message);
    throw error;
  }
};

/**
 * Delete user activities older than specified days
 */
export const deleteOldActivities = async (daysBack = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const result = await UserActivity.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    return result;
  } catch (error) {
    console.error("Error deleting old activities:", error.message);
    throw error;
  }
};
