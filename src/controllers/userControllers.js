import User from "../models/User.js";
import Recording from "../models/Recording.js";
import Transcription from "../models/Transcription.js";
import UserNotification from "../models/UserNotification.js";
import Notification from "../models/Notification.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { io } from "../../index.js";
import { logUserActivity } from "../utils/activityLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const formatRole = (role) => {
  if (!role) return "Other";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

// Get user profile
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: formatRole(user.role),
      phone: user.phone || null,
      organization: user.organization || null,
      city: user.city || null,
      country: user.country || null,
      isDisabled: !!user.isDisabled,
      image: user.image,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch profile", error: error.message });
  }
};

// Update user profile (name and image)
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, image, phone, organization, city, country } = req.body;

    if (!name || name.trim().length < 3) {
      return res
        .status(400)
        .json({ message: "Name must be at least 3 characters" });
    }

    const updates = {
      name: name.trim(),
      phone: phone?.trim() || null,
      organization: organization?.trim() || null,
      city: city?.trim() || null,
      country: country?.trim() || null,
      ...(image && { image }),
    };

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Log user activity
    const ipAddress =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];
    await logUserActivity(
      user._id,
      user.email,
      user.name,
      "Profile Updated",
      "Updated profile information",
      {
        name,
        phone: updates.phone,
        organization: updates.organization,
        city: updates.city,
        country: updates.country,
      },
      ipAddress,
      userAgent,
    );

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
      io.to(`user_${user._id}`).emit("account_status_changed", {
        userId: String(user._id),
        isDisabled: !!user.isDisabled,
      });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: formatRole(user.role),
        phone: user.phone || null,
        organization: user.organization || null,
        city: user.city || null,
        country: user.country || null,
        image: user.image,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update profile", error: error.message });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({
        message: "Password must contain at least one uppercase letter",
      });
    }

    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({
        message: "Password must contain at least one lowercase letter",
      });
    }

    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        message: "Password must contain at least one number",
      });
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return res.status(400).json({
        message: "Password must contain at least one special character",
      });
    }

    // Get user and verify old password
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isPasswordCorrect = await user.matchPassword(oldPassword);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }

    // Update password
      user.password = newPassword;
      user.markModified('password');
      await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to change password", error: error.message });
  }
};

// Admin: List users
export const listUsers = async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false })
      .select("name email role phone organization city country createdAt transcriptions password isDisabled")
      .sort({ createdAt: -1 });

    const payload = users.map((user) => ({
      id: user._id,
      name: user.name || "Unknown",
      email: user.email,
      role: formatRole(user.role),
      phone: user.phone || "-",
      organization: user.organization || "-",
      city: user.city || "-",
      country: user.country || "-",
      joinDate: user.createdAt
        ? user.createdAt.toISOString().split("T")[0]
        : null,
      transcriptions: Number.isFinite(user.transcriptions)
        ? user.transcriptions
        : 0,
      isDisabled: !!user.isDisabled,
      password: user.password
        ? `${user.password.substring(0, 3)}******${user.password.substring(user.password.length - 2)}`
        : "********",
    }));

    res.json({ users: payload });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to load users", error: error.message });
  }
};

// Admin: Disable/Enable user
export const setUserDisabledStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isDisabled } = req.body;

    if (typeof isDisabled !== "boolean") {
      return res.status(400).json({ message: "isDisabled must be a boolean" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isAdmin) {
      return res.status(403).json({ message: "Cannot change admin user status" });
    }

    user.isDisabled = isDisabled;
    await user.save();

    if (io) {
      io.emit("user_list_updated");
    }

    return res.json({
      message: isDisabled ? "User disabled successfully" : "User enabled successfully",
      user: {
        id: user._id,
        isDisabled: !!user.isDisabled,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update user status",
      error: error.message,
    });
  }
};

// Admin: Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isAdmin) {
      return res.status(403).json({ message: "Cannot delete admin users" });
    }

    // Delete user profile image from disk if present
    if (user.image) {
      const profileImagePath = path.join(path.resolve(), user.image.replace(/^\//, ""));
      if (fs.existsSync(profileImagePath)) {
        try {
          fs.unlinkSync(profileImagePath);
        } catch (fileError) {
          console.warn("[DeleteUser] Failed to remove profile image:", fileError.message);
        }
      }
    }

    // Delete recording files from disk
    const recordings = await Recording.find({ user: id }).select("filename");
    for (const recording of recordings) {
      const recordingPath = path.join(path.resolve(), "uploads", "recording", recording.filename);
      if (fs.existsSync(recordingPath)) {
        try {
          fs.unlinkSync(recordingPath);
        } catch (fileError) {
          console.warn("[DeleteUser] Failed to remove recording file:", fileError.message);
        }
      }
    }

    // Delete user-owned data records
    await Transcription.deleteMany({ user: id });
    await Transcription.deleteMany({ recording: { $in: recordings.map((r) => r._id) } });
    await Recording.deleteMany({ user: id });
    await UserNotification.deleteMany({ userId: id });

    // Remove user references from notifications
    await Notification.updateMany(
      { targetUserIds: id },
      { $pull: { targetUserIds: user._id } },
    );

    await User.deleteOne({ _id: id });

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
      io.emit("analytics_update", {
        action: "Account Deleted",
        userId: String(user._id),
        userEmail: user.email,
        timestamp: new Date(),
      });
    }

    res.json({
      message: "User and associated records deleted",
      deleted: {
        recordings: recordings.length,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete user", error: error.message });
  }
};

// Upload profile image
export const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an image" });
    }

    const userId = req.user.id;

    // Get current user to check for existing image
    const currentUser = await User.findById(userId);

    // Delete old image if exists
    if (currentUser.image) {
      const oldImagePath = path.join(__dirname, "../..", currentUser.image);
      if (fs.existsSync(oldImagePath)) {
        try {
          fs.unlinkSync(oldImagePath);
          console.log("[UploadImage] Old image deleted:", oldImagePath);
        } catch (err) {
          console.error("[UploadImage] Failed to delete old image:", err);
        }
      }
    }

    // Construct the image URL. In production, this would be a full domain.
    // We store the relative path for flexibility.
    const imageUrl = `/uploads/profiles/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      userId,
      { image: imageUrl },
      { new: true },
    ).select("-password");

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
    }

    res.json({
      message: "Image uploaded successfully",
      image: imageUrl,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: formatRole(user.role),
        image: user.image,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Remove profile image
export const removeProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete image file if exists
    if (user.image) {
      const imagePath = path.join(__dirname, "../..", user.image);
      console.log("[RemoveImage] Attempting to delete:", imagePath);

      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
          console.log("[RemoveImage] Image file deleted successfully");
        } catch (err) {
          console.error("[RemoveImage] Failed to delete image file:", err);
        }
      } else {
        console.log("[RemoveImage] Image file not found on disk");
      }
    }

    // Update user record to remove image reference
    user.image = null;
    await user.save();

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
    }

    res.json({
      message: "Profile image removed successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: formatRole(user.role),
        image: null,
      },
    });
  } catch (error) {
    console.error("[RemoveImage] Error:", error);
    res
      .status(500)
      .json({ message: "Failed to remove image", error: error.message });
  }
};
