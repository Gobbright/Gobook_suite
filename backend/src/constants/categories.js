export const CATEGORIES = [
  'retail', 'school', 'hospital', 'hotel',
  'manufacturing', 'construction', 'ngo', 'automobile', 'finance',
];

export const CATEGORY_LABELS = {
  retail: 'Retail Store',
  school: 'School',
  hospital: 'Hospital',
  hotel: 'Hotel',
  manufacturing: 'Manufacturing',
  construction: 'Construction',
  ngo: 'NGO',
  automobile: 'Automobile',
  finance: 'Finance',
};

export const RETAIL_SUBCATEGORIES = [
  'food-grocery',
  'fashion-lifestyle',
  'home-living',
  'electronics-technology',
  'specialty-personal-needs',
  'business-specialty-retail',
];

// Retail signup currently exposes the two supported workflows. The remaining
// retail segments stay available in the catalog for future rollout.
export const RETAIL_SIGNUP_SUBCATEGORIES = ['fashion-lifestyle', 'electronics-technology'];

export const RETAIL_SUBCATEGORY_LABELS = {
  'food-grocery': 'Food & Grocery',
  'fashion-lifestyle': 'Fashion & Lifestyle',
  'home-living': 'Home & Living',
  'electronics-technology': 'Electronics & Technology',
  'specialty-personal-needs': 'Specialty & Personal Needs',
  'business-specialty-retail': 'Business & Specialty Retail',
};

// Consumer billing uses the shared sales engine for every supported business.
export const COMMON_CATEGORY_MODULES = ['sales'];

export const EXCLUSIVE_MODULES_BY_CATEGORY = {
  hospital: ['hospital'],
  finance: ['finance'],
};
