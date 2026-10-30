import mongoose from 'mongoose';
import { BOOKING_STATUS_POLICY } from '../utils/bookingRules.js';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  purpose: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: Object.keys(BOOKING_STATUS_POLICY), default: 'confirmed' },
  rejectionReason: { type: String, default: '' },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ resource: 1, status: 1, startTime: 1, endTime: 1 });
schema.index({ user: 1, createdAt: -1 });
schema.index({ user: 1, status: 1, endTime: 1, startTime: 1 });
schema.index({ status: 1, endTime: 1, startTime: 1 });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ cancelledAt: -1, _id: -1 }, { partialFilterExpression: { cancelledAt: { $type: 'date' } } });
export const Booking = mongoose.model('Booking', schema);
