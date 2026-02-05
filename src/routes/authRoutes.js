import express from "express";
import { signup, login, adminLogin, adminLogout } from "../controllers/authControllers.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/admin/login", adminLogin);
router.post("/admin/logout", protect, adminOnly, adminLogout);

export default router;
