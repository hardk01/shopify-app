import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  shop: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['image_compression', 'webp_conversion', 'alt_text'],
    required: true
  },
  count: {
    type: Number,
    required: true,
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient querying by shop and date range
activityLogSchema.index({ shopId: 1, createdAt: -1 });
activityLogSchema.index({ shop: 1, createdAt: -1 });
activityLogSchema.index({ shopId: 1, type: 1, createdAt: -1 });

export const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);
