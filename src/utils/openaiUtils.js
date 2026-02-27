import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
  timeout: 120 * 1000, // 2 minutes
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

/**
 * Uses GPT-4o to identify and label different speakers in a transcript
 * @param {string} text - Raw transcript text
 * @returns {Promise<string>} - Labeled transcript text
 */
export const labelSpeakers = async (text) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that labels speakers in a transcript. Given a raw transcript, identify when different people are speaking and label them as 'Speaker 1:', 'Speaker 2:', etc. Return the transcript with these labels inserted. Do not change the original text, only add labels and line breaks between speakers. If there's only one speaker, you don't need to add labels unless it's clearly a dialogue."
        },
        {
          role: "user",
          content: `Please label the speakers in this transcript:\n\n${text}`
        }
      ],
      temperature: 0,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.error('GPT Speaker Labeling Error:', err);
    return text; // Fallback to raw text if GPT fails
  }
};
