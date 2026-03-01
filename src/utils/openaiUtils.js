import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// Configure fluent-ffmpeg to use the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

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
    const fileStat = fs.statSync(filePath);
    if (!fileStat?.size || fileStat.size < 1024) {
      throw new Error('Uploaded audio file is empty or too small to decode');
    }

    let hintName = filename.includes('.') ? filename : `${filename}.m4a`;
    let processFilePath = filePath;
    const convertedPath = `${filePath}.wav`;

    // Try to convert using ffmpeg to ensure compatibility, especially for iOS/mobile uploads
    try {
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .noVideo()
          .audioChannels(1)
          .audioFrequency(16000)
          .audioCodec('pcm_s16le')
          .toFormat('wav')
          .on('error', (err) => {
            console.warn('FFmpeg conversion failed or ffmpeg not installed. Falling back to original file:', err.message);
            resolve(); // Resolve anyway to fallback to original file
          })
          .on('end', () => {
            processFilePath = convertedPath;
            hintName = `${filename}.wav`;
            resolve();
          })
          .save(convertedPath);
      });
    } catch (conversionErr) {
      console.warn('Audio conversion step skipped:', conversionErr.message);
    }

    const hintCandidates = [
      hintName,
      `${filename}.m4a`,
      `${filename}.mp4`,
      `${filename}.wav`,
      `${filename}.mp3`,
      `${filename}.aac`,
      `${filename}.webm`,
    ];

    let transcription = null;
    let lastError = null;

    for (const candidateHint of hintCandidates) {
      try {
        transcription = await openai.audio.transcriptions.create({
          file: await OpenAI.toFile(fs.createReadStream(processFilePath), candidateHint),
          model: 'whisper-1',
          language: 'en',
        });
        if (transcription?.text) {
          break;
        }
      } catch (candidateError) {
        lastError = candidateError;
      }
    }

    if (!transcription?.text) {
      throw lastError || new Error('Audio decode failed for all supported hints');
    }

    // Cleanup converted file if one was created
    if (processFilePath !== filePath && fs.existsSync(processFilePath)) {
      fs.unlinkSync(processFilePath);
    }

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
          content: "You are a helpful assistant that labels speakers in a transcript. Given a raw transcript, identify when different people are speaking and label them as 'Speaker 1:', 'Speaker 2:', up to as many speakers as there are (e.g., 'Speaker 3:', 'Speaker 4:', etc.). Return the transcript with these labels inserted. CRITICAL RULES:\n1. Do NOT change, omit, or summarize the original text.\n2. EVERY single word from the original transcript must be present in your output.\n3. ALWAYS add a speaker label, even if there is only one speaker or if the transcript is just a single word. Default to 'Speaker 1:' if only one person is speaking."
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
