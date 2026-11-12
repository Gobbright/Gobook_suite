import { useEffect, useState } from 'react';
import { activateTestSubscription, fetchSubscriptionTestConfig } from '../../services/subscriptionService.js';
import { redirectTo } from '../../routes/navigation.js';

export function TestSubscriptionButton({ subscriptionPlan, disabled = false, onError }) {
  const [enabled, setEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSubscriptionTestConfig().then((config) => {
      if (!cancelled) setEnabled(Boolean(config.enabled));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function continueTesting() {
    onError('');
    setSubmitting(true);
    try {
      await activateTestSubscription(subscriptionPlan);
      redirectTo('/dashboard');
    } catch (error) {
      onError(error.message || 'Unable to activate test access');
    } finally { setSubmitting(false); }
  }

  if (!enabled) return null;
  return (
    <button type="button" onClick={continueTesting} disabled={disabled || submitting}
      className="mt-3 w-full cursor-pointer rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60">
      {submitting ? 'Starting test access...' : 'Test & Continue — No Payment'}
    </button>
  );
}
