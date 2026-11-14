import './navigationCountBadge.css';

export function NavigationCountBadge({ count, label = 'pending items' }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return <span className="navigation-count-badge" aria-label={`${count} ${label}`} title={`${count} ${label}`}>{count > 99 ? '99+' : count}</span>;
}
