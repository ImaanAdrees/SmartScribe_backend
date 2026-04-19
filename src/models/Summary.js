import mongoose from 'mongoose';


const SummarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recording: { type: mongoose.Schema.Types.ObjectId, ref: 'Recording', required: true },
  summaryText: { type: String, required: true },
  headings: [{ type: String }],
  title: { type: String }, // Store the recording name/title
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('Summary', SummarySchema);
