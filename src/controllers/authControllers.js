import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AdminSession from "../models/AdminSession.js";
import { logLoginAttempt } from "../middleware/securityMiddleware.js";
import { logUserActivity } from "../utils/activityLogger.js";
import { io } from "../../index.js";

// Generate different token expiry for admin vs regular users
const generateToken = (id, isAdmin = false) => {
  const expiresIn = isAdmin ? "2h" : "7d"; // Admin tokens expire in 2 hours
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn });
};

const normalizeRole = (role) => {
  if (!role) {
    return { value: "other" };
  }

  const normalized = String(role).trim().toLowerCase();
  const allowed = new Set(["student", "teacher", "other"]);

  if (!allowed.has(normalized)) {
    return { error: "Role must be teacher, student, or other" };
  }

  return { value: normalized };
};

const formatRole = (role) => {
  if (!role) return "Other";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

// User Signup
export const signup = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    const { value: normalizedRole, error: roleError } = normalizeRole(role);
    if (roleError) {
      return res.status(400).json({ message: roleError });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: normalizedRole,
    });

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: formatRole(user.role),
      token: generateToken(user._id, false),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
};

// User Login
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      await logLoginAttempt(req, true, "user");

      // Log user activity
      const ipAddress =
        req.headers["x-forwarded-for"] || req.connection.remoteAddress;
      const userAgent = req.headers["user-agent"];
      await logUserActivity(
        user._id,
        user.email,
        user.name,
        "Login",
        null,
        {},
        ipAddress,
        userAgent,
      );

      res.json({
        _id: user._id,
        email: user.email,
        isAdmin: user.isAdmin,
        token: generateToken(user._id, false),
      });
    } else {
      await logLoginAttempt(req, false, "user");
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

// Admin Login with Enhanced Security
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    const admin = await User.findOne({ email, isAdmin: true });

    if (admin && (await admin.matchPassword(password))) {
      // Generate admin token
      const token = generateToken(admin._id, true);

      // Calculate expiration (2 hours from now)
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

      // Invalidate old sessions for this admin
      await AdminSession.updateMany(
        { adminId: admin._id, isActive: true },
        { isActive: false },
      );

      // Create new admin session
      await AdminSession.create({
        adminId: admin._id,
        token,
        ipAddress,
        userAgent,
        expiresAt,
        isActive: true,
      });

      // Log successful attempt
      await logLoginAttempt(req, true, "admin");

      console.log(
        `Admin ${email} logged in successfully from IP: ${ipAddress}`,
      );

      res.json({
        _id: admin._id,
        email: admin.email,
        name: admin.name,
        token,
        expiresAt,
      });
    } else {
      // Log failed attempt
      await logLoginAttempt(req, false, "admin");

      console.log(
        `Failed admin login attempt for ${email} from IP: ${ipAddress}`,
      );

      res.status(401).json({ message: "Admin credentials invalid" });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    res
      .status(500)
      .json({ message: "Admin login failed", error: error.message });
  }
};

// User Logout
export const logout = async (req, res) => {
  try {
    // Log user activity
    const user = await User.findById(req.user.id);
    if (user) {
      const ipAddress =
        req.headers["x-forwarded-for"] || req.connection.remoteAddress;
      const userAgent = req.headers["user-agent"];
      await logUserActivity(
        user._id,
        user.email,
        user.name,
        "Logout",
        null,
        {},
        ipAddress,
        userAgent,
      );
    }

    res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Logout failed" });
  }
};

// Admin Logout - Invalidate session
export const adminLogout = async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];

    // Invalidate the session
    await AdminSession.findOneAndUpdate(
      { token, adminId: req.user._id },
      { isActive: false },
    );

    res.status(200).json({
      message: "Admin logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Logout failed" });
  }
};

// Verify Admin Token and Session
export const verifyAdmin = async (req, res) => {
  try {
    if (req.user && req.user.isAdmin) {
      const token = req.headers.authorization.split(" ")[1];

      // Check if session exists and is active
      const session = await AdminSession.findOne({
        token,
        adminId: req.user._id,
        isActive: true,
        expiresAt: { $gt: new Date() },
      });

      if (!session) {
        return res.status(401).json({
          valid: false,
          message: "Session expired. Please login again.",
        });
      }

      res.json({
        valid: true,
        admin: {
          _id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          isAdmin: req.user.isAdmin,
        },
        sessionExpiresAt: session.expiresAt,
      });
    } else {
      res.status(403).json({ valid: false, message: "Not an admin" });
    }
  } catch (error) {
    console.error("Admin verification error:", error);
    res.status(401).json({ valid: false, message: "Invalid token" });
  }
};

// Refresh Admin Token
export const refreshAdminToken = async (req, res) => {
  try {
    const oldToken = req.headers.authorization.split(" ")[1];

    // Find the session
    const session = await AdminSession.findOne({
      token: oldToken,
      adminId: req.user._id,
      isActive: true,
    });

    if (!session) {
      return res.status(401).json({ message: "Invalid session" });
    }

    // Generate new token
    const newToken = generateToken(req.user._id, true);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // Update session with new token
    session.token = newToken;
    session.expiresAt = expiresAt;
    session.lastActivity = new Date();
    await session.save();

    res.json({
      token: newToken,
      expiresAt,
      message: "Token refreshed successfully",
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ message: "Failed to refresh token" });
  }
};

// Get Admin Profile
export const getAdminProfile = async (req, res) => {
  try {
    const admin = await User.findById(req.user._id).select("-password");

    if (!admin || !admin.isAdmin) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        image: admin.image,
        isAdmin: admin.isAdmin,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Failed to get profile" });
  }
};

// Update Admin Profile (name, image)
export const updateAdminProfile = async (req, res) => {
  try {
    const { name, image } = req.body;
    const admin = await User.findById(req.user._id);

    if (!admin || !admin.isAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Update fields
    if (name) admin.name = name;
    if (image) admin.image = image;

    await admin.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        image: admin.image,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

// Change Admin Password
export const changeAdminPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // Validate inputs
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Old password, new password, and confirmation are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirmation do not match",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    const admin = await User.findById(req.user._id);

    if (!admin || !admin.isAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Check if old password is correct
    const isPasswordCorrect = await admin.matchPassword(oldPassword);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Old password is incorrect",
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
};
