import { Schema, model } from 'mongoose';

const employeeSchema = new Schema({
  userId:      { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  category:    { type: String, default: '', trim: true },
  employeeId:  { type: String, required: true, trim: true },
  name:        { type: String, required: true, trim: true },
  dept:        { type: String, default: '', trim: true },
  designation: { type: String, default: '', trim: true },
  email:       { type: String, default: '', trim: true },
  phone:       { type: String, default: '', trim: true },
  gender:      { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
  dateOfBirth: { type: String, default: '', trim: true },
  bloodGroup:  { type: String, default: '', trim: true },
  address:     { type: String, default: '', trim: true },
  maritalStatus: { type: String, default: '', trim: true },
  nationality: { type: String, default: '', trim: true },
  qualification: { type: String, default: '', trim: true },
  permanentAddress: { type: String, default: '', trim: true },
  familyMembers: [{
    _id: false,
    name: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    dateOfBirth: { type: String, default: '', trim: true },
    occupation: { type: String, default: '', trim: true },
    isEmergencyContact: { type: Boolean, default: false },
  }],
  statutoryDetails: {
    pfNumber: { type: String, default: '', trim: true },
    uan: { type: String, default: '', trim: true },
    esiNumber: { type: String, default: '', trim: true },
    pan: { type: String, default: '', trim: true },
  },
  bankDetails: {
    accountName: { type: String, default: '', trim: true },
    bankName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    ifsc: { type: String, default: '', trim: true },
    branch: { type: String, default: '', trim: true },
  },
  branch:      { type: String, default: '', trim: true },
  reportingManager: { type: String, default: '', trim: true },
  employmentType: { type: String, default: 'Full Time', trim: true },
  shift:       { type: String, default: '', trim: true },
  workLocation: { type: String, default: '', trim: true },
  emergencyContact: {
    name: { type: String, default: '', trim: true },
    relationship: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
  },
  status:      { type: String, enum: ['Active', 'Inactive', 'Probation', 'On Leave', 'Resigned', 'Terminated'], default: 'Active' },
  loginAccess: { type: Boolean, default: false },
  portalVersion: { type: Number, default: 1, min: 1 },
  portalAlias: { type: String, index: true },
  qrDisplayFields: {
    photo: { type: Boolean, default: true }, name: { type: Boolean, default: true }, employeeId: { type: Boolean, default: true },
    role: { type: Boolean, default: true }, address: { type: Boolean, default: true }, phone: { type: Boolean, default: true }, email: { type: Boolean, default: false },
  },
  emailVerifiedAddress: { type: String, default: '' },
  emailVerifiedAt: Date,
  // Legacy field: exclude reads and prevent new plaintext writes, including seeds/imports.
  loginPassword: { type: String, select: false, set: () => undefined },
  employeeRole: { type: String, enum: ['admin', 'hr', 'employee'], default: 'employee' },
  joinDate:    { type: String, default: '' },
  basicSalary: { type: Number, default: 0 },
  salaryStructure: {
    hra: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    conveyanceAllowance: { type: Number, default: 1600 },
    medicalAllowance: { type: Number, default: 1000 },
    otherAllowances: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    esi: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 200 },
    tds: { type: Number, default: 0 },
    otherDeduction: { type: Number, default: 500 },
    loanDeduction: { type: Number, default: 0 },
  },
  photo: {
    originalName: { type: String, default: '', trim: true },
    fileName:     { type: String, default: '', trim: true },
    gridFsFileId: { type: Schema.Types.ObjectId },
    url:          { type: String, default: '', trim: true },
    size:         { type: Number, default: 0 },
    mimeType:     { type: String, default: '', trim: true },
    uploadedAt:   { type: Date },
  },
}, { timestamps: true });

employeeSchema.index({ userId: 1, employeeId: 1 }, { unique: true });
employeeSchema.index({ userId: 1, status: 1, dept: 1 });
employeeSchema.index({ userId: 1, name: 1 });
employeeSchema.index({ userId: 1, createdAt: -1 });

export const Employee = model('Employee', employeeSchema);
