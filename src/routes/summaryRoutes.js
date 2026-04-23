import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Summary from '../models/Summary.js';
import Recording from '../models/Recording.js';
import User from '../models/User.js';
import Transcription from '../models/Transcription.js';
import OpenAI from 'openai';
import { io } from '../../index.js';

const router = express.Router();

// POST /api/summary/generate
router.post('/generate', protect, async (req, res) => {
  try {
    const { recordingId } = req.body;
    if (!recordingId) return res.status(400).json({ success: false, error: 'recordingId required' });
    const recording = await Recording.findById(recordingId);
    if (!recording || String(recording.user) !== String(req.user._id)) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }
    // Check for existing summary
    let summary = await Summary.findOne({ user: req.user._id, recording: recordingId });
    if (summary) return res.json({ success: true, summary });
    // Get transcription
    const transcription = await Transcription.findOne({ recording: recordingId });
    if (!transcription || !transcription.text) {
      return res.status(404).json({ success: false, error: 'Transcription not found' });
    }
    // Generate summary with OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY });
    const prompt = `You are a helpful assistant. Given the following meeting transcription, generate a detailed summary with clear headings, main points, and explanations. Make it easy to understand, and include the meaning of any technical or unclear terms.\n\nTranscription:\n${transcription.text}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.5,
    });
    const summaryText = completion.choices[0].message.content;
    // Extract headings (simple heuristic: lines starting with # or bold)
    const headings = summaryText.match(/^(#+\s*|\*\*.+\*\*)/gm) || [];
    summary = await Summary.create({
      user: req.user._id,
      recording: recordingId,
      summaryText,
      headings,
      title: recording.name || recording.originalName || recording.filename || 'Untitled Recording',
    });
    // PATCH /api/summary/update-titles-for-recording/:recordingId
    router.patch('/update-titles-for-recording/:recordingId', protect, async (req, res) => {
      try {
        const { recordingId } = req.params;
        const recording = await Recording.findById(recordingId);
        if (!recording) return res.status(404).json({ success: false, error: 'Recording not found' });
        const newTitle = recording.name || recording.originalName || recording.filename || 'Untitled Recording';
        await Summary.updateMany({ recording: recordingId }, { $set: { title: newTitle } });
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // Emit real-time event to user's room
    io.to(`user_${req.user._id}`).emit('summary_created', {
      summary,
      recordingId,
    });
    res.json({ success: true, summary });
  } catch (err) {
    console.error('Summary generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/summary/recording/:recordingId
router.get('/recording/:recordingId', protect, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const summaries = await Summary.find({ user: req.user._id, recording: recordingId }).sort({ createdAt: -1 });
    res.json({ success: true, summaries });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/summary/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const summary = await Summary.findById(req.params.id);
    if (!summary || String(summary.user) !== String(req.user._id)) {
      return res.status(404).json({ success: false, error: 'Summary not found' });
    }
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/summary/user/all
router.get('/user/all', protect, async (req, res) => {
  try {
    const summaries = await Summary.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, summaries });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/summary/export/:id
router.get('/export/:id', protect, async (req, res) => {
  try {
    const { format } = req.query;
    if (!['pdf', 'txt'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Invalid format' });
    }

    const summary = await Summary.findById(req.params.id);
    if (!summary || String(summary.user) !== String(req.user._id)) {
      return res.status(404).json({ success: false, error: 'Summary not found' });
    }

    const title = summary.title || 'Summary';
    const content = summary.summaryText || '';

    if (format === 'txt') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.txt"`);
      return res.send(`Title: ${title}\n\n${content}`);
    }

    if (format === 'pdf') {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const fs = await import('fs');
      const path = await import('path');
      
      try {
        const logoPath = path.resolve('src/logo/mainlogo.png');
        const logoBase64 = fs.readFileSync(logoPath).toString('base64');
        
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({opacity: 0.15}));
        doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', 55, 98, 100, 100);
        doc.restoreGraphicsState();
      } catch (err) {
        console.warn('Could not load logo for PDF watermark:', err);
      }

      doc.setFontSize(18);
      doc.text(title, 10, 20);

      doc.setFontSize(12);
      const splitText = doc.splitTextToSize(content, 180);
      let yOffset = 30;
      
      for (let i = 0; i < splitText.length; i++) {
        if (yOffset > 280) {
          doc.addPage();
          yOffset = 20;
        }
        doc.text(splitText[i], 10, yOffset);
        yOffset += 7;
      }

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.pdf"`);
      return res.send(pdfBuffer);
    }
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/summary/:id
router.patch('/:id', protect, async (req, res) => {
  try {
    const { summaryText } = req.body;
    if (!summaryText || typeof summaryText !== 'string') {
      return res.status(400).json({ success: false, error: 'summaryText is required' });
    }
    const summary = await Summary.findById(req.params.id);
    if (!summary || String(summary.user) !== String(req.user._id)) {
      return res.status(404).json({ success: false, error: 'Summary not found' });
    }
    summary.summaryText = summaryText;
    await summary.save();
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
