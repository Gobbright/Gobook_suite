import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Replaces `<input list="..."> + <datalist>` — same native-popup text-size
// problem as <select> (see SelectDropdown.jsx), but for a free-text field with
// suggestions rather than a closed set of choices.
export function AutocompleteInput({ value, onChange, onSelect, options = [], placeholder = '', className = '', inputClassName = '', dropdownClassName = '', maxLength, icon = null, onKeyDown, onFocus, dropDirection = 'auto', selectFirstOnEnter = false, filterOptions = true, statusText = '', statusError = false, onRetry, portal = false, listboxId, unstyled = false, ...inputProps }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);
  const dropdownRef = useRef(null);
  const [position, setPosition] = useState({});
  const optionRefs = useRef([]);

  // Options are plain strings almost everywhere this is used; a caller can
  // optionally pass { value, label, badge } objects instead (e.g. to tag each
  // suggestion as Product/Service) without affecting any other usage.
  const normalized = useMemo(() => options.map((opt) => {
    const entry = typeof opt === 'string' ? { value: opt, label: opt } : opt;
    return { entry, normalizedLabel: String(entry.label || '').toLowerCase(), normalizedSearch: String(entry.searchText || entry.label || '').toLowerCase() };
  }), [options]);
  const query = String(value || '').trim().toLowerCase();
  const suggestions = useMemo(() => {
    const result = [];
    for (const option of normalized) {
      if (query && filterOptions && (!option.normalizedSearch.includes(query) || option.normalizedLabel === query)) continue;
      result.push(option.entry);
      if (result.length === 20) break;
    }
    return result;
  }, [normalized, query, filterOptions]);

  useEffect(() => {
    if (!open || highlighted < 0) return;
    optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted]);

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target) && !dropdownRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (!portal || !open) return undefined;
    function closeOnMove(event) {
      if (!dropdownRef.current?.contains(event.target)) setOpen(false);
    }
    window.addEventListener('resize', closeOnMove);
    window.addEventListener('scroll', closeOnMove, true);
    return () => {
      window.removeEventListener('resize', closeOnMove);
      window.removeEventListener('scroll', closeOnMove, true);
    };
  }, [portal, open]);

  // On short/scrolled mobile viewports the field can sit close to the bottom
  // of the page's scroll container, leaving no room for the list to render
  // below it (it gets silently clipped instead of shown). Flip it above the
  // field whenever there isn't enough space underneath.
  function openDropdown() {
    const rect = ref.current?.getBoundingClientRect();
    const shouldDropUp = dropDirection === 'up' || (dropDirection === 'auto' && rect && window.innerHeight - rect.bottom < 240 && rect.top > window.innerHeight - rect.bottom);
    if (dropDirection === 'down') {
      setDropUp(false);
    } else if (dropDirection === 'up') {
      setDropUp(true);
    } else if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 240 && rect.top > spaceBelow);
    }
    if (portal && rect) {
      const width = Math.min(Math.max(rect.width, 420), window.innerWidth - 16);
      setPosition({
        position: 'fixed', width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), zIndex: 10000,
        ...(shouldDropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }
    setOpen(true);
  }

  function choose(opt) {
    onChange(opt.value);
    onSelect?.(opt.value, opt);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && open && statusText) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      e.stopPropagation();
      if (!open) {
        openDropdown();
        setHighlighted(e.key === 'ArrowDown' ? 0 : suggestions.length - 1);
      } else {
        setHighlighted((i) => e.key === 'ArrowDown'
          ? Math.min(suggestions.length - 1, i < 0 ? 0 : i + 1)
          : Math.max(0, i < 0 ? suggestions.length - 1 : Math.min(i - 1, suggestions.length - 1)));
      }
      return;
    }
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      onKeyDown?.(e);
      return;
    }
    if (e.key === 'Enter' && (highlighted >= 0 || selectFirstOnEnter && query)) {
      e.preventDefault();
      e.stopPropagation();
      const option = suggestions[highlighted >= 0 ? highlighted : 0];
      if (option) choose(option);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
      onKeyDown?.(e);
    } else {
      if (e.key === 'Enter') setOpen(false);
      onKeyDown?.(e);
    }
  }

  const menu = open && (suggestions.length > 0 || statusText) ? (
    <div ref={dropdownRef} id={listboxId} role={listboxId ? 'listbox' : undefined} className={`${portal ? '' : `absolute left-0 right-0 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`} z-50 bg-white border border-[#dde6f2] rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto ${dropdownClassName}`} style={portal ? position : undefined}>
      {suggestions.map((opt, index) => (
        <button
          key={opt.value}
          id={listboxId ? `${listboxId}-${index}` : undefined}
          role={listboxId ? 'option' : undefined}
          aria-selected={listboxId ? index === highlighted : undefined}
          ref={(node) => { optionRefs.current[index] = node; }}
          type="button"
          tabIndex={-1}
          onMouseEnter={() => setHighlighted(index)}
          onMouseDown={(event) => { event.preventDefault(); choose(opt); }}
          className={`w-full flex items-center justify-between gap-2 text-left py-2 pr-3 text-[13px] cursor-pointer border-0 font-[inherit] hover:bg-blue-200 ${opt.indent ? 'pl-7' : 'pl-3'} ${index === highlighted ? 'bg-blue-200 text-[#0f172a] shadow-[inset_3px_0_0_#3b82f6]' : 'bg-transparent text-[#111827]'}`}
        >
          <span className="truncate" title={opt.label}>{opt.label}</span>
          {opt.badge && <span className="flex-none text-[10px] font-semibold uppercase tracking-wide text-[#64748b] bg-[#f1f5f9] rounded px-1.5 py-0.5">{opt.badge}</span>}
        </button>
      ))}
      {statusText && <div className="px-3 py-2 text-[12px] text-[#64748b]" role={statusError ? 'alert' : 'status'}>{statusText}{statusError && onRetry && <button type="button" className="ml-2 text-blue-600 underline bg-transparent border-0 cursor-pointer" onMouseDown={(event) => event.preventDefault()} onClick={onRetry}>Retry</button>}</div>}
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`} ref={ref}>
      {icon}
      <input
        {...inputProps}
        role={listboxId ? 'combobox' : inputProps.role}
        aria-autocomplete={listboxId ? 'list' : undefined}
        aria-expanded={listboxId ? Boolean(menu) : undefined}
        aria-controls={listboxId && menu ? listboxId : undefined}
        aria-activedescendant={listboxId && menu && highlighted >= 0 && highlighted < suggestions.length ? `${listboxId}-${highlighted}` : undefined}
        className={unstyled ? inputClassName : `border border-[#dbe4ef] rounded-md py-2 text-[13px] w-full outline-none focus:border-blue-500 font-[inherit] ${icon ? 'pl-8 pr-3' : 'px-3'} ${inputClassName}`}
        value={value || ''}
        maxLength={maxLength}
        onChange={(e) => { onChange(e.target.value); openDropdown(); setHighlighted(-1); }}
        onFocus={(e) => { openDropdown(); onFocus?.(e); }}
        onBlur={(event) => { inputProps.onBlur?.(event); if (portal) setOpen(false); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
