import mongoose from 'mongoose';
import { httpError } from '../utils/httpError.js';

// Mongoose propagates this session to queries in inventory/accounting helpers.
// Joining the current transaction avoids committing nested work independently.
mongoose.set('transactionAsyncLocalStorage', true);

export function inInventoryTransaction() {
  return Boolean(mongoose.transactionAsyncLocalStorage?.getStore()?.session);
}

export async function inventoryTransaction(work) {
  if (inInventoryTransaction()) return work();
  try {
    return await mongoose.connection.transaction(work, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      maxCommitTimeMS: 15000,
    });
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation' && /transaction/i.test(error.message)) {
      const serviceError = httpError(503, 'Inventory service is temporarily unavailable. Please try again shortly.');
      serviceError.code = 'MONGODB_TRANSACTIONS_REQUIRED';
      serviceError.cause = error;
      throw serviceError;
    }
    throw error;
  }
}

// Send success only after commit. A commit failure or driver retry must never
// leave the client with a success response for an uncommitted document.
export function atomicInventoryHandler(handler) {
  return async (req, res, next) => {
    try {
      let response;
      await inventoryTransaction(async () => {
        response = undefined;
        let status = 200;
        const staged = {
          status(value) { status = value; return staged; },
          json(body) { response = { status, body }; return staged; },
        };
        await handler(req, staged, (error) => { if (error) throw error; });
      });
      if (response) return res.status(response.status).json(response.body);
    } catch (error) { next(error); }
  };
}
