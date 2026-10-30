import mongoose from 'mongoose';
import { isSafeImageUrl } from '../utils/resourceRules.js';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  type: { type: String, enum: ['room', 'lab', 'equipment'], required: true },
  capacity: { type: Number, required: true, min: 1, max: 10000, validate: Number.isInteger },
  location: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
  description: { type: String, default: '', maxlength: 2000 },
  imageUrl: { type: String, default: '', maxlength: 2048, validate: isSafeImageUrl },
  isActive: { type: Boolean, default: true },
  bookingVersion: { type: Number, default: 0, select: false },
  deletedAt: { type: Date, default: null, select: false },
}, { timestamps: true });
schema.index({ deletedAt: 1, isActive: 1, name: 1, _id: 1 });
schema.index({ deletedAt: 1, type: 1, isActive: 1 });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ deletedAt: -1, _id: -1 }, { partialFilterExpression: { deletedAt: { $type: 'date' } } });
schema.set('toJSON', { transform: (_doc, value) => { delete value.bookingVersion; delete value.deletedAt; delete value.__v; return value; } });
export const Resource = mongoose.model('Resource', schema);
