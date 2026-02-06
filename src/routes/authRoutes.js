import express from "express";
import { 
  signup, 
  login, 
  adminLogin, 
  adminLogout, 
  verifyAdmin,
  refreshAdminToken,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword
} from "../controllers/authControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { 
  adminLoginLimiter, 
  apiLimiter,
  checkAccountLockout,
  validatePasswordStrength 
} from "../middleware/securityMiddleware.js";

const router = express.Router();

// Public routes with rate limiting
router.post("/signup", apiLimiter, validatePasswordStrength, signup);
router.post("/login", apiLimiter, login);

// Admin routes with stricter rate limiting and security checks
router.post("/admin/login", adminLoginLimiter, checkAccountLockout, adminLogin);
router.post("/admin/logout", protect, adminOnly, adminLogout);
router.get("/admin/verify", protect, adminOnly, verifyAdmin);
router.post("/admin/refresh", protect, adminOnly, refreshAdminToken);

// Admin profile routes
router.get("/admin/profile", protect, adminOnly, getAdminProfile);
router.put("/admin/profile/update", protect, adminOnly, updateAdminProfile);
router.put("/admin/profile/change-password", protect, adminOnly, changeAdminPassword);

export default router;
