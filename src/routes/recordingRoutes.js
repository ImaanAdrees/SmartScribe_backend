import express from 'express';
import multer from 'multer';
import path from 'path';
import Recording from '../models/Recording.js';
import Transcription from '../models/Transcription.js';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';
import { transcribeAudio, labelSpeakers } from '../utils/openaiUtils.js';
import { logUserActivity } from '../utils/activityLogger.js';
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
    let ext = path.extname(file.originalname);
    if (!ext) ext = '.m4a';
    cb(null, 'recording-' + uniqueSuffix + ext);
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
    
    // Log activity
    await logUserActivity(
      req.user._id,
      req.user.email,
      req.user.name,
      'File Upload',
      `Audio recording "${recording.name}" uploaded.`,
      { recordingId: recording._id }
    );

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
      await Transcription.deleteMany({ recording: req.params.id });
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

// Fetch a specific recording with its transcription
router.get('/:id', protect, async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, error: 'Recording not found' });
    
    if (String(recording.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const transcription = await Transcription.findOne({ recording: recording._id });
    
    res.json({ success: true, recording, transcription });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger transcription for a recording
router.post('/:id/transcribe', protect, async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ success: false, error: 'Recording not found' });

    if (String(recording.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Check if transcription already exists
    let transcription = await Transcription.findOne({ recording: recording._id });
    if (transcription) {
      return res.json({ success: true, transcription, message: 'Transcription already exists' });
    }

    const filePath = path.join(path.resolve(), 'uploads', 'recording', recording.filename);
    
    console.log('[DEBUG] Starting transcription for:', recording.filename);
    const rawText = await transcribeAudio(filePath);
    console.log('[DEBUG] Transcription completed, now labeling speakers...');
    const labeledText = await labelSpeakers(rawText);
    console.log('[DEBUG] Speaker labeling completed.');

    transcription = new Transcription({
      user: req.user._id,
      recording: recording._id,
      text: labeledText,
    });

    await transcription.save();

    // Increment user transcription count (persistent historical count)
    await User.findByIdAndUpdate(req.user._id, { $inc: { transcriptions: 1 } });

    // Log activity
    await logUserActivity(
      req.user._id,
      req.user.email,
      req.user.name,
      'Transcription Created',
      `Transcription created for recording "${recording.name}".`,
      { recordingId: recording._id, transcriptionId: transcription._id }
    );

    res.json({ success: true, transcription });
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
