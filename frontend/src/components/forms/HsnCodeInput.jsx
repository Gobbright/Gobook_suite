import { useEffect, useId, useState } from 'react';
import { api } from '../../services/api.js';
import { AutocompleteInput } from './AutocompleteInput.jsx';

export function HsnCodeInput({ value, onChange, type, onFocus, onBlur, placeholder = 'Search HSN / SAC code or description', ...props }) {
  const listboxId = useId();
  const [focused, setFocused] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ data: [], loading: false, error: '', hasMore: false });
  const query = String(value || '').trim();

  useEffect(() => {
    if (!focused || query.length < 2) {
      setResult({ data: [], loading: false, error: '', hasMore: false });
      return undefined;
    }
    let active = true;
    setResult({ data: [], loading: true, error: '', hasMore: false });
    const timer = setTimeout(() => {
      api.searchHsnSac({ q: query, type, limit: 20 }).then((response) => {
        if (active) setResult({ data: response.data || [], hasMore: response.hasMore, loading: false, error: '' });
      }).catch((error) => {
        if (active) setResult({ data: [], hasMore: false, loading: false, error: error.message || 'Unable to search HSN / SAC codes.' });
      });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [focused, query, type, retry]);

  const options = result.data.map((entry) => ({
    value: entry.code,
    label: `${entry.code} — ${entry.description}`,
    badge: entry.needsReview ? `${entry.type} · Review source` : entry.type,
  }));
  const statusText = result.loading ? 'Searching codes…' : result.error || (query.length < 2
    ? 'Type at least 2 characters to search by code or description.'
    : result.hasMore ? 'More matches available. Keep typing to narrow the list.'
      : !options.length ? 'No matching codes. Your entered value is retained.' : '');

  return (
    <AutocompleteInput
      {...props}
      aria-label={props['aria-label'] || 'HSN / SAC code'}
      aria-busy={result.loading}
      value={value}
      onChange={(nextValue) => {
        setResult({ data: [], loading: false, error: '', hasMore: false });
        onChange(nextValue);
      }}
      placeholder={placeholder}
      options={options}
      filterOptions={false}
      listboxId={listboxId}
      portal
      selectFirstOnEnter
      statusText={statusText}
      statusError={Boolean(result.error)}
      onRetry={() => setRetry((current) => current + 1)}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
    />
  );
}
