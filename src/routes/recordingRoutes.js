import express from 'express';
import multer from 'multer';
import path from 'path';
import Recording from '../models/Recording.js';
import { protect } from '../middleware/authMiddleware.js';
import fs from 'fs';

const router = express.Router();

// Ensure upload directory exists
const recordingsDir = path.join(path.resolve(), 'uploads', 'recording');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Set up storage for recordings
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, recordingsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'recording-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Upload recording
router.post('/upload', protect, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const { duration, name } = req.body;
    const recording = new Recording({
      user: req.user._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      name: name || req.file.originalname,
      duration,
    });
    await recording.save();
    console.log('Recording uploaded:', recording.filename, 'by user', req.user._id);
    res.status(201).json({ success: true, recording });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch user's recordings
router.get('/user', protect, async (req, res) => {
  try {
    const recordings = await Recording.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, recordings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a recording (remove file and DB record)
// Delete a recording (remove file and DB record)
router.delete('/:id', protect, async (req, res) => {
  try {
    const rec = await Recording.findById(req.params.id);
    if (!rec) return res.status(404).json({ success: false, error: 'Recording not found' });
    if (String(rec.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const filePath = path.join(path.resolve(), 'uploads', 'recording', rec.filename);
    try {
      // only attempt unlink if file exists
      await fs.promises.access(filePath);
      await fs.promises.unlink(filePath);
    } catch (fsErr) {
      // log and continue - file might be already removed
      console.warn('Warning deleting file for recording', rec._id, fsErr && fsErr.message ? fsErr.message : fsErr);
    }

    try {
      await Recording.findByIdAndDelete(req.params.id);
    } catch (dbErr) {
      console.error('DB delete failed for recording', req.params.id, dbErr);
      return res.status(500).json({ success: false, error: 'Failed to remove recording record' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete recording error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
