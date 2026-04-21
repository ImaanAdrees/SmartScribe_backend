import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect } from '../middleware/authMiddleware.js';
import { chatWithAI, voiceChat } from '../controllers/aiController.js';

const router = express.Router();

// Ensure upload directory exists for AI voice prompts
const aiUploadsDir = path.join(path.resolve(), 'uploads', 'ai');
if (!fs.existsSync(aiUploadsDir)) {
  fs.mkdirSync(aiUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, aiUploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ai-prompt-' + uniqueSuffix + path.extname(file.originalname || '.m4a'));
  }
});

const upload = multer({ storage });

router.post('/chat', protect, chatWithAI);
router.post('/voice-chat', protect, upload.single('audio'), voiceChat);

export default router;
