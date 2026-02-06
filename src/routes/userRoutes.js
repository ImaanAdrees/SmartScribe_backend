import express from "express";
import { 
  deleteUser, 
  listUsers, 
  getUserProfile, 
  updateUserProfile,
  changePassword 
} from "../controllers/userControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes (protected)
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.post("/change-password", protect, changePassword);

// Admin routes
router.get("/", protect, adminOnly, listUsers);
router.delete("/:id", protect, adminOnly, deleteUser);

export default router;
