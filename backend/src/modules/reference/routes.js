import { Router } from 'express';
import { loadHsnSacCatalog, searchHsnSacCatalog } from '../../services/hsnSacCatalog.js';

export const referenceRouter = Router();

referenceRouter.get('/hsn-sac', async (req, res, next) => {
  try {
    res.json(searchHsnSacCatalog(await loadHsnSacCatalog(), req.query));
  } catch (error) {
    next(error);
  }
});
