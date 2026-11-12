// Empty selections mean "All". Within one field values are OR'ed; separate
// fields are combined by the report's existing AND predicates.
export function selectionValues(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).filter((entry) => entry != null && entry !== '' && entry !== 'all'))];
}

export function hasSelection(value) {
  return selectionValues(value).length > 0;
}

export function matchesSelection(selected, predicate) {
  const values = selectionValues(selected);
  return !values.length || values.some(predicate);
}
