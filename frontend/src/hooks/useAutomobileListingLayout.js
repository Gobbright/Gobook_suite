import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useCurrentUser } from './useCurrentUser.js';
import { usesAutomobileListingLayout } from '../utils/listingLayout.js';

// Share the presentation without changing the account category or business rules.
export function useAutomobileListingLayout() {
  const user = useCurrentUser();
  const account = user?.businessId || user?.id || user?._id || user?.email;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (user?.category !== 'retail') return undefined;
    let active = true;
    api.getSettings().then((settings) => { if (active) setLoaded({ account, settings }); }).catch(() => {});
    return () => { active = false; };
  }, [account, user?.category]);
  return usesAutomobileListingLayout(user, loaded?.account === account ? loaded?.settings : {});
}
