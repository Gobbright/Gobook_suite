import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

export function PasswordInput({ value, id, ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (!value) setVisible(false); }, [value]);
  return <span className="employee-password-input">
    <input {...props} id={inputId} type={visible ? 'text' : 'password'} value={value} />
    <button type="button" aria-controls={inputId} aria-pressed={visible} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'} disabled={props.disabled} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  </span>;
}
