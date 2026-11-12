import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
        <header className="employee-details-heading"><h2 id="employee-details-title">All Employee Details</h2><button type="button" className="hr-btn" onClick={onClose} autoFocus>Close</button></header>
        <EmployeeProfile key={employeeId} employeeId={employeeId} />
      </div>
    </dialog>, document.body,
  );
}
