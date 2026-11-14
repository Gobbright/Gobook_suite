// Move actual focus so checkbox state and labels remain available to assistive technology.
export function navigateFilterList(event, selector) {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const items = Array.from(event.currentTarget.querySelectorAll(selector));
  if (!items.length) return;
  const current = items.indexOf(event.target);
  const index = current < 0
    ? event.key === 'ArrowDown' ? 0 : items.length - 1
    : Math.max(0, Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
  items[index].focus({ preventScroll: true });
  items[index].scrollIntoView({ block: 'nearest' });
}
