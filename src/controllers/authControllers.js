import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import AdminSession from "../models/AdminSession.js";
import { logLoginAttempt } from "../middleware/securityMiddleware.js";
import { logUserActivity } from "../utils/activityLogger.js";
import { io } from "../../index.js";

const signupOtpStore = new Map();
const signupVerifiedStore = new Map();
const forgotPasswordOtpStore = new Map();

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const VERIFIED_EXPIRY_MS = 10 * 60 * 1000;

const createOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

const createMailTransporter = () => {
  if (!process.env.USER_EMAIL || !process.env.USER_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_EMAIL,
      pass: process.env.USER_PASSWORD,
    },
  });
};

const sendSignupOtpEmail = async (email, otp) => {
  const transporter = createMailTransporter();

  if (!transporter) {
    throw new Error("Email service is not configured");
  }

  await transporter.sendMail({
    from: process.env.USER_EMAIL,
    to: email,
    subject: "SmartScribe Signup OTP",
    text: `Your SmartScribe OTP is ${otp}. It will expire in 10 minutes.`,
  });
};

const sendForgotPasswordOtpEmail = async (email, otp) => {
  const transporter = createMailTransporter();

  if (!transporter) {
    throw new Error("Email service is not configured");
  }

  await transporter.sendMail({
    from: process.env.USER_EMAIL,
    to: email,
    subject: "SmartScribe Password Reset OTP",
    text: `Your SmartScribe password reset OTP is ${otp}. It will expire in 10 minutes.`,
  });
};

const RESET_PASSWORD_EXPIRY = "15m";

const getResetPasswordBaseUrl = () => {
  return (
    process.env.APP_RESET_PASSWORD_URL ||
    process.env.REACT_APP_FRONTEND_URL ||
    process.env.FRONT_URL ||
    "http://localhost:8081"
  );
};

const createPasswordResetToken = (userId) => {
  return jwt.sign({ id: userId, purpose: "password-reset" }, process.env.JWT_SECRET, {
    expiresIn: RESET_PASSWORD_EXPIRY,
  });
};

const sendPasswordResetEmail = async (email, resetLink) => {
  const transporter = createMailTransporter();

  if (!transporter) {
    throw new Error("Email service is not configured");
  }

  await transporter.sendMail({
    from: process.env.USER_EMAIL,
    to: email,
    subject: "SmartScribe Password Reset",
    text: `Reset your SmartScribe password using this link: ${resetLink}`,
  });
};

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
  const { name, email, password, role, phone, organization, city, country } =
    req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const verifiedState = signupVerifiedStore.get(normalizedEmail);
    if (!verifiedState || verifiedState.expiresAt < Date.now()) {
      signupVerifiedStore.delete(normalizedEmail);
      return res.status(400).json({
        message: "Please verify OTP before signup",
      });
    }

    const { value: normalizedRole, error: roleError } = normalizeRole(role);
    if (roleError) {
      return res.status(400).json({ message: roleError });
    }

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: normalizedRole,
      phone: phone?.trim() || null,
      organization: organization?.trim() || null,
      city: city?.trim() || null,
      country: country?.trim() || null,
    });

    signupVerifiedStore.delete(normalizedEmail);

    // Emit socket event for real-time update
    if (io) {
      io.emit("user_list_updated");
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: formatRole(user.role),
      phone: user.phone,
      organization: user.organization,
      city: user.city,
      country: user.country,
      token: generateToken(user._id, false),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
};

export const sendSignupOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const otp = createOtpCode();
    signupOtpStore.set(normalizedEmail, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    await sendSignupOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

export const resendSignupOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const otp = createOtpCode();
    signupOtpStore.set(normalizedEmail, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    await sendSignupOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      message: "OTP resent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to resend OTP",
      error: error.message,
    });
  }
};

export const verifySignupOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();
    const normalizedOtp = String(otp || "").trim();

    if (!normalizedEmail || !normalizedOtp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const otpState = signupOtpStore.get(normalizedEmail);

    if (!otpState || otpState.expiresAt < Date.now()) {
      signupOtpStore.delete(normalizedEmail);
      return res.status(400).json({ message: "OTP expired. Please resend OTP" });
    }

    if (otpState.otp !== normalizedOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    signupOtpStore.delete(normalizedEmail);
    signupVerifiedStore.set(normalizedEmail, {
      expiresAt: Date.now() + VERIFIED_EXPIRY_MS,
    });

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
};

export const requestPasswordReset = async (req, res) => {
  const { email, channel } = req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "Email does not exist" });
    }

    const resetToken = createPasswordResetToken(user._id);

    if (channel === "app") {
      return res.status(200).json({
        message: "Email verified",
        token: resetToken,
      });
    }

    const resetBaseUrl = getResetPasswordBaseUrl();
    const resetLink = `${resetBaseUrl}/auth/updatepass?token=${encodeURIComponent(resetToken)}`;

    await sendPasswordResetEmail(normalizedEmail, resetLink);

    return res.status(200).json({
      message: "Password reset link sent to email",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send password reset email",
      error: error.message,
    });
  }
};

export const sendForgotPasswordOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (!existingUser) {
      return res.status(404).json({ message: "Email does not exist" });
    }

    const otp = createOtpCode();
    forgotPasswordOtpStore.set(normalizedEmail, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    await sendForgotPasswordOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

export const resendForgotPasswordOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (!existingUser) {
      return res.status(404).json({ message: "Email does not exist" });
    }

    const otp = createOtpCode();
    forgotPasswordOtpStore.set(normalizedEmail, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
    });

    await sendForgotPasswordOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      message: "OTP resent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to resend OTP",
      error: error.message,
    });
  }
};

export const verifyForgotPasswordOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const normalizedEmail = email?.trim()?.toLowerCase();
    const normalizedOtp = String(otp || "").trim();

    if (!normalizedEmail || !normalizedOtp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (!existingUser) {
      return res.status(404).json({ message: "Email does not exist" });
    }

    const otpState = forgotPasswordOtpStore.get(normalizedEmail);

    if (!otpState || otpState.expiresAt < Date.now()) {
      forgotPasswordOtpStore.delete(normalizedEmail);
      return res.status(400).json({ message: "OTP expired. Please resend OTP" });
    }

    if (otpState.otp !== normalizedOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    forgotPasswordOtpStore.delete(normalizedEmail);

    const resetToken = createPasswordResetToken(existingUser._id);

    return res.status(200).json({
      message: "OTP verified successfully",
      token: resetToken,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
};

export const resetPasswordWithToken = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  try {
    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: "Token, password and confirm password are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (tokenError) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    if (!payload?.id || payload?.purpose !== "password-reset") {
      return res.status(400).json({ message: "Invalid reset token" });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSamePassword = await user.matchPassword(password);
    if (isSamePassword) {
      return res.status(400).json({ message: "Your password is already this" });
    }

    user.password = password;
    await user.save();

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to reset password",
      error: error.message,
    });
  }
};

// User Login
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (user.isDisabled && !user.isAdmin) {
        await logLoginAttempt(req, false, "user");
        return res.status(403).json({
          message: "Your account is disabled. Please contact admin.",
        });
      }

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
