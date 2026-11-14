import { useLocation, useNavigate } from 'react-router-dom';
import { useBusinessEmail } from '../app/BusinessEmailContext.jsx';

export function useRequireBusinessEmail() {
  const { configured } = useBusinessEmail();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return () => {
    if (configured) return true;
    navigate('/email-setup', { state: { returnTo: pathname + search } });
    return false;
  };
}
