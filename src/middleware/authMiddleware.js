import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AdminSession from "../models/AdminSession.js";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");
      
      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired, please login again" });
      }
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

export const adminOnly = async (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    // Verify admin session is active
    try {
      const token = req.headers.authorization.split(" ")[1];
      const session = await AdminSession.findOne({
        token,
        adminId: req.user._id,
        isActive: true,
        expiresAt: { $gt: new Date() },
      });

      if (!session) {
        return res.status(401).json({ 
          message: "Session expired or invalid. Please login again." 
        });
      }

      // Update last activity
      session.lastActivity = new Date();
      await session.save();

      next();
    } catch (error) {
      console.error("Admin verification error:", error);
      return res.status(403).json({ message: "Admin session validation failed" });
    }
  } else {
    return res.status(403).json({ message: "Admin access only" });
  }
};

