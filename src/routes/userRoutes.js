import { 
  deleteUser, 
  listUsers, 
  getUserProfile, 
  updateUserProfile,
  changePassword,
  uploadProfileImage,
  removeProfileImage
} from "../controllers/userControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";
import express from "express";
const router = express.Router();

// User routes (protected)
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.post("/profile/image", protect, upload.single("image"), uploadProfileImage);
router.delete("/profile/image", protect, removeProfileImage);
router.post("/change-password", protect, changePassword);

// Admin routes
router.get("/", protect, adminOnly, listUsers);
router.delete("/:id", protect, adminOnly, deleteUser);

export default router;
