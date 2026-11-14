import { Schema, model } from 'mongoose';

const layoutSchema = new Schema({
  width: { type: Number, min: 20, max: 100 },
  height: { type: Number, min: 0, max: 1600 },
  paddingX: { type: Number, min: 0, max: 160 },
  paddingY: { type: Number, min: 0, max: 160 },
  marginTop: { type: Number, min: 0, max: 160 },
  radius: { type: Number, min: 0, max: 100 },
  fontSize: { type: Number, min: 10, max: 48 },
  headingSize: { type: Number, min: 12, max: 120 },
  buttonSize: { type: Number, min: 10, max: 40 },
  align: { type: String, enum: ['left', 'center', 'right'] },
  backgroundColor: { type: String, match: /^#[\da-f]{6}$/i },
  textColor: { type: String, match: /^#[\da-f]{6}$/i },
}, { _id: false });
const responsiveLayoutSchema = new Schema({ desktop: layoutSchema, tablet: layoutSchema, mobile: layoutSchema }, { _id: false });

const themeSchema = new Schema({
  name: { type: String, enum: ['boutique', 'marketplace', 'premium', 'aurora', 'goldenhue'], default: 'boutique' },
  primaryColor: { type: String, trim: true, default: '#2563eb' },
  logoUrl: { type: String, trim: true, default: '' },
  bannerImageUrl: { type: String, trim: true, default: '' },
  announcement: { type: String, trim: true, maxlength: 180, default: '' },
  heroTitle: { type: String, trim: true, maxlength: 120, default: '' },
  heroText: { type: String, trim: true, maxlength: 300, default: '' },
  heroButton: { type: String, trim: true, maxlength: 40, default: '' },
  productsTitle: { type: String, trim: true, maxlength: 80, default: 'Products' },
  footerText: { type: String, trim: true, maxlength: 300, default: '' },
  fontFamily: { type: String, enum: ['sans', 'serif', 'mono'], default: 'sans' },
  productColumns: { type: Number, enum: [0, 2, 3, 4, 5], default: 0 },
  showHero: { type: Boolean, default: true },
  showBenefits: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },
  bannerFit: { type: String, enum: ['cover', 'contain'], default: 'cover' },
  bannerPosition: { type: String, enum: ['center', 'top', 'bottom', 'left', 'right'], default: 'center' },
  sectionStyles: { header: responsiveLayoutSchema, hero: responsiveLayoutSchema, products: responsiveLayoutSchema, benefits: responsiveLayoutSchema, footer: responsiveLayoutSchema },
  pageStyles: { type: Schema.Types.Mixed, default: () => ({}) },
  pageContent: { type: Schema.Types.Mixed, default: () => ({}) },
  pageVisibility: { type: Schema.Types.Mixed, default: () => ({}) },
  deviceContent: { type: Schema.Types.Mixed, default: () => ({}) },
  sectionOrder: { type: Schema.Types.Mixed, default: () => ({}) },
  responsiveOrder: { type: Schema.Types.Mixed, default: () => ({}) },
  blocks: { type: [Schema.Types.Mixed], default: () => [] },
}, { _id: false });

const onlineStoreSettingsSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', index: true },
  enabled: { type: Boolean, default: false, index: true },
  storeName: { type: String, trim: true, default: '' },
  slug: { type: String, trim: true, lowercase: true },
  tagline: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  address: { type: String, trim: true, default: '' },
  orderMode: { type: String, enum: ['inquiry', 'cod'], default: 'inquiry' },
  theme: { type: themeSchema, default: () => ({}) },
  templateDesigns: {
    boutique: { type: themeSchema, default: undefined },
    marketplace: { type: themeSchema, default: undefined },
    premium: { type: themeSchema, default: undefined },
    aurora: { type: themeSchema, default: undefined },
    goldenhue: { type: themeSchema, default: undefined },
  },
}, { timestamps: true });

onlineStoreSettingsSchema.index({ slug: 1 }, { unique: true, sparse: true });
onlineStoreSettingsSchema.index({ userId: 1 }, { unique: true });

export const OnlineStoreSettings = model('OnlineStoreSettings', onlineStoreSettingsSchema);
