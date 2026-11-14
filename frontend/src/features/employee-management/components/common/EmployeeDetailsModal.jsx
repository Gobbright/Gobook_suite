import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, UserRound } from 'lucide-react';
import EmployeeProfile from '../../pages/admin/employees/EmployeeProfile.jsx';
import './EmployeeDetailsModal.css';

export function EmployeeDetailsModal({ employeeId, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className="employee-details-modal" aria-labelledby="employee-details-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="employee-details-content">
        <header className="employee-details-heading"><div className="employee-details-heading-copy"><span className="employee-details-symbol"><UserRound size={20} /></span><div><h2 id="employee-details-title">Employee details</h2><p>Profile, work records and account access</p></div></div><button type="button" className="employee-details-close" aria-label="Close employee details" onClick={onClose} autoFocus><X size={20} /></button></header>
        <EmployeeProfile key={employeeId} employeeId={employeeId} />
      </div>
    </dialog>, document.body,
  );
}
