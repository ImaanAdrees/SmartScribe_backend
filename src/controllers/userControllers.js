import User from "../models/User.js";
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
    const { name, image } = req.body;

    if (!name || name.trim().length < 3) {
      return res
        .status(400)
        .json({ message: "Name must be at least 3 characters" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { name: name.trim(), ...(image && { image }) },
      { new: true, runValidators: true },
    ).select("-password");

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
      { name },
      ipAddress,
      userAgent,
    );

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: formatRole(user.role),
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
    await user.save();

    res.json({ message: "Password changed successfully" });
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
      .select("name email role createdAt transcriptions")
      .sort({ createdAt: -1 });

    const payload = users.map((user) => ({
      id: user._id,
      name: user.name || "Unknown",
      email: user.email,
      role: formatRole(user.role),
      joinDate: user.createdAt
        ? user.createdAt.toISOString().split("T")[0]
        : null,
      transcriptions: Number.isFinite(user.transcriptions)
        ? user.transcriptions
        : 0,
    }));

    res.json({ users: payload });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to load users", error: error.message });
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

    await User.deleteOne({ _id: id });

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
    }

    res.json({ message: "User deleted" });
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
