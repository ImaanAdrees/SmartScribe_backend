import express from "express";
import { sendContactMessage } from "../controllers/contactControllers.js";
import { apiLimiter } from "../middleware/securityMiddleware.js";

const router = express.Router();

router.post("/", apiLimiter, sendContactMessage);

export default router;
