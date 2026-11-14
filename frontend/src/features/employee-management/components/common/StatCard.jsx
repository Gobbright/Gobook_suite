export function StatCard({ label, value, icon: Icon, detail, tone = 'blue', loading = false }) {
  return (
    <div className={`card stat stat-${tone}`} aria-busy={loading}>
      <div className="stat-copy">
        <span>{label}</span>
        <b className={loading ? 'stat-loading' : ''} aria-label={loading ? `Loading ${label}` : undefined}>{loading ? '' : value}</b>
        {detail && <small>{detail}</small>}
      </div>
      {Icon && <span className="stat-icon" aria-hidden="true"><Icon size={21} /></span>}
    </div>
  );
}
