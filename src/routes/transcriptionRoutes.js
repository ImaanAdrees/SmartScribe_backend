import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Transcription from '../models/Transcription.js';

const router = express.Router();

// GET /api/transcription/user/all
router.get('/user/all', protect, async (req, res) => {
  try {
    const transcriptions = await Transcription.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, transcriptions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
