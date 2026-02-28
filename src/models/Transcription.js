import mongoose from 'mongoose';

const TranscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recording: { type: mongoose.Schema.Types.ObjectId, ref: 'Recording', required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Transcription', TranscriptionSchema);
