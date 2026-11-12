export function usesAutomobileListingLayout(user, settings = {}) {
  if (user?.category === 'automobile') return true;
  if (user?.category !== 'retail') return false;
  const subcategory = String(settings?.retailSubcategory || user?.retailSubcategory || '').trim().toLowerCase();
  return /^(electronics(?:\s*(?:&|and|-)\s*technology)?|fashion(?:\s*(?:&|and|-)\s*(?:lifestyle|style))?|textile|apparel|clothing)$/.test(subcategory);
}
