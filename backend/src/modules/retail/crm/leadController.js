import { Lead } from '../../../models/Lead.js';
import { Customer } from '../../../models/Customer.js';
import { httpError } from '../../../utils/httpError.js';
import { asText, enumValue, importSummary, parseExcelRows } from '../../../utils/excelImport.js';

const LEAD_IMPORT_COLUMNS = {
  name: 'name',
  'lead name': 'name',
  company: 'company',
  'company name': 'company',
  organization: 'company',
  firm: 'company',
  business: 'company',
  email: 'email',
  phone: 'phone',
  mobile: 'phone',
  source: 'source',
  'lead source': 'source',
  channel: 'source',
  status: 'status',
  owner: 'owner',
  'lead owner': 'owner',
  'assigned to': 'owner',
  'sales owner': 'owner',
};

// GET /api/crm/leads?search=
export async function listLeads(req, res, next) {
  try {
    const { search, status } = req.query;
    const filter = { userId: req.user.id };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { company: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ leads });
  } catch (err) {
    next(err);
  }
}

// POST /api/crm/leads
export async function createLead(req, res, next) {
  try {
    const { name, company, phone, email } = req.body;
    const userId = req.user.id;
    const dupKey = phone ? { phone } : email ? { email } : { name, company };
    const dupField = phone ? 'phone number' : email ? 'email' : 'name and company';
    const existing = await Lead.findOne({ userId, ...dupKey });
    if (existing) return next(httpError(409, `A lead with this ${dupField} already exists`));
    const lead = await Lead.create({ ...req.body, userId });
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
}

// POST /api/crm/leads/import
export async function importLeads(req, res, next) {
  try {
    const userId = req.user.id;
    const rows = await parseExcelRows(req.file, LEAD_IMPORT_COLUMNS, 'Name, Company, Phone, Email, Source');
    const summary = importSummary();

    for (const { rowNumber, record } of rows) {
      const name = asText(record.name);
      if (!name) {
        summary.skipped++;
        summary.errors.push(`Row ${rowNumber}: lead name is required`);
        continue;
      }

      const data = {
        userId,
        name,
        company: asText(record.company),
        email: asText(record.email).toLowerCase(),
        phone: asText(record.phone),
        source: asText(record.source) || 'Website',
        status: enumValue(record.status, ['New', 'Contacted', 'In Progress', 'Qualified', 'Converted'], 'New'),
        owner: asText(record.owner),
      };

      const matchBase = data.phone ? { phone: data.phone } : data.email ? { email: data.email } : { name: data.name, company: data.company };
      const existing = await Lead.findOne({ userId, ...matchBase });
      if (existing) {
        await Lead.findByIdAndUpdate(existing._id, { $set: data }, { runValidators: true });
        summary.updated++;
      } else {
        await Lead.create(data);
        summary.imported++;
      }
    }

    res.json(summary);
  } catch (err) {
    next(err);
  }
}

// PUT /api/crm/leads/:id
export async function updateLead(req, res, next) {
  try {
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: req.body },
      { new: true, runValidators: true },
    ).lean();
    if (!lead) return next(httpError(404, 'Lead not found'));
    res.json(lead);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/crm/leads/:id
export async function deleteLead(req, res, next) {
  try {
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, userId: req.user.id }).lean();
    if (!lead) return next(httpError(404, 'Lead not found'));
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    next(err);
  }
}

// Conversion can be retried: the unique source lead key reuses a customer if
// the lead update failed after customer creation, including on local MongoDB.
export async function convertLead(req, res, next) {
  try {
    const userId = req.user.id;
    const lead = await Lead.findOne({ _id: req.params.id, userId }).lean();
    if (!lead) throw httpError(404, 'Lead not found');
    let customer = lead.convertedCustomerId ? await Customer.findOne({ _id: lead.convertedCustomerId, userId }).lean() : null;
    if (!customer) customer = await Customer.findOne({ userId, sourceLeadId: lead._id }).lean();
    if (!customer) {
      const identities = [...(lead.phone ? [{ phone: lead.phone }] : []), ...(lead.email ? [{ email: lead.email.toLowerCase() }] : [])];
      if (identities.length) {
        const matches = await Customer.find({ userId, $or: identities }).limit(2).lean();
        if (matches.length > 1) throw httpError(409, 'More than one customer matches this lead. Review customer contact details before converting.');
        customer = matches[0];
      }
    }
    if (!customer) {
      try {
        customer = await Customer.findOneAndUpdate({ userId, sourceLeadId: lead._id }, { $setOnInsert: {
          userId, sourceLeadId: lead._id, name: lead.name, phone: lead.phone || '', email: lead.email || '',
          branch: lead.branch || '', city: lead.city || '', state: lead.state || '', status: 'Active',
        } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }).lean();
      } catch (error) {
        if (error.code !== 11000) throw error;
        customer = await Customer.findOne({ userId, sourceLeadId: lead._id }).lean();
        if (!customer) throw error;
      }
    }
    const updated = await Lead.findOneAndUpdate({ _id: lead._id, userId }, { $set: { status: 'Converted', convertedCustomerId: customer._id, convertedAt: lead.convertedAt || new Date() } }, { new: true, runValidators: true }).lean();
    if (!updated) throw httpError(404, 'Lead no longer exists');
    res.json({ lead: updated, customer });
  } catch (error) { next(error); }
}
