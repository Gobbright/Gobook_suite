import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient.js';
import { BUSINESS_EMAIL_CHANGED, businessEmailVerificationInput } from '../services/businessEmail.js';

const BusinessEmailContext = createContext(null);

export function BusinessEmailProvider({ children }) {
  const [state, setState] = useState({ loading: true, configured: false, error: '' });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await apiClient('/more-modules/email-settings');
      if (request === sequence.current) setState({ ...data, loading: false, error: '' });
    } catch (error) {
      if (request === sequence.current) setState({ loading: false, configured: false, error: error.message });
    }
  }, []);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const verify = useCallback(async (email, appPassword) => {
    const input = businessEmailVerificationInput(email, appPassword);
    const data = await apiClient('/more-modules/email-settings', { method: 'PUT', body: JSON.stringify(input) });
    if (data.configured !== true) throw new Error('The email connection was not verified. Check the app password and try again.');
    // A slow status read must not replace the successful verification response.
    sequence.current++;
    setState(current => ({ ...current, ...data, canManage: data.canManage ?? current.canManage ?? true, loading: false, error: '' }));
    return data;
  }, []);
  useEffect(() => {
    refresh();
    const onStorage = (event) => { if (event.key === BUSINESS_EMAIL_CHANGED) refresh(); };
    window.addEventListener(BUSINESS_EMAIL_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener(BUSINESS_EMAIL_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, invalidate]);
  return <BusinessEmailContext.Provider value={{ ...state, refresh, verify }}>{children}</BusinessEmailContext.Provider>;
}

export function useBusinessEmail() {
  return useContext(BusinessEmailContext) || { loading: true, configured: false, error: '', refresh: () => {} };
}
