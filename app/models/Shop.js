import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema({
  shop: { type: String, required: true, unique: true }, // Shopify domain or ID
  name: { type: String, required: true },
  myshopifyDomain: { type: String, required: true },
  plan: { type: String, required: true },
  isPlus: { type: Boolean, default: false },
  accessToken: { type: String, required: true },
  language: { type: String, default: 'en' },
  lastLogin: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Update the updatedAt timestamp before saving
shopSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Shop = mongoose.models.Shop || mongoose.model('Shop', shopSchema); 