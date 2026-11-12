import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// A small custom-styled dropdown to replace native <select> elements where the
// browser's native option-list rendering (which ignores page CSS and instead
// follows OS-level text scaling) makes the options render far larger than the
// rest of the page, especially on mobile/Chrome+Windows.
export function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  buttonClassName = '',
  selectedLabelClassName = '',
  optionLabelClassName = '',
  menuClassName = '',
  portalMenuWidth,
  searchable = false,
  searchPlaceholder = 'Type to filter...',
  allowCustom = false,
  customLabel = 'Use custom',
  dropDirection = 'auto',
  disabled = false,
  hideChevron = false,
  portal = false,
  closeOnScroll = false,
  multiple = false,
  onFieldBlur,
  onFieldFocus,
  ...buttonProps
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [query, setQuery] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const triggerRef = useRef(null);
  const menuId = useId();
  const fieldFocused = useRef(false);

  useEffect(() => {
    if (!onFieldBlur && !onFieldFocus) return undefined;
    let active = true;
    const inside = (target) => target instanceof Node && (ref.current?.contains(target) || menuRef.current?.contains(target) || document.getElementById(menuId)?.contains(target));
    const checkFocus = () => {
      if (!active) return;
      if (inside(document.activeElement)) {
        if (!fieldFocused.current) {
          fieldFocused.current = true;
          onFieldFocus?.();
        }
      } else if (fieldFocused.current) { fieldFocused.current = false; onFieldBlur?.(); }
    };
    const focusOut = () => queueMicrotask(checkFocus);
    checkFocus();
    document.addEventListener('focusin', checkFocus);
    document.addEventListener('focusout', focusOut);
    return () => {
      active = false;
      document.removeEventListener('focusin', checkFocus);
      document.removeEventListener('focusout', focusOut);
    };
  }, [onFieldBlur, onFieldFocus, menuId]);

  const normalized = options.map((opt) => (typeof opt === 'string' || typeof opt === 'number' ? { value: opt, label: String(opt) } : opt));
  const filtered = searchable && query.trim()
    ? normalized.filter((opt) => String(opt.label ?? opt.value ?? '').toLowerCase().includes(query.trim().toLowerCase()))
    : normalized;
  const customValue = query.trim();
  const showCustom = allowCustom && customValue && !normalized.some((opt) => String(opt.label ?? opt.value ?? '').toLowerCase() === customValue.toLowerCase());
  const selectedValues = multiple ? (Array.isArray(value) ? value : value == null || value === '' || value === 'all' ? [] : [value]) : [];
  const isSelected = (option) => multiple ? option.value === '' || option.value === 'all' ? selectedValues.length === 0 : selectedValues.includes(option.value) : option.value === value;
  const selectedIndex = normalized.findIndex(isSelected);
  const selected = normalized[selectedIndex];
  const selectedLabels = selectedValues.map((entry) => normalized.find((option) => option.value === entry)?.label || String(entry));
  const displayLabel = multiple ? selectedLabels.length > 1 ? `${selectedLabels[0]} +${selectedLabels.length - 1}` : selectedLabels[0] || normalized.find((option) => option.value === '' || option.value === 'all')?.label || placeholder : selected ? selected.label : String(value ?? '').trim();

  useEffect(() => {
    if (!open || highlighted < 0) return;
    optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted]);

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(e) {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function handleEscape(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', handleOutside, true);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [open]);

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const nextDropUp = dropDirection === 'up' || (dropDirection !== 'down' && spaceBelow < 240 && rect.top > spaceBelow);
    setDropUp(nextDropUp);
    if (portal) {
      const requestedWidth = Number(portalMenuWidth) > 0 ? Number(portalMenuWidth) : Math.max(rect.width, 240);
      const width = Math.min(requestedWidth, Math.max(220, window.innerWidth - 16));
      const availableHeight = nextDropUp ? rect.top - 12 : window.innerHeight - rect.bottom - 12;
      setMenuStyle({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: Math.max(48, availableHeight),
        top: nextDropUp ? undefined : rect.bottom + 4,
        bottom: nextDropUp ? window.innerHeight - rect.top + 4 : undefined,
      });
    }
  }, [dropDirection, portal, portalMenuWidth]);

  useEffect(() => {
    if (!open || !portal) return undefined;
    updateMenuPosition();
    function handleScroll(event) {
      // The menu is portaled outside the page's scroll container. Keep list
      // scrolling local, but dismiss it when its surrounding page moves.
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (closeOnScroll) setOpen(false);
      else updateMenuPosition();
    }
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, portal, closeOnScroll, updateMenuPosition]);

  // On short/scrolled mobile viewports the trigger can sit close to the
  // bottom of the page's scroll container, leaving no room for the list to
  // render below it (it gets silently clipped instead of shown). Flip it
  // above the trigger whenever there isn't enough space underneath.
  function openList(last = false) {
    updateMenuPosition();
    setQuery('');
    setHighlighted(selectedIndex >= 0 ? selectedIndex : last ? normalized.length - 1 : 0);
    setOpen(true);
  }

  function choose(index) {
    const opt = filtered[index];
    if (!opt) return;
    if (multiple) {
      onChange(opt.value === '' || opt.value === 'all' ? [] : selectedValues.includes(opt.value) ? selectedValues.filter((entry) => entry !== opt.value) : [...selectedValues, opt.value]);
    } else {
      onChange(opt.value);
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        openList(e.key === 'ArrowUp');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setHighlighted((i) => Math.min(filtered.length - 1, i < 0 ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setHighlighted((i) => Math.max(0, i < 0 ? filtered.length - 1 : Math.min(i - 1, filtered.length - 1)));
    } else if (e.key === 'Home' || e.key === 'End') {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      e.stopPropagation();
      setHighlighted(e.key === 'Home' ? 0 : filtered.length - 1);
    } else if (e.key === 'Enter' || (multiple && e.key === ' ' && e.target.tagName !== 'INPUT')) {
      e.preventDefault();
      e.stopPropagation();
      if (filtered[highlighted]) choose(highlighted);
      else if (showCustom) {
        onChange(customValue);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const menu = open ? (
    <div
      ref={menuRef}
      id={menuId}
      onKeyDown={portal ? handleKeyDown : undefined}
      style={portal && menuStyle ? menuStyle : undefined}
      className={`${portal ? 'fixed z-[9999]' : `absolute left-0 right-0 min-w-[220px] ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} z-50`} bg-white border border-[#dde6f2] rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto ${searchable ? 'scroll-pt-12' : ''} ${menuClassName}`}
    >
      {searchable && (
        <div className="sticky top-0 z-10 border-b border-[#edf2f7] bg-white p-2">
          <input
            className="h-8 w-full rounded-md border border-[#dbe4ef] px-2 text-[12px] outline-none focus:border-blue-500"
            value={query}
            placeholder={searchPlaceholder}
            autoFocus
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlighted(0);
            }}
          />
        </div>
      )}
      {filtered.map((opt, index) => (
        <button
          key={opt.value}
          ref={(node) => { optionRefs.current[index] = node; }}
          type="button"
          tabIndex={-1}
          aria-pressed={multiple ? isSelected(opt) : undefined}
          data-highlighted={index === highlighted || undefined}
          onMouseEnter={() => setHighlighted(index)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            choose(index);
          }}
          onFocus={() => setHighlighted(index)}
          className={`w-full scroll-mt-12 flex items-center justify-between gap-2 text-left py-2 pr-3 text-[13px] cursor-pointer border-0 font-[inherit] hover:bg-blue-200 ${opt.indent ? 'pl-7' : 'pl-3'} ${
            opt.activeOption || isSelected(opt) ? 'text-blue-900 font-semibold bg-blue-200 shadow-[inset_3px_0_0_#2563eb]' : index === highlighted ? 'bg-blue-200 text-[#0f172a] shadow-[inset_3px_0_0_#3b82f6]' : 'bg-transparent text-[#111827]'
          }`}
        >
          <span className={`${optionLabelClassName || ''} min-w-0 flex-1 truncate whitespace-nowrap`}>{opt.labelNode || opt.label}</span>
          {multiple && <span aria-hidden="true" className={`grid h-4 w-4 flex-none place-items-center rounded border ${isSelected(opt) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}>{isSelected(opt) && <Check size={12} />}</span>}
          {opt.badge && (
            <span className="flex-none text-[10px] font-semibold uppercase tracking-wide text-[#64748b] bg-[#f1f5f9] rounded px-1.5 py-0.5">
              {opt.badge}
            </span>
          )}
        </button>
      ))}
      {multiple && <div className="sticky bottom-0 border-t border-[#edf2f7] bg-white px-2 py-1"><button type="button" className="w-full rounded border-0 bg-blue-50 py-1.5 text-[12px] font-semibold text-blue-700" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>Done</button></div>}
      {showCustom && (
        <button
          type="button"
          tabIndex={-1}
          className="w-full border-0 border-t border-[#edf2f7] bg-white px-3 py-2 text-left text-[12px] font-semibold text-blue-700 hover:bg-blue-200"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onChange(customValue);
            setOpen(false);
          }}
        >
          {customLabel}: {customValue}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`} ref={ref} onKeyDown={handleKeyDown}>
      <button
        {...buttonProps}
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={multiple && selectedLabels.length ? selectedLabels.join(', ') : buttonProps.title}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open ? setOpen(false) : openList();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            open ? choose(highlighted) : openList();
          }
        }}
        className={`flex items-center justify-between gap-2 border border-[#dbe4ef] rounded-md px-3 py-2 text-[13px] w-full outline-none bg-white font-[inherit] focus:border-blue-500 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${buttonClassName}`}
      >
        <span className={`${selectedLabelClassName || 'truncate'} ${displayLabel ? 'text-[#111827]' : 'text-[#94a3b8]'}`}>{displayLabel || placeholder}</span>
        {!hideChevron && <ChevronDown size={14} className={`text-[#94a3b8] transition-transform flex-none ${open ? 'rotate-180' : ''}`} />}
      </button>

      {portal ? createPortal(menu, document.body) : menu}
    </div>
  );
}
