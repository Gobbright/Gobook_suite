import { SelectDropdown } from './SelectDropdown.jsx';
import './documentQuickActions.css';

export function DocumentQuickActions({ actions, disabled = false }) {
  return <SelectDropdown aria-label="Invoice quick actions" value="" placeholder="Quick Actions" options={actions.map((action) => ({ value: action.id, label: action.label }))} onChange={(id) => actions.find((action) => action.id === id)?.onSelect()} disabled={disabled} className="document-quick-actions" buttonClassName="document-quick-actions-trigger" menuClassName="document-quick-actions-menu" portal />;
}
