import fs from "fs";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

async function transcribeAudio() {
  try {
    const audioPath = path.join(process.cwd(), "uploads", "recording.wav");

    if (!fs.existsSync(audioPath)) {
      console.log("Audio file not found:", audioPath);
      return;
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1"
    });

    console.log(transcription.text);

  } catch (err) {
    console.error(err);
  }
}

transcribeAudio();