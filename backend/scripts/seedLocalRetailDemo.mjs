import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { env } from '../src/config/env.js';
import { AppUser } from '../src/models/AppUser.js';
import { Business } from '../src/models/Business.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Branch } from '../src/models/Branch.js';
import { Customer } from '../src/models/Customer.js';
import { Invoice } from '../src/models/Invoice.js';
import { Lead } from '../src/models/Lead.js';
import { Product } from '../src/models/Product.js';
import { ProductBrand } from '../src/models/ProductBrand.js';
import { ProductCategory } from '../src/models/ProductCategory.js';
import { ProductSubcategory } from '../src/models/ProductSubcategory.js';
import { SalesRecord } from '../src/models/SalesRecord.js';
import { Vendor } from '../src/models/Vendor.js';
import { Warehouse } from '../src/models/Warehouse.js';

if (env.nodeEnv === 'production' || !/^mongodb:\/\/(127\.0\.0\.1|localhost):27018\//.test(env.mongodbUri) || env.mongodbDbName !== 'gobook_local_demo') {
  throw new Error('This seed runs only against the gobook_local_demo database on local MongoDB port 27018.');
}

const email = 'test.retail@gobook.local';
const password = 'Test@12345';
const today = new Date().toISOString().slice(0, 10);
const expiry = new Date(Date.now() + 365 * 86400000);
const upsert = (Model, filter, data) => Model.findOneAndUpdate(filter, { $set: data }, { upsert: true, new: true, runValidators: true });

try {
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName, serverSelectionTimeoutMS: 5000 });
  const business = await upsert(Business, { name: 'Test Retail Demo' }, { name: 'Test Retail Demo', category: 'retail' });
  const user = await upsert(AppUser, { email }, {
    name: 'test', email, password: await bcrypt.hash(password, 12), authProvider: 'email', emailVerified: true,
    businessId: business._id, businessName: business.name, category: 'retail', accountType: 'owner',
    subscriptionPlan: 'professional', subscriptionAmount: 0, subscriptionStatus: 'active',
    subscriptionStartDate: new Date(), subscriptionExpiresAt: expiry, trialEndsAt: expiry,
    billingStatus: 'SUBSCRIPTION_ACTIVE',
    onboardingCompleted: true, role: 'Owner', branch: 'Chennai', phone: '9000000000', status: 'Active',
  });
  const userId = user._id;
  await upsert(BusinessSettings, { userId }, {
    businessName: business.name, businessEmail: email, phone: '9000000000', address: '12 Demo Street, T Nagar',
    city: 'Chennai', state: 'Tamil Nadu', pincode: '600017', invoicePrefix: 'DEMO-INV-',
    bankName: 'Demo Bank', accountHolderName: business.name, accountNumber: '000000000001',
    ifscCode: 'DEMO0000001', bankBranch: 'Chennai', accountType: 'Current',
  });

  const branches = [
    ['Chennai', 'CHN', 'Arun Kumar', 'Chennai', '600017'],
    ['Coimbatore', 'CBE', 'Meena Raj', 'Coimbatore', '641001'],
    ['Madurai', 'MDU', 'Kavin S', 'Madurai', '625001'],
  ];
  for (const [name, code, manager, city, pincode] of branches) {
    await upsert(Branch, { userId, code }, { userId, name, code, manager, phone: '9000000000', email: `${code.toLowerCase()}@gobook.local`, address: `1 Demo Road, ${city}`, city, state: 'Tamil Nadu', pincode, status: 'Active', users: 1, revenue: 0 });
    await upsert(Warehouse, { userId, code: `WH-${code}` }, { userId, name: `${name} Warehouse`, code: `WH-${code}`, branch: name, warehouseType: 'Retail', storageZones: 3, binCount: 30, rackBinEnabled: true, location: `1 Demo Road, ${city}`, manager, capacity: 1000, utilized: 100, status: 'Active' });
  }

  const categories = [
    ['Grocery', 'Staples', 'Demo grocery products', 'Demo Foods'],
    ['Home Care', 'Cleaning', 'Demo household products', 'Demo Home'],
    ['Stationery', 'Writing', 'Demo stationery products', 'Demo Office'],
  ];
  for (const [name, sub, description, brand] of categories) {
    const category = await upsert(ProductCategory, { userId, name }, { userId, name, subCategories: [sub], description, status: 'Active' });
    await upsert(ProductSubcategory, { userId, name: sub }, { userId, categoryId: category._id, categoryName: name, name: sub, description: `${sub} demo items`, status: 'Active' });
    await upsert(ProductBrand, { userId, name: brand }, { userId, name: brand, description: `${brand} sample brand`, status: 'Active' });
  }

  const products = [
    ['DEMO-RICE-1KG', 'Demo Rice 1 kg', 'Grocery', 'Staples', 'Demo Foods', 80, 60, 100, '100630'],
    ['DEMO-SOAP-500', 'Demo Liquid Soap 500 ml', 'Home Care', 'Cleaning', 'Demo Home', 120, 85, 75, '340220'],
    ['DEMO-NOTE-A5', 'Demo A5 Notebook', 'Stationery', 'Writing', 'Demo Office', 50, 30, 120, '482010'],
  ];
  const savedProducts = [];
  for (const [code, description, category, subCategory, brand, rate, purchasePrice, stock, hsn] of products) {
    savedProducts.push(await upsert(Product, { userId, code }, {
      userId, branch: 'Chennai', code, description, shortName: description, aliasCode: code,
      productDescription: `${description} for local demo`, itemType: 'Product', productType: 'Standard',
      hsn, unit: 'Nos', baseUnit: 'Nos', salesUnit: 'Nos', purchaseUnit: 'Nos', conversionQty: 1,
      rate, purchasePrice, landingCost: purchasePrice, mrp: rate + 10, minSellingPrice: purchasePrice,
      gstRate: 5, taxType: 'Tax Exclusive', category, subCategory, brand, itemGroup: 'General',
      barcode: code, stock, openingStockValue: stock * purchasePrice, reorderLevel: 10,
      minStockLevel: 10, maxStockLevel: 200, preferredSupplier: `Demo ${brand} Supplier`,
      leadTimeDays: 3, minOrderQty: 5, maxOrderQty: 100, status: 'Active',
    }));
  }

  const names = ['Arun Stores', 'Meena Mart', 'Kavin Traders'];
  for (let i = 0; i < 3; i += 1) {
    const name = names[i];
    const branch = branches[i][0];
    const city = branches[i][3];
    const pincode = branches[i][4];
    const phone = `900000000${i + 1}`;
    const customerEmail = `customer${i + 1}@gobook.local`;
    const contact = { userId, branch, name, phone, email: customerEmail, address: `${i + 1} Demo Street`, city, state: 'Tamil Nadu', pincode,
      gstin: `33AAAAA000${i + 1}A1Z${i + 1}`, bankName: 'Demo Bank', accountHolderName: name,
      accountNumber: `00000000000${i + 2}`, ifscCode: 'DEMO0000001', bankBranch: city };
    await upsert(Customer, { userId, name }, { ...contact, status: 'Active', customerType: 'Retail', creditLimit: 10000, shippingAddress: `${i + 1} Demo Street, ${city}`, notes: 'Local demo customer', sales: 0 });
    await upsert(Vendor, { userId, name: `Demo Supplier ${i + 1}` }, {
      userId, name: `Demo Supplier ${i + 1}`, contact: name, phone, email: `supplier${i + 1}@gobook.local`,
      category: products[i][2], status: 'Active', gstin: `33BBBBB000${i + 1}B1Z${i + 1}`,
      address: `${i + 1} Supplier Street, ${city}`, branch, creditDays: 30, creditLimit: 50000,
      bankName: 'Demo Bank', accountHolderName: `Demo Supplier ${i + 1}`, accountNumber: `00000000001${i + 1}`, ifscCode: 'DEMO0000001', bankBranch: city,
    });
    await upsert(Lead, { userId, name: `Demo Lead ${i + 1}` }, {
      userId, branch, name: `Demo Lead ${i + 1}`, company: name, email: customerEmail, phone,
      source: 'Website', status: 'New', owner: 'test', priority: 'Medium', enquiry: `Interested in ${products[i][1]}`,
      interestedIn: products[i][1], city, state: 'Tamil Nadu', notes: 'Local demo lead', followUpDate: today,
    });
    const product = savedProducts[i];
    const qty = i + 1;
    const amount = qty * product.rate;
    await upsert(Invoice, { userId, number: `DEMO-INV-00${i + 1}` }, {
      userId, businessId: business._id, branch, number: `DEMO-INV-00${i + 1}`, documentType: 'invoice',
      lifecycleStatus: 'posted', fulfillmentStatus: 'not-dispatched', postedAt: new Date(),
      customer: contact, meta: { date: today, dueDate: today, placeOfSupply: 'Tamil Nadu', invoiceType: 'regular', paymentTerms: '0' },
      supplyType: 'intrastate', items: [{ productId: product._id, productCode: product.code, barcode: product.barcode, description: product.description, hsn: product.hsn, qty, unit: 'Nos', rate: product.rate, mrp: product.mrp, gstRate: 5 }],
      shipping: { sameAsBilling: true, address: contact.address, city, state: 'Tamil Nadu', pincode },
      paymentMethod: 'Cash', notes: 'Local demo invoice', terms: 'Payment due on receipt',
      totals: { subtotal: amount, taxableAmount: amount, cgst: amount * 0.025, sgst: amount * 0.025, grandTotal: amount * 1.05, total: amount * 1.05 },
    });
    await upsert(SalesRecord, { userId, number: `DEMO-QT-00${i + 1}` }, {
      userId, branch, date: today, number: `DEMO-QT-00${i + 1}`, customer: name,
      person: 'test', amount, status: 'Pending', type: 'quotation',
    });
  }
  const counts = {};
  for (const Model of [Branch, Warehouse, ProductCategory, ProductSubcategory, ProductBrand, Product, Customer, Vendor, Lead, Invoice, SalesRecord]) {
    counts[Model.modelName] = await Model.countDocuments({ userId });
  }
  console.log(JSON.stringify({ database: env.mongodbDbName, email, userId: String(userId), counts }, null, 2));
} finally {
  await mongoose.disconnect();
}
