import User from "../models/User.js";

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
    res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
};

// Update user profile (name and image)
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, image } = req.body;

    if (!name || name.trim().length < 3) {
      return res.status(400).json({ message: "Name must be at least 3 characters" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { name: name.trim(), ...(image && { image }) },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
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
    res.status(500).json({ message: "Failed to update profile", error: error.message });
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
    res.status(500).json({ message: "Failed to change password", error: error.message });
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
      joinDate: user.createdAt ? user.createdAt.toISOString().split("T")[0] : null,
      transcriptions: Number.isFinite(user.transcriptions) ? user.transcriptions : 0,
    }));

    res.json({ users: payload });
  } catch (error) {
    res.status(500).json({ message: "Failed to load users", error: error.message });
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

    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};
