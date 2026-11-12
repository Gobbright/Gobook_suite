import { RowActionsMenu } from '../../../../components/forms/RowActionsMenu.jsx';

export function RowActions({ onEdit, onDelete }) {
  const options = [
    ...(onEdit ? [{ value: 'edit', label: 'Edit' }] : []),
    ...(onDelete ? [{ value: 'delete', label: 'Delete' }] : []),
  ];
  if (!options.length) return null;
  return <RowActionsMenu options={options} onChange={(action) => (action === 'edit' ? onEdit : onDelete)?.()} />;
}
