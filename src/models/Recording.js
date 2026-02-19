import mongoose from 'mongoose';

const RecordingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  originalName: { type: String },
  name: { type: String },
  duration: { type: String },
  createdAt: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false },
});

export default mongoose.model('Recording', RecordingSchema);