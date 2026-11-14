import { useEffect, useState } from 'react';
import { resolveDeviceContent } from './storeBuilder.js';
export function useStoreDevice(theme, previewDevice, page) {
  const [device, setDevice] = useState(() => typeof window === 'undefined' ? 'desktop' : window.innerWidth <= 767 ? 'mobile' : window.innerWidth <= 1023 ? 'tablet' : 'desktop');
  useEffect(() => {
    if (previewDevice) return;
    const resize = () => setDevice(window.innerWidth <= 767 ? 'mobile' : window.innerWidth <= 1023 ? 'tablet' : 'desktop');
    window.addEventListener('resize', resize); resize();
    return () => window.removeEventListener('resize', resize);
  }, [previewDevice]);
  return resolveDeviceContent(theme || {}, previewDevice || device, page);
}
