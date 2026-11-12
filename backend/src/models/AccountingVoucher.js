import { Schema, model } from 'mongoose';

export const VOUCHER_TYPES = [
  'Sales',
  'Purchase',
  'Sales Return',
  'Purchase Return',
  'Receipt',
  'Payment',
  'Contra',
  'Journal',
  'Debit Note',
  'Credit Note',
  'Stock Journal',
  'GST Adjustment',
  'Opening Balance',
];

const voucherLineSchema = new Schema({
  ledgerId:      { type: Schema.Types.ObjectId, ref: 'LedgerAccount' },
  ledgerName:    { type: String, required: true, trim: true },
  ledgerGroup:   { type: String, default: '', trim: true },
  side:          { type: String, enum: ['debit', 'credit'], required: true },
  amount:        { type: Number, required: true, min: 0 },
  billRef:       { type: String, default: '', trim: true },
  costCenter:    { type: String, default: '', trim: true },
  narration:     { type: String, default: '', trim: true },
  allocations: { type: [new Schema({
    type: { type: String, enum: ['New Reference', 'Against Reference', 'Advance', 'On Account'], required: true },
    reference: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0.01 },
  }, { _id: false })], default: [] },
}, { _id: true });

const accountingVoucherSchema = new Schema({
  userId:       { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  businessId:   { type: Schema.Types.ObjectId, ref: 'Business', index: true },
  branch:       { type: String, trim: true, default: '', index: true },
  voucherType:  { type: String, enum: VOUCHER_TYPES, required: true, index: true },
  voucherNo:    { type: String, required: true, trim: true },
  financialYear:{ type: String, required: true, trim: true, index: true },
  date:         { type: String, required: true, trim: true, index: true },
  partyName:    { type: String, default: '', trim: true },
  referenceNo:  { type: String, default: '', trim: true },
  entryMode:    { type: String, enum: ['manual', 'bill'], default: 'manual' },
  numberingMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  requestKey: { type: String },
  requestHash: { type: String },
  bookGroup:    { type: String, default: 'General', trim: true },
  narration:    { type: String, default: '', trim: true },
  status:       { type: String, enum: ['Draft', 'Posted', 'Cancelled'], default: 'Posted', index: true },
  sourceType:   { type: String, default: '', trim: true, index: true },
  sourceId:     { type: Schema.Types.ObjectId, index: true },
  sourceNumber: { type: String, default: '', trim: true },
  debitTotal:   { type: Number, default: 0 },
  creditTotal:  { type: Number, default: 0 },
  lines:        { type: [voucherLineSchema], default: [] },
  attachments: { type: [new Schema({
    id: { type: Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true },
    contentType: String,
    size: Number,
  }, { _id: false })], default: [] },
  revision: { type: Number, default: 1 },
  reversalOf: { type: Schema.Types.ObjectId, ref: 'AccountingVoucher' },
  reversedBy: { type: Schema.Types.ObjectId, ref: 'AccountingVoucher' },
  recurringJournalId: { type: Schema.Types.ObjectId, ref: 'RecurringJournal' },
  auditHistory: { type: [new Schema({
    action: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
    at: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
  }, { _id: false })], default: [] },
  bankReconciliations: { type: [new Schema({
    bank: { type: String, required: true, trim: true },
    reconciled: { type: Boolean, default: false },
    bankDate: { type: String, default: '' },
    bankReference: { type: String, default: '' },
    reconciliationNotes: { type: String, default: '' },
    reconciledAt: { type: Date },
  }, { _id: false })], default: [] },
  createdBy:    { type: Schema.Types.ObjectId, ref: 'AppUser' },
  updatedBy:    { type: Schema.Types.ObjectId, ref: 'AppUser' },
  postedAt:     { type: Date },
  cancelledAt:  { type: Date },
}, { timestamps: true });

accountingVoucherSchema.index({ userId: 1, financialYear: 1, voucherType: 1, voucherNo: 1 }, { unique: true });
accountingVoucherSchema.index(
  { userId: 1, sourceType: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { sourceId: { $type: 'objectId' }, sourceType: { $type: 'string' } } },
);
accountingVoucherSchema.index({ reversalOf: 1 }, { unique: true, partialFilterExpression: { reversalOf: { $type: 'objectId' } } });
accountingVoucherSchema.index({ userId: 1, requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } } });
accountingVoucherSchema.index({ userId: 1, date: -1, voucherType: 1 });
accountingVoucherSchema.index({ userId: 1, 'lines.ledgerName': 1, date: 1, status: 1 });
accountingVoucherSchema.index({ businessId: 1, userId: 1, status: 1, date: 1, branch: 1 });

export const AccountingVoucher = model('AccountingVoucher', accountingVoucherSchema);
