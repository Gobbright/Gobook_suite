import { AutomobileNoteForm } from './AutomobileCreditNoteForm.jsx';

export function AutomobileDebitNoteForm(props) {
  return <AutomobileNoteForm {...props} documentType="debit-note" />;
}
