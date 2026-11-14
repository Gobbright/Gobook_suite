import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BriefcaseBusiness, FileText, Plus, Save, Trash2, Upload, UserRound } from 'lucide-react';

import { adminService } from '../../../services/adminService.js';
import { api } from '../../../../../services/api.js';
import { API_BASE_URL, SERVER_ORIGIN } from '../../../../../services/apiBase.js';
import { getToken } from '../../../../../services/authToken.js';
import { PasswordInput } from '../../../components/common/PasswordInput.jsx';
import { DEFAULT_QR_FIELDS, QR_DISPLAY_FIELDS } from '../../../services/employeeQr.js';
import { STATUTORY_FIELDS, BANK_FIELDS, SALARY_FIELDS, emptyFamilyMember } from '../../../services/employeeDetails.js';

const STEPS = ['Personal', 'Employment', 'Payroll', 'Documents', 'Review'];
const DOCUMENT_CATEGORIES = ['ID Proof', 'Address Proof', 'Certificates', 'Contracts', 'Other Documents'];
const EMPTY_DOCUMENT = { name: '', category: 'ID Proof', uploadedBy: 'Super Admin', file: null };

const initial = {
  employeeId: '', name: '', email: '', mobileNumber: '', dateOfBirth: '', gender: '', bloodGroup: '',
  address: '', emergencyName: '', emergencyRelationship: '', emergencyPhone: '',
  department: '', designation: '', branch: '', reportingManager: '', joiningDate: '', employmentType: 'Full Time',
  shift: 'General Shift', workLocation: 'Office', basicSalary: '', password: '', loginAccess: false, status: 'Active', role: 'employee',
  qrDisplayFields: { ...DEFAULT_QR_FIELDS },
  maritalStatus: '', nationality: '', qualification: '', permanentAddress: '',
  familyMembers: [], statutoryDetails: {}, bankDetails: {}, salaryStructure: {},
};

function Field({ label, required, children }) {
  return <label className="hr-field">{label}{required && <b>*</b>}{children}</label>;
}

function employeeToForm(employee) {
  const emergencyContact = employee?.emergencyContact || {};
  return {
    ...initial,
    employeeId: employee?.employeeId || '',
    name: employee?.name || '',
    email: employee?.email || '',
    mobileNumber: employee?.phone || '',
    dateOfBirth: employee?.dateOfBirth || '',
    gender: employee?.gender || '',
    bloodGroup: employee?.bloodGroup || '',
    address: employee?.address || '',
    emergencyName: emergencyContact.name || '',
    emergencyRelationship: emergencyContact.relationship || '',
    emergencyPhone: emergencyContact.phone || '',
    department: employee?.dept || '',
    designation: employee?.designation || '',
    branch: employee?.branch || '',
    reportingManager: employee?.reportingManager || '',
    joiningDate: employee?.joinDate || '',
    employmentType: employee?.employmentType || 'Full Time',
    shift: employee?.shift || 'General Shift',
    workLocation: employee?.workLocation || 'Office',
    basicSalary: employee?.basicSalary ?? '',
    loginAccess: Boolean(employee?.loginAccess),
    status: employee?.status || 'Active',
    role: employee?.employeeRole || 'employee',
    qrDisplayFields: { ...DEFAULT_QR_FIELDS, ...employee?.qrDisplayFields },
    maritalStatus: employee?.maritalStatus || '', nationality: employee?.nationality || '',
    qualification: employee?.qualification || '', permanentAddress: employee?.permanentAddress || '',
    familyMembers: employee?.familyMembers || [], statutoryDetails: employee?.statutoryDetails || {},
    bankDetails: employee?.bankDetails || {}, salaryStructure: employee?.salaryStructure || {},
  };
}

export default function AddEmployee() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [documents, setDocuments] = useState([{ ...EMPTY_DOCUMENT }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit') || '';
  const isEdit = Boolean(editId);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError('');
  }

  function choosePhoto(file) {
    if (file && (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setError('Choose a JPG or PNG photo up to 2 MB');
      return;
    }
    setPhoto(file || null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : '');
  }

  function updateDocument(index, key, value) {
    setDocuments((current) => current.map((doc, docIndex) => (
      docIndex === index ? { ...doc, [key]: value } : doc
    )));
  }

  function addDocumentRow() {
    setDocuments((current) => [...current, { ...EMPTY_DOCUMENT }]);
  }

  function removeDocumentRow(index) {
    setDocuments((current) => {
      const next = current.filter((_, docIndex) => docIndex !== index);
      return next.length ? next : [{ ...EMPTY_DOCUMENT }];
    });
  }

  async function uploadQueuedDocuments(employeeId, employeeName) {
    const readyDocuments = documents.filter((doc) => doc.file);
    await Promise.all(readyDocuments.map((doc) => {
      const formData = new FormData();
      formData.set('name', doc.name || doc.file.name);
      formData.set('category', doc.category || 'Other Documents');
      formData.set('uploadedBy', doc.uploadedBy || 'Super Admin');
      formData.set('employee', employeeName || form.name || '');
      formData.set('empId', employeeId);
      formData.set('file', doc.file);
      return api.hrUploadDocument(formData);
    }));
  }

  function validateStep(stepIndex = step) {
    if (stepIndex === 0) {
      if (!form.employeeId.trim()) return 'Employee ID is required';
      if (!form.name.trim()) return 'Full name is required';
      if (!form.mobileNumber.trim()) return 'Mobile number is required';
      if (!form.email.trim()) return 'Email address is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address';
      if (form.familyMembers.some((member) => !member.name.trim() || !member.relationship.trim())) return 'Enter a name and relationship for every family member';
      if (form.familyMembers.some((member) => member.isEmergencyContact && !member.phone.trim())) return 'Enter a mobile number for emergency family contacts';
    }
    if (stepIndex === 1 && form.loginAccess && !isEdit && !form.password) return 'Set a password to enable employee login';
    if (stepIndex === 1 && form.password && form.password.length < 8) return 'Employee password needs at least 8 characters';
    if (stepIndex === 2 && [form.basicSalary, ...Object.values(form.salaryStructure)].some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) return 'Salary amounts must be zero or greater';
    return '';
  }

  function goToStep(nextStep) {
    if (nextStep <= step) {
      setError('');
      setStep(nextStep);
      return;
    }
    const stepError = Array.from({ length: nextStep }, (_, index) => validateStep(index)).find(Boolean);
    if (stepError) {
      setError(stepError);
      return;
    }
    setError('');
    setStep(Math.min(STEPS.length - 1, nextStep));
  }

  function goNext() {
    goToStep(step + 1);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    const invalidStep = [0, 1, 2].find((index) => validateStep(index));
    const firstStepError = invalidStep === undefined ? '' : validateStep(invalidStep);
    if (firstStepError) {
      setStep(invalidStep);
      return setError(firstStepError);
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        phone: form.mobileNumber,
        emergencyContact: { name: form.emergencyName, relationship: form.emergencyRelationship, phone: form.emergencyPhone },
        basicSalary: Number(form.basicSalary || 0),
      };
      if (!payload.password) delete payload.password;
      let savedEmployee = null;
      if (isEdit) {
        if (photo) {
          const formData = new FormData();
          Object.entries(payload).forEach(([key, value]) => formData.append(key, typeof value === 'object' ? JSON.stringify(value) : value));
          formData.append('photo', photo);
          savedEmployee = await adminService.updateEmployeeWithPhoto(editId, formData);
        } else savedEmployee = await adminService.updateEmployee(editId, payload);
      } else if (photo) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          formData.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
        });
        formData.append('photo', photo);
        savedEmployee = await adminService.createEmployeeWithPhoto(formData);
      } else {
        savedEmployee = await adminService.createEmployee(payload);
      }
      const employeeId = savedEmployee?._id || editId;
      if (employeeId) await uploadQueuedDocuments(employeeId, savedEmployee?.name || form.name);
      navigate('/employee-management/employees', { state: { savedEmployeeId: String(employeeId || ''), savedEmployeeName: savedEmployee?.name || form.name } });
    } catch (err) {
      setError(err.message || 'Unable to save employee');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadEmployee() {
      if (!editId) {
        setForm(initial);
        setPhotoPreview('');
        setPhoto(null);
        return;
      }
      setLoadingEmployee(true);
      setError('');
      try {
        const response = await adminService.employees();
        const employee = (response?.data || []).find((item) => item._id === editId);
        if (!employee) throw new Error('Employee not found');
        if (!active) return;
        setForm(employeeToForm(employee));
        const photoUrl = employee.photo?.url || '';
        if (employee.photo?.gridFsFileId) {
          const response = await fetch(`${API_BASE_URL}/files/employee-assets/${employee.photo.gridFsFileId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
          if (response.ok && active) setPhotoPreview(URL.createObjectURL(await response.blob()));
        } else setPhotoPreview(photoUrl.startsWith('/') ? `${SERVER_ORIGIN}${photoUrl}` : photoUrl);
        setDocuments([{ ...EMPTY_DOCUMENT }]);
      } catch (err) {
        if (active) setError(err.message || 'Unable to load employee');
      } finally {
        if (active) setLoadingEmployee(false);
      }
    }
    loadEmployee();
    return () => { active = false; };
  }, [editId]);

  return (
    <form className="hr-screen employee-add-screen" onSubmit={submit}>
      <div className="hr-breadcrumb"><Link to="/employee-management/employees"><ArrowLeft size={15} /> Employees</Link><span>/</span><strong>{isEdit ? 'Edit Employee' : 'Add Employee'}</strong></div>
      <div className="hr-page-head">
        <div><h1>{isEdit ? 'Edit Employee' : 'Add New Employee'}</h1><p>{isEdit ? 'Update employee profile and employment details' : 'Create employee profile and configure employment details'}</p></div>
        <div className="hr-actions"><button className="app-save-button hr-btn primary" disabled={saving || loadingEmployee}>{saving ? 'Saving...' : isEdit ? 'Update Employee' : 'Submit Employee'}</button></div>
      </div>
      {error && <p className="error">{error}</p>}
      {loadingEmployee && <p className="muted">Loading employee details...</p>}

      <div className="hr-stepper">{STEPS.map((label, index) => <button key={label} type="button" className={index === step ? 'active' : ''} onClick={() => goToStep(index)}><span>{index + 1}</span>{label}</button>)}</div>

      <div className="hr-form-layout">
        <section className="hr-card">
          {step === 0 && (
            <>
              <h2>Personal Information</h2>
              <div className="hr-form-grid">
                <label className="hr-upload-box employee-photo-upload">
                  {photoPreview ? <img src={photoPreview} alt="Selected employee profile" /> : <Upload size={24} />}
                  <span>{photo ? photo.name : 'Click to upload'}</span>
                  <small>{photo ? `${Math.max(1, Math.round(photo.size / 1024))} KB` : 'JPG, PNG (Max 2MB)'}</small>
                  <input accept=".jpg,.jpeg,.png,image/jpeg,image/png" type="file" onChange={(e) => choosePhoto(e.target.files?.[0])} />
                </label>
                <Field label="Employee ID" required><input value={form.employeeId} readOnly={isEdit} onChange={(e) => set('employeeId', e.target.value)} placeholder="EMP-00129" /></Field>
                <Field label="Full Name" required><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Enter full name" /></Field>
                <Field label="Date of Birth"><input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></Field>
                <Field label="Gender"><select value={form.gender} onChange={(e) => set('gender', e.target.value)}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
                <Field label="Blood Group"><select value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}><option value="">Select Blood Group</option>{['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((v) => <option key={v}>{v}</option>)}</select></Field>
                <Field label="Mobile" required><input value={form.mobileNumber} onChange={(e) => set('mobileNumber', e.target.value)} placeholder="Enter mobile number" /></Field>
                <Field label="Email" required><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="Enter email address" /></Field>
                <Field label="Address"><textarea value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Enter full address" /></Field>
                <Field label="Marital Status"><select value={form.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)}><option value="">Select status</option>{['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'].map((value) => <option key={value}>{value}</option>)}</select></Field>
                <Field label="Nationality"><input value={form.nationality} onChange={(e) => set('nationality', e.target.value)} /></Field>
                <Field label="Qualification"><input value={form.qualification} onChange={(e) => set('qualification', e.target.value)} /></Field>
                <Field label="Permanent Address"><textarea value={form.permanentAddress} onChange={(e) => set('permanentAddress', e.target.value)} /></Field>
              </div>
              <div className="hr-doc-step-head"><h3>Family Members</h3><button className="hr-btn soft" type="button" disabled={form.familyMembers.length >= 20} onClick={() => set('familyMembers', [...form.familyMembers, emptyFamilyMember()])}><Plus size={14} />Add Family Member</button></div>
              <div className="hr-document-form-list">{form.familyMembers.map((member, index) => {
                const updateMember = (key, value) => set('familyMembers', form.familyMembers.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
                return <section className="hr-document-form-card" key={index}>
                  <div className="hr-document-form-title"><strong>Family member {index + 1}</strong><button className="hr-icon-btn danger" type="button" aria-label={`Remove family member ${index + 1}`} onClick={() => set('familyMembers', form.familyMembers.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14} /></button></div>
                  <div className="hr-form-grid">
                    <Field label="Family Member Name" required><input value={member.name} onChange={(e) => updateMember('name', e.target.value)} /></Field>
                    <Field label="Relationship" required><input value={member.relationship} onChange={(e) => updateMember('relationship', e.target.value)} placeholder="Mother, father, spouse, child..." /></Field>
                    <Field label="Family Mobile"><input type="tel" value={member.phone} onChange={(e) => updateMember('phone', e.target.value)} /></Field>
                    <Field label="Family Date of Birth"><input type="date" value={member.dateOfBirth} onChange={(e) => updateMember('dateOfBirth', e.target.value)} /></Field>
                    <Field label="Occupation"><input value={member.occupation} onChange={(e) => updateMember('occupation', e.target.value)} /></Field>
                    <Field label="Use as Emergency Contact"><input type="checkbox" checked={member.isEmergencyContact} onChange={(e) => updateMember('isEmergencyContact', e.target.checked)} /></Field>
                  </div>
                </section>;
              })}</div>
              <h3>Emergency Contact</h3>
              <div className="hr-form-grid three">
                <Field label="Name"><input value={form.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} placeholder="Enter name" /></Field>
                <Field label="Relationship"><input value={form.emergencyRelationship} onChange={(e) => set('emergencyRelationship', e.target.value)} placeholder="Relationship" /></Field>
                <Field label="Mobile"><input value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} placeholder="Enter mobile number" /></Field>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h2>Employment Details</h2>
              <div className="hr-form-grid">
                <Field label="Department"><input value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="Front Office" /></Field>
                <Field label="Designation"><input value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="Senior Front Desk Executive" /></Field>
                <Field label="Branch"><input value={form.branch} onChange={(e) => set('branch', e.target.value)} placeholder="Chennai" /></Field>
                <Field label="Reporting Manager"><input value={form.reportingManager} onChange={(e) => set('reportingManager', e.target.value)} placeholder="Manager name" /></Field>
                <Field label="Joining Date"><input type="date" value={form.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} /></Field>
                <Field label="Employment Type"><select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>{['Full Time', 'Part Time', 'Contract', 'Intern', 'Temporary', 'Consultant'].map((v) => <option key={v}>{v}</option>)}</select></Field>
                <Field label="Shift"><input list="employee-shift-options" value={form.shift} onChange={(e) => set('shift', e.target.value)} placeholder="Select or enter a shift" /><datalist id="employee-shift-options"><option value="General Shift" /><option value="Day Shift" /><option value="Night Shift" /><option value="Rotational Shift" /><option value="6-Day Shift" /></datalist></Field>
                <Field label="Work Location"><input value={form.workLocation} onChange={(e) => set('workLocation', e.target.value)} /></Field>
                <Field label="Enable Employee Login (Password + Email OTP)"><input type="checkbox" checked={form.loginAccess} onChange={(e) => set('loginAccess', e.target.checked)} /></Field>
                <Field label={isEdit ? 'Set New Employee Password' : 'Employee Password'}><PasswordInput autoComplete="new-password" minLength={8} maxLength={72} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={isEdit ? 'Leave blank to keep existing password' : 'Set at least 8 characters'} /></Field>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>Payroll Setup</h2>
              <div className="hr-form-grid">
                <Field label="Monthly Basic Salary"><input type="number" min="0" value={form.basicSalary} onChange={(e) => set('basicSalary', e.target.value)} /></Field>
                <Field label="Status"><select value={form.status} onChange={(e) => set('status', e.target.value)}>{['Active', 'Probation', 'On Leave', 'Inactive', 'Resigned', 'Terminated'].map((v) => <option key={v}>{v}</option>)}</select></Field>
                {SALARY_FIELDS.map(([key, label]) => <Field label={label} key={key}><input type="number" min="0" step="0.01" placeholder="Default" value={form.salaryStructure[key] ?? ''} onChange={(e) => set('salaryStructure', { ...form.salaryStructure, [key]: e.target.value })} /></Field>)}
              </div>
              <h3>PF &amp; ESI Details</h3><div className="hr-form-grid">{STATUTORY_FIELDS.map(([key, label]) => <Field key={key} label={label}><input value={form.statutoryDetails[key] || ''} onChange={(e) => set('statutoryDetails', { ...form.statutoryDetails, [key]: e.target.value })} /></Field>)}</div>
              <h3>Salary Bank Account</h3><div className="hr-form-grid">{BANK_FIELDS.map(([key, label]) => <Field key={key} label={label}><input value={form.bankDetails[key] || ''} onChange={(e) => set('bankDetails', { ...form.bankDetails, [key]: e.target.value })} /></Field>)}</div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="hr-doc-step-head">
                <div>
                  <h2>Documents</h2>
                  <p>Attach ID proof, address proof, certificates, contracts, or other employee files.</p>
                </div>
                <button className="hr-btn soft" type="button" onClick={addDocumentRow}><Plus size={14} /> Add Document</button>
              </div>
              <div className="hr-document-form-list">
                {documents.map((doc, index) => (
                  <section className="hr-document-form-card" key={index}>
                    <div className="hr-document-form-title">
                      <span><FileText size={15} /> Document {index + 1}</span>
                      <button className="hr-icon-btn danger" type="button" aria-label="Remove document" onClick={() => removeDocumentRow(index)}><Trash2 size={14} /></button>
                    </div>
                    <div className="hr-form-grid">
                      <Field label="Document Name">
                        <input value={doc.name} onChange={(e) => updateDocument(index, 'name', e.target.value)} placeholder="Aadhaar, offer letter, certificate..." />
                      </Field>
                      <Field label="Category">
                        <select value={doc.category} onChange={(e) => updateDocument(index, 'category', e.target.value)}>
                          {DOCUMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </Field>
                      <Field label="Upload File">
                        <input type="file" accept=".pdf,image/*,video/mp4,video/webm,video/quicktime,.mkv" onChange={(e) => updateDocument(index, 'file', e.target.files?.[0] || null)} />
                      </Field>
                      <Field label="Uploaded By">
                        <input value={doc.uploadedBy} onChange={(e) => updateDocument(index, 'uploadedBy', e.target.value)} placeholder="Super Admin" />
                      </Field>
                    </div>
                    {doc.file && <p className="hr-document-file-note">{doc.file.name} - {Math.max(1, Math.round(doc.file.size / 1024))} KB</p>}
                  </section>
                ))}
              </div>
            </>
          )}
          {step === 4 && <div className="hr-review"><h2>Review</h2>{[['Name', form.name], ['Email', form.email], ['Department', form.department], ['Designation', form.designation], ['Branch', form.branch], ['Employment Type', form.employmentType], ['Status', form.status]].map(([k, v]) => <p key={k}><span>{k}</span><strong>{v || '-'}</strong></p>)}<section className="employee-qr-display-settings"><h3>Details visible on this employee's QR</h3><p>Choose what appears on the downloaded QR card and its scan page.</p><fieldset><legend className="sr-only">Employee QR details</legend>{QR_DISPLAY_FIELDS.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(form.qrDisplayFields[key])} onChange={(event) => setForm((current) => ({ ...current, qrDisplayFields: { ...current.qrDisplayFields, [key]: event.target.checked } }))} />{label}</label>)}</fieldset></section></div>}

          <div className="hr-form-actions">
            <button className="hr-btn" type="button" disabled={step === 0} onClick={() => goToStep(step - 1)}>
              <span className="hr-desktop-action-label">Back</span>
              <span className="hr-mobile-action-label">Previous</span>
            </button>
            {step < STEPS.length - 1 ? (
              <button className="app-save-button hr-btn primary" type="button" onClick={goNext}>
                <span className="hr-desktop-action-label">Next</span>
                <span className="hr-mobile-action-label">Next</span>

              </button>
            ) : <button className="hr-btn primary" disabled={saving || loadingEmployee}><Save size={14} /> {isEdit ? 'Update Employee' : 'Submit Employee'}</button>}
          </div>
        </section>

        <aside className="hr-side-stack">
          <section className="hr-card"><h2>Employment Types</h2>{['Full Time', 'Part Time', 'Contract', 'Intern', 'Temporary', 'Consultant'].map((type) => <button className={form.employmentType === type ? 'hr-type active' : 'hr-type'} type="button" key={type} onClick={() => set('employmentType', type)}><BriefcaseBusiness size={15} /><span>{type}<small>{type === 'Full Time' ? 'Regular full time employment' : `${type} employment`}</small></span></button>)}</section>
          <section className="hr-card"><h2>Workflow</h2>{STEPS.map((label, index) => <div className={index <= step ? 'hr-workflow done' : 'hr-workflow'} key={label}><span />{label}</div>)}</section>
          <section className="hr-card"><h2>Profile</h2><div className="hr-profile-mini"><UserRound size={34} /><strong>{form.name || 'New Employee'}</strong><span>{form.designation || 'Designation not set'}</span></div></section>
        </aside>
      </div>
    </form>
  );
}
