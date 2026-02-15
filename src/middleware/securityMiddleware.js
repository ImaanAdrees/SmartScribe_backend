import rateLimit from "express-rate-limit";
import LoginAttempt from "../models/LoginAttempt.js";

// Rate limiter for admin login attempts - stricter than regular login
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    message:
      "Too many login attempts from this IP, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator to also track by email
  keyGenerator: (req) => {
    return `${req.ip}-${req.body.email || ""}`;
  },
});

// Rate limiter for regular API calls
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    message: "Too many requests from this IP, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Check if account is locked due to too many failed attempts
export const checkAccountLockout = async (req, res, next) => {
  const { email } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;

  if (!email) {
    return next();
  }

  try {
    // Check failed login attempts in last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const failedAttempts = await LoginAttempt.countDocuments({
      email: email.toLowerCase(),
      success: false,
      attemptType: "admin",
      timestamp: { $gte: thirtyMinutesAgo },
    });

    // Lock account after 5 failed attempts
    if (failedAttempts >= 5) {
      // Check if there's been a successful login after the failures
      const lastSuccessfulLogin = await LoginAttempt.findOne({
        email: email.toLowerCase(),
        success: true,
        attemptType: "admin",
        timestamp: { $gte: thirtyMinutesAgo },
      }).sort({ timestamp: -1 });

      if (!lastSuccessfulLogin) {
        return res.status(423).json({
          message:
            "Account temporarily locked due to multiple failed login attempts. Please try again after 30 minutes.",
          lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
        });
      }
    }

    next();
  } catch (error) {
    console.error("Account lockout check error:", error);
    next(); // Continue even if check fails
  }
};

// Log login attempts
export const logLoginAttempt = async (req, success, attemptType = "admin") => {
  const { email } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    await LoginAttempt.create({
      email: email ? email.toLowerCase() : "unknown",
      ipAddress,
      userAgent,
      success,
      attemptType,
    });
  } catch (error) {
    console.error("Error logging login attempt:", error);
  }
};

// Validate password strength
export const validatePasswordStrength = (req, res, next) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  // Password must be at least 8 characters
  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters long",
    });
  }

  // Password must contain at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({
      message: "Password must contain at least one uppercase letter",
    });
  }

  // Password must contain at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return res.status(400).json({
      message: "Password must contain at least one lowercase letter",
    });
  }

  // Password must contain at least one number
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({
      message: "Password must contain at least one number",
    });
  }

  // Password must contain at least one special character
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).json({
      message: "Password must contain at least one special character",
    });
  }

  next();
};
