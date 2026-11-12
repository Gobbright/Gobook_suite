import { useId } from 'react';
import { Calculator } from 'lucide-react';
import './documentSummaryCard.css';

// Presentation only: callers keep their own totals, fields and action handlers.
export function DocumentSummaryCard({ as: Tag = 'section', title = 'Invoice Summary', className = '', children }) {
  const titleId = useId();
  return <Tag className={`document-summary-card ${className}`} aria-labelledby={titleId}>
    <h2 id={titleId} className="document-summary-heading"><Calculator size={19} />{title}</h2>
    {children}
  </Tag>;
}
