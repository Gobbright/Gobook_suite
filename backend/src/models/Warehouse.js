import { Schema, model } from 'mongoose';

const warehouseSchema = new Schema({
  userId:   { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  name:     { type: String, required: true, trim: true },
  code: { type: String, trim: true, uppercase: true, default: '' },
  branch: { type: String, trim: true, default: '' },
  warehouseType: { type: String, trim: true, default: '' },
  storageZones: { type: Number, default: 0, min: 0 },
  binCount: { type: Number, default: 0, min: 0 },
  rackBinEnabled: { type: Boolean, default: false },
  location: { type: String, trim: true, default: '' },
  manager:  { type: String, trim: true, default: '' },
  capacity: { type: Number, default: 0, min: 0 },
  utilized: { type: Number, default: 0, min: 0 },
  status:   { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true });

export const Warehouse = model('Warehouse', warehouseSchema);
