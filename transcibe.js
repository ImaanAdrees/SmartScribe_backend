import fs from "fs";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

async function transcribeAudio() {
  try {
    // Path to the uploaded audio file
    const audioPath = path.join(process.cwd(), "uploads", "recording.wav"); 
    // change filename if needed

    if (!fs.existsSync(audioPath)) {
      console.log("Audio file not found:", audioPath);
      return;
    }

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "gpt-4o-transcribe", // latest OpenAI speech-to-text
      // model: "whisper-1" // optional older whisper model
    });

    console.log("Transcription:\n");
    console.log(transcription.text);

  } catch (error) {
    console.error("Transcription error:", error);
  }
}

transcribeAudio();