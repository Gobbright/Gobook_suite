import { SelectDropdown } from './SelectDropdown.jsx';
import './documentQuickActions.css';

export function DocumentQuickActions({ actions, disabled = false, variant = 'dropdown' }) {
  if (variant === 'icons') return <div className="document-quick-action-icons" role="group" aria-label="Invoice quick actions">{actions.map(action => <button key={action.id} type="button" aria-label={action.label} title={action.label} disabled={disabled} onClick={action.onSelect}>{action.icon}</button>)}</div>;
  return <SelectDropdown aria-label="Invoice quick actions" value="" placeholder="Quick Actions" options={actions.map((action) => ({ value: action.id, label: action.label }))} onChange={(id) => actions.find((action) => action.id === id)?.onSelect()} disabled={disabled} className="document-quick-actions" buttonClassName="document-quick-actions-trigger" menuClassName="document-quick-actions-menu" portal />;
}
