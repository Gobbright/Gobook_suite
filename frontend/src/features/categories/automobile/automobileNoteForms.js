export const NOTE_FORM_CONFIGS = {
  'credit-note': {
    title: 'Credit Note', kind: 'Credit', route: 'credit-note',
    info: 'A credit note adjusts the original invoice and customer balance without changing stock. Use Sales Return for physical returns.',
    paymentInfo: 'Saved payment details do not record a refund.',
  },
  'debit-note': {
    title: 'Debit Note', kind: 'Debit', route: 'debit-note',
    info: 'A debit note records additional charges or adjustments through the existing accounting workflow without changing stock.',
    paymentInfo: 'Saved payment details do not record a customer receipt.',
  },
};
