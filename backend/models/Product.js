import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, index: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 1 },
  mrp: { type: Number, required: true, min: 1 },
  unit: { type: String, required: true },
  netWeight: { type: String, required: true },
  grossWeight: { type: String, required: true },
  pieces: { type: String, default: 'Custom' },
  serves: { type: String, default: 'Serves 2-3' },
  eta: { type: String, default: 'Today' },
  chillingMethod: { type: String, default: 'Chilled Cold Chain' },
  catchDate: { type: String, default: 'Fresh Daily' },
  origin: { type: String, default: 'Direct Sourcing' },
  cutStyle: { type: String, default: 'Neat Curry Cut' },
  stock: { type: Number, required: true, min: 0, default: 20, index: true },
  rating: { type: Number, default: 4.8 },
  reviewsCount: { type: Number, default: 120 },
  badge: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  image: { type: String, default: '' }
}, {
  timestamps: true,
  strict: true
});

productSchema.index({ category: 1, stock: 1 });
productSchema.index({ price: 1 });

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
