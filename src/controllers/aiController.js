import OpenAI from 'openai';
import Transcription from '../models/Transcription.js';
import User from '../models/User.js';

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

/**
 * Helper to get user's context from transcriptions
 */
const getTranscriptContext = async (userId) => {
  // Populate recording to get the meeting name
  const transcriptions = await Transcription.find({ user: userId })
    .populate('recording')
    .sort({ createdAt: -1 })
    .limit(20); // Increased limit as requested
  
  if (transcriptions.length === 0) {
    return "The user has no transcripts recorded yet.";
  }

  return transcriptions
    .map((t, index) => {
      const meetingName = t.recording?.name || t.recording?.originalName || 'Unnamed Meeting';
      const date = t.createdAt.toLocaleDateString();
      return `Meeting: ${meetingName} (Date: ${date})\nTranscript:\n${t.text}`;
    })
    .join('\n\n---\n\n');
};

export const chatWithAI = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const context = await getTranscriptContext(userId);

    const systemPrompt = `You are SmartScribe AI Assistant, a helpful assistant for ${userName}.
Your primary goal is to help ${userName} with questions about their meeting transcripts and recordings.
All of ${userName}'s recent transcripts are provided below as context, including the meeting name and date.
When answering based on a transcript, ALWAYS mention which meeting it came from (e.g., "In the 'Project Sync' meeting on 4/21/2026, you discussed...").
If ${userName} asks a general question not related to the transcripts, you may answer it normally using your general knowledge, but prioritize transcript context if relevant.
Always be professional and refer to the user as ${userName}.

USER TRANSCRIPT CONTEXT:
${context}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;

    res.json({ success: true, message: aiResponse });
  } catch (err) {
    console.error('AI Chat Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const voiceChat = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file provided' });
    }

    // Check if file is too small (likely empty or failed recording)
    if (req.file.size < 100) {
      return res.status(400).json({ success: false, error: 'Audio recording was too short. Please try again.' });
    }

    // Dynamic import of the transcription utility
    const { transcribeAudio } = await import('../utils/openaiUtils.js');
    
    const filePath = req.file.path;
    let text;
    try {
      text = await transcribeAudio(filePath);
    } catch (transError) {
      console.error('Transcription failed:', transError);
      return res.status(422).json({ success: false, error: 'Could not understand the audio. Please speak more clearly.' });
    }

    if (!text || text.trim().length === 0) {
      return res.status(422).json({ success: false, error: 'No speech detected in the recording.' });
    }

    // Now proceed with the chat logic using the transcribed text
    const userId = req.user._id;
    const userName = req.user.name;
    const context = await getTranscriptContext(userId);

    const systemPrompt = `You are SmartScribe AI Assistant, a helpful assistant for ${userName}.
Your primary goal is to help ${userName} with questions about their meeting transcripts and recordings.
All of ${userName}'s recent transcripts are provided below as context, including the meeting name and date.
When answering based on a transcript, ALWAYS mention which meeting it came from (e.g., "In the 'Project Sync' meeting on 4/21/2026, you discussed...").
If ${userName} asks a general question not related to the transcripts, you may answer it normally using your general knowledge, but prioritize transcript context if relevant.
Always be professional and refer to the user as ${userName}.

USER TRANSCRIPT CONTEXT:
${context}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;

    res.json({ 
      success: true, 
      userMessage: text, 
      message: aiResponse 
    });
  } catch (err) {
    console.error('AI Voice Chat Error:', err);
    res.status(500).json({ success: false, error: 'An internal error occurred while processing your voice.' });
  }
};
