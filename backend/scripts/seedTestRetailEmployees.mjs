import mongoose from 'mongoose';

import { env } from '../src/config/env.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';

if (env.nodeEnv === 'production' || !/^mongodb:\/\/(127\.0\.0\.1|localhost):27018\//.test(env.mongodbUri) || env.mongodbDbName !== 'gobook_local_demo') {
  throw new Error('This script can only seed the local gobook_local_demo database on port 27018.');
}

const people = [
  ['Arun Kumar', 'Sales', 'Sales Executive', 'Male', 'Chennai', 22000],
  ['Divya S', 'Billing', 'Cashier', 'Female', 'Chennai', 21000],
  ['Karthik Raj', 'Inventory', 'Stock Assistant', 'Male', 'Chennai', 20000],
  ['Meena Priya', 'Billing', 'Billing Executive', 'Female', 'Chennai', 23000],
  ['Suresh Babu', 'Warehouse', 'Warehouse Coordinator', 'Male', 'Chennai', 24000],
  ['Nandhini R', 'Customer Support', 'Support Associate', 'Female', 'Chennai', 21500],
  ['Vignesh P', 'Sales', 'Floor Supervisor', 'Male', 'Chennai', 26000],
  ['Pooja M', 'Accounts', 'Accounts Assistant', 'Female', 'Coimbatore', 25000],
  ['Rahul K', 'Inventory', 'Purchase Assistant', 'Male', 'Coimbatore', 22500],
  ['Sneha Lakshmi', 'HR', 'HR Assistant', 'Female', 'Coimbatore', 23500],
  ['Prakash N', 'Sales', 'Sales Executive', 'Male', 'Coimbatore', 22000],
  ['Aishwarya T', 'Billing', 'Cashier', 'Female', 'Coimbatore', 21000],
  ['Manoj V', 'Warehouse', 'Store Keeper', 'Male', 'Coimbatore', 23000],
  ['Revathi P', 'Customer Support', 'Support Executive', 'Female', 'Madurai', 24500],
  ['Bala Murugan', 'Sales', 'Sales Executive', 'Male', 'Madurai', 22000],
  ['Keerthana S', 'Accounts', 'Junior Accountant', 'Female', 'Madurai', 27000],
  ['Saravanan M', 'Inventory', 'Inventory Executive', 'Male', 'Madurai', 25500],
  ['Harini R', 'HR', 'HR Executive', 'Female', 'Madurai', 28000],
  ['Dinesh Kumar', 'Warehouse', 'Dispatch Assistant', 'Male', 'Madurai', 20500],
  ['Janani B', 'Sales', 'Sales Coordinator', 'Female', 'Madurai', 24000],
];

try {
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName, serverSelectionTimeoutMS: 5000 });
  const owner = await AppUser.findOne({ email: 'test.retail@gobook.local', category: 'retail' }).lean();
  if (!owner) throw new Error('Local test retail user was not found. Run seedLocalRetailDemo.mjs first.');

  for (const [index, [name, dept, designation, gender, branch, basicSalary]] of people.entries()) {
    const number = String(index + 1).padStart(3, '0');
    const employeeId = `DEMO-EMP-${number}`;
    const phone = `900001${String(index + 1).padStart(4, '0')}`;
    await Employee.findOneAndUpdate(
      { userId: owner._id, employeeId },
      { $set: {
        userId: owner._id, category: 'retail', employeeId, name, dept, designation,
        email: `demo.employee${index + 1}@gobook.local`, phone, gender,
        dateOfBirth: `${1988 + index % 12}-${String(index % 12 + 1).padStart(2, '0')}-15`,
        bloodGroup: ['O+', 'A+', 'B+', 'AB+'][index % 4],
        address: `${index + 1} Demo Street, ${branch}, Tamil Nadu`, branch,
        reportingManager: index < 7 ? 'Arun Kumar' : index < 13 ? 'Meena Priya' : 'Revathi P',
        employmentType: 'Full Time', shift: '09:00 AM - 06:00 PM', workLocation: branch,
        emergencyContact: { name: `Demo Contact ${index + 1}`, relationship: 'Family', phone: `900002${String(index + 1).padStart(4, '0')}` },
        status: 'Active', loginAccess: false, employeeRole: 'employee',
        joinDate: `${2022 + index % 4}-07-01`, basicSalary,
        salaryStructure: {
          hra: Math.round(basicSalary * 0.2), specialAllowance: 2000,
          conveyanceAllowance: 1600, medicalAllowance: 1000, otherAllowances: 500,
          pf: Math.round(basicSalary * 0.12), esi: 0, professionalTax: 200,
          tds: 0, otherDeduction: 0, loanDeduction: 0,
        },
      } },
      { upsert: true, new: true, runValidators: true },
    );
  }

  const count = await Employee.countDocuments({ userId: owner._id, employeeId: /^DEMO-EMP-/ });
  console.log(JSON.stringify({ owner: owner.email, demoEmployees: count, firstId: 'DEMO-EMP-001', lastId: 'DEMO-EMP-020' }));
} finally {
  await mongoose.disconnect();
}
