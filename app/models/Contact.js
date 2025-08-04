import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  password: {
    type: String
  },
  reason: {
    type: String,
    enum: ['other', 'technical', 'billing', 'feature'],
    default: 'other'
  },
  page: {
    type: String
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['new', 'read', 'replied'],
    default: 'new'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema); 