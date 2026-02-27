import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

/**
 * Transcribes audio file using OpenAI Whisper-1 model
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<string>} - Transcribed text
 */
export const transcribeAudio = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error('Audio file not found: ' + filePath);
  }

  try {
    const filename = path.basename(filePath);
    const hintName = filename.includes('.') ? filename : `${filename}.m4a`;

    const transcription = await openai.audio.transcriptions.create({
      file: await OpenAI.toFile(fs.createReadStream(filePath), hintName),
      model: 'whisper-1',
      language: 'en',
    });

    return transcription.text;
  } catch (err) {
    console.error('OpenAI Transcription Error:', err);
    throw err;
  }
};
