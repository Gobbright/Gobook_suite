import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Headphones,
  Heart,
  Home,
  Info,
  LayoutList,
  Mail,
  MapPin,
  Minus,
  Package,
  PackageCheck,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  Truck,
} from 'lucide-react';

import { sectionStylesCss } from './sectionStyles.js';
import { API_BASE_URL, SERVER_ORIGIN } from '../../services/apiBase.js';

const HERO_BANNER_IMAGE_SRC = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1250&q=90';

const STORE_THEME_PRESETS = {
  modern: {
    shell: 'bg-[#f3f7fc] text-slate-950',
    header: 'border-slate-200 bg-white/95 shadow-sm',
    hero: 'rounded-3xl bg-white ring-slate-200',
    heroPanel: 'from-blue-50 via-white to-blue-50',
    footer: 'bg-[#13243d] text-white',
    card: 'rounded-2xl border-slate-200 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-4',
  },
  classic: {
    shell: 'bg-[#f7f5f0] text-slate-950',
    header: 'border-stone-300 bg-[#fffaf0]/95 shadow-sm',
    hero: 'rounded-lg bg-[#fffaf0] ring-stone-300',
    heroPanel: 'from-stone-100 via-[#fffaf0] to-stone-50',
    footer: 'bg-stone-950 text-white',
    card: 'rounded-lg border-stone-200 bg-[#fffaf0]',
    productGrid: 'md:grid-cols-2 xl:grid-cols-3',
  },
  minimal: {
    shell: 'bg-white text-neutral-950',
    header: 'border-neutral-200 bg-white/95',
    hero: 'rounded-none bg-white ring-neutral-200',
    heroPanel: 'from-white via-neutral-50 to-white',
    footer: 'bg-neutral-950 text-white',
    card: 'rounded-none border-neutral-200 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-4',
  },
  retail: {
    shell: 'bg-[#f4fbf9] text-slate-950',
    header: 'border-teal-100 bg-white/95 shadow-sm',
    hero: 'rounded-2xl bg-white ring-teal-100',
    heroPanel: 'from-teal-50 via-white to-emerald-50',
    footer: 'bg-teal-950 text-white',
    card: 'rounded-xl border-teal-100 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-5',
  },
  fashion: {
    shell: 'bg-[#fff6f8] text-slate-950',
    header: 'border-rose-100 bg-white/95 shadow-sm',
    hero: 'rounded-[28px] bg-white ring-rose-100',
    heroPanel: 'from-rose-50 via-white to-pink-50',
    footer: 'bg-rose-950 text-white',
    card: 'rounded-[24px] border-rose-100 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-4',
  },
  grocery: {
    shell: 'bg-[#f4fbf3] text-slate-950',
    header: 'border-green-100 bg-white/95 shadow-sm',
    hero: 'rounded-2xl bg-white ring-green-100',
    heroPanel: 'from-green-50 via-white to-lime-50',
    footer: 'bg-green-950 text-white',
    card: 'rounded-2xl border-green-100 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-5',
  },
  electronics: {
    shell: 'bg-[#eef6ff] text-slate-950',
    header: 'border-blue-100 bg-white/95 shadow-sm',
    hero: 'rounded-xl bg-white ring-blue-100',
    heroPanel: 'from-blue-50 via-white to-cyan-50',
    footer: 'bg-slate-950 text-white',
    card: 'rounded-xl border-blue-100 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-4',
  },
  boutique: {
    shell: 'bg-[#fff7fb] text-slate-950',
    header: 'border-pink-100 bg-white/95 shadow-sm',
    hero: 'rounded-[32px] bg-white ring-pink-100',
    heroPanel: 'from-pink-50 via-white to-rose-50',
    footer: 'bg-pink-950 text-white',
    card: 'rounded-[26px] border-pink-100 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-3',
  },
  marketplace: {
    shell: 'bg-[#fff8ed] text-slate-950',
    header: 'border-orange-100 bg-white/95 shadow-sm',
    hero: 'rounded-xl bg-white ring-orange-100',
    heroPanel: 'from-orange-50 via-white to-amber-50',
    footer: 'bg-orange-950 text-white',
    card: 'rounded-xl border-orange-100 bg-white',
    productGrid: 'md:grid-cols-2 xl:grid-cols-5',
  },
  premium: {
    shell: 'bg-[#111827] text-white',
    header: 'border-white/10 bg-slate-950/95 shadow-lg',
    hero: 'rounded-[30px] bg-slate-900 ring-white/10',
    heroPanel: 'from-slate-900 via-slate-950 to-violet-950',
    footer: 'bg-black text-white',
    card: 'rounded-2xl border-white/10 bg-slate-900',
    productGrid: 'md:grid-cols-2 xl:grid-cols-4',
  },
};

function storeThemeFor(name) {
  return STORE_THEME_PRESETS[name] || STORE_THEME_PRESETS.modern;
}

function storeTemplateName(name) {
  return ['boutique', 'marketplace', 'premium'].includes(name) ? name : 'boutique';
}

const FALLBACK_PRODUCT_IMAGES = {
  appliances: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=720&q=85',
  mobile: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=720&q=85',
  stationery: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=720&q=85',
  clothing: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=720&q=85',
  default: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=720&q=85',
};

const inputClass = 'h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50';

function formatMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
}

function imageForProduct(product) {
  if (product?.imageUrl) return product.imageUrl;
  const text = `${product?.category || ''} ${product?.name || ''}`.toLowerCase();
  if (/appliance|kettle|home/.test(text)) return FALLBACK_PRODUCT_IMAGES.appliances;
  if (/mobile|phone|smart/.test(text)) return FALLBACK_PRODUCT_IMAGES.mobile;
  if (/stationery|notebook|book|pen/.test(text)) return FALLBACK_PRODUCT_IMAGES.stationery;
  if (/cloth|shirt|fashion/.test(text)) return FALLBACK_PRODUCT_IMAGES.clothing;
  return FALLBACK_PRODUCT_IMAGES.default;
}

function ProductImage({ product, className = '' }) {
  return <img src={imageForProduct(product)} alt={product?.name || 'Product'} className={`h-full w-full object-cover ${className}`} />;
}

function StoreLogo({ store, primary, inverse = false }) {
  const image = store?.theme?.logoUrl;
  const logoUrl = image?.startsWith('/api/') ? `${SERVER_ORIGIN}${image}` : image;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl text-white shadow-lg" style={{ background: primary }}>
        {logoUrl ? <img src={logoUrl} alt={store?.storeName || 'Store logo'} className="h-full w-full object-cover" /> : <Store size={24} />}
      </div>
      <div className="min-w-0">
        <h1 className={`m-0 truncate text-2xl font-black leading-7 tracking-normal ${inverse ? 'text-white' : 'text-slate-950'}`}>{store?.storeName || 'Online Store'}</h1>
        <p className={`m-0 text-sm font-semibold ${inverse ? 'text-slate-300' : 'text-slate-500'}`}>{store?.tagline || 'Online Store'}</p>
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick, primary }) {
  return (
    <button type="button" onClick={onClick} style={active ? { background: primary } : undefined} className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${active ? 'text-white shadow-lg' : 'bg-transparent text-slate-700 hover:bg-slate-100'}`}>
      <Icon size={16} />
      {label}
    </button>
  );
}

function IconCounter({ icon: Icon, count, active, onClick, label, primary }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} style={active ? { background: primary } : undefined} className={`relative grid h-12 w-12 place-items-center rounded-xl border border-slate-200 transition ${active ? 'text-white shadow-lg' : 'bg-slate-50 text-slate-800 hover:bg-slate-100'}`}>
      <Icon size={21} />
      {count ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">{count}</span> : null}
    </button>
  );
}

function HeroBenefit({ icon: Icon, title, text, tone }) {
  return (
    <div className="flex items-center gap-4">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon size={22} />
      </span>
      <span>
        <strong className="block text-sm font-black text-slate-950">{title}</strong>
        <span className="text-sm font-medium text-slate-500">{text}</span>
      </span>
    </div>
  );
}

function CategoryPill({ active, label, icon: Icon, onClick, primary }) {
  return (
    <button type="button" onClick={onClick} style={active ? { background: primary, borderColor: primary } : undefined} className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold transition ${active ? 'text-white shadow-lg' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50'}`}>
      {Icon ? <Icon size={15} /> : null}
      {label}
    </button>
  );
}

function ProductCard({ product, onAdd, slug, onWishlist, wished, viewMode, theme, primary }) {
  const isList = viewMode === 'list';
  return (
    <article className={`group overflow-hidden border shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/10 ${theme.card} ${isList ? 'grid md:grid-cols-[320px_1fr]' : ''}`}>
      <div className="relative">
      <Link to={`/store/${slug}/product/${product.id}`} className={`block overflow-hidden bg-slate-100 no-underline ${isList ? 'h-full min-h-56' : 'aspect-[2/1]'}`}>
        <ProductImage product={product} className="transition duration-500 group-hover:scale-105" />
        {product.featured ? <span className="absolute right-4 top-4 rounded-full bg-fuchsia-500 px-3 py-1 text-xs font-black text-white">New</span> : null}
      </Link>
        <button type="button" onClick={() => onWishlist(product)} className={`absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white/95 shadow-sm backdrop-blur ${wished ? 'text-red-500' : 'text-slate-500'}`}>
          <Heart size={19} fill={wished ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="truncate text-xs font-black uppercase text-slate-400">{product.category || product.code || 'Product'}</span>
          {Number(product.stock || 0) > 0 ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">In stock</span> : null}
        </div>
        <Link to={`/store/${slug}/product/${product.id}`} className="line-clamp-2 min-h-12 text-lg font-black leading-6 tracking-normal text-slate-950 no-underline">
          {product.name}
        </Link>
        <p className="m-0 mt-3 line-clamp-1 text-sm font-medium text-slate-500">{product.description || 'Available online'}</p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <strong className="text-xl font-black text-slate-950">{formatMoney(product.rate)}</strong>
          <button type="button" onClick={() => onAdd(product)} style={{ background: primary }} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-black text-white shadow-lg transition">
            <ShoppingCart size={18} /> Add
          </button>
        </div>
      </div>
    </article>
  );
}

function TemplateProductCard({ product, slug, onAdd, onWishlist, wished, primary, variant = 'boutique' }) {
  const premium = variant === 'premium';
  const marketplace = variant === 'marketplace';
  const boutique = variant === 'boutique';
  const imageRatio = 'aspect-[4/3]';
  const cardClass = premium
    ? 'border-amber-100 bg-white text-slate-950'
    : marketplace
    ? 'border-orange-100 bg-white text-slate-950'
    : 'border-pink-100 bg-white text-slate-950';
  return (
    <article className={`group overflow-hidden border shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${boutique ? 'rounded-[28px]' : 'rounded-xl'} ${cardClass}`}>
      <Link to={`/store/${slug}/product/${product.id}`} className={`block overflow-hidden no-underline ${imageRatio} ${premium ? 'bg-amber-50' : 'bg-slate-100'}`}>
        <ProductImage product={product} className="transition duration-500 group-hover:scale-105" />
      </Link>
      <div className={marketplace ? 'p-3' : premium ? 'p-4' : 'p-4'}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className={`truncate text-[11px] font-black uppercase ${premium ? 'text-amber-700' : 'text-slate-400'}`}>{product.category || product.code || 'Product'}</span>
          <button type="button" onClick={() => onWishlist(product)} className={`grid h-8 w-8 place-items-center rounded-full border ${wished ? 'text-red-500' : premium ? 'border-amber-100 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
            <Heart size={15} fill={wished ? 'currentColor' : 'none'} />
          </button>
        </div>
        <Link to={`/store/${slug}/product/${product.id}`} className={`line-clamp-2 font-black leading-6 tracking-normal no-underline ${marketplace ? 'min-h-12 text-[15px]' : premium ? 'min-h-0 text-lg' : 'min-h-12 text-lg'} text-slate-950`}>
          {product.name}
        </Link>
        <p className={`m-0 mt-2 ${premium ? 'line-clamp-1' : 'line-clamp-2'} text-sm text-slate-500`}>{product.description || 'Available online'}</p>
        <div className={marketplace || premium ? 'mt-3 flex items-center justify-between gap-2' : 'mt-4 flex items-center justify-between gap-3'}>
          <strong className={marketplace ? 'text-base font-black' : 'text-xl font-black'}>{formatMoney(product.rate)}</strong>
          <button type="button" onClick={() => onAdd(product)} style={{ background: primary }} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-xs font-black text-white shadow-lg">
            <ShoppingCart size={15} /> Add
          </button>
        </div>
      </div>
    </article>
  );
}

export function PublicStorePage({ preview, onPreviewSelect } = {}) {
  const navigate = useNavigate();
  const { slug, productId, storePage } = useParams();
  const [loadedStore, setStore] = useState(null);
  const store = preview?.store || loadedStore;
  const [loadedProducts, setProducts] = useState([]);
  const products = preview?.products || loadedProducts;
  const [productDetail, setProductDetail] = useState(null);
  const [cart, setCart] = useState(() => {
    if (preview) return [];
    try {
      return JSON.parse(window.localStorage.getItem(`online-store-cart:${slug}`) || '[]');
    } catch {
      return [];
    }
  });
  const [customer, setCustomer] = useState({ customerName: '', customerPhone: '', customerEmail: '', deliveryAddress: '', notes: '' });
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState('products');
  const [category, setCategory] = useState('All');
  const [productFilter, setProductFilter] = useState('all');
  const [sortMode, setSortMode] = useState('newest');
  const [viewMode, setViewMode] = useState('grid');
  const [reloadKey, setReloadKey] = useState(0);
  const [wishlist, setWishlist] = useState(() => {
    if (preview) return [];
    try {
      return JSON.parse(window.localStorage.getItem(`online-store-wishlist:${slug}`) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (preview) return;
    try {
      window.localStorage.setItem(`online-store-cart:${slug}`, JSON.stringify(cart));
    } catch {
      // Ignore storage failures; cart still works for the current session.
    }
  }, [cart, slug, preview]);

  useEffect(() => {
    if (preview) return;
    try {
      window.localStorage.setItem(`online-store-wishlist:${slug}`, JSON.stringify(wishlist));
    } catch {
      // Ignore storage failures; wishlist still works for the current session.
    }
  }, [wishlist, slug, preview]);

  useEffect(() => {
    if (preview || productId) return;
    if (storePage === 'cart') {
      setPage('checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setPage('products');
    const sectionMap = { products: 'products', categories: 'products', offers: 'offers', about: 'about', wishlist: 'wishlist' };
    const target = sectionMap[storePage];
    if (target) {
      requestAnimationFrame(() => {
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [storePage, productId, preview]);

  useEffect(() => {
    if (preview) return;
    function refreshOnReturn() {
      if (document.visibilityState === 'hidden') return;
      setReloadKey((current) => current + 1);
    }
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(`${API_BASE_URL}/store/${encodeURIComponent(slug)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Store is not available');
        if (!active) return;
        setStore(data.store);
        setProducts(data.products || []);
        if (productId) {
          const detailResponse = await fetch(`${API_BASE_URL}/store/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`);
          const detailData = await detailResponse.json().catch(() => ({}));
          if (detailResponse.ok) setProductDetail(detailData.product);
        } else {
          setProductDetail(null);
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Store is not available');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [slug, productId, reloadKey, preview]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.rate || 0) * Number(item.qty || 1)), 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + Number(item.qty || 0), 0), [cart]);
  const primary = store?.theme?.primaryColor || '#2563eb';
  const templateName = storeTemplateName(store?.theme?.name);
  const storefrontTheme = storeThemeFor(templateName);
  const imageUrl = store?.theme?.bannerImageUrl || HERO_BANNER_IMAGE_SRC;
  const bannerImage = imageUrl.startsWith('/api/') ? `${SERVER_ORIGIN}${imageUrl}` : imageUrl;
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((product) => product.category).filter(Boolean))).slice(0, 6)], [products]);
  const wishlistProducts = useMemo(() => products.filter((product) => wishlist.includes(product.id)), [products, wishlist]);
  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    const nextProducts = products.filter((product) => {
      const rate = Number(product.rate || 0);
      const matchesCategory = category === 'All' || product.category === category;
      const matchesSearch = !search || [product.name, product.description, product.category, product.code].filter(Boolean).join(' ').toLowerCase().includes(search);
      const matchesFilter =
        productFilter === 'all'
        || (productFilter === 'in-stock' && Number(product.stock || 0) > 0)
        || (productFilter === 'under-10000' && rate > 0 && rate < 10000)
        || (productFilter === '10000-50000' && rate >= 10000 && rate <= 50000)
        || (productFilter === 'above-50000' && rate > 50000);
      return matchesCategory && matchesSearch && matchesFilter;
    });
    return [...nextProducts].sort((a, b) => {
      if (sortMode === 'price-low') return Number(a.rate || 0) - Number(b.rate || 0);
      if (sortMode === 'price-high') return Number(b.rate || 0) - Number(a.rate || 0);
      if (sortMode === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      return 0;
    });
  }, [products, query, category, productFilter, sortMode]);

  function openStorePath(path = '') {
    navigate(`/store/${slug}${path}`);
  }

  function scrollToSection(id, path = '') {
    setPage('products');
    openStorePath(path);
    requestAnimationFrame(() => {
      const element = document.getElementById(id);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function showNotice(text) {
    setError('');
    setMessage(text);
    window.setTimeout(() => setMessage((current) => (current === text ? '' : current)), 2500);
  }

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) return current.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
      return [...current, { ...product, qty: 1 }];
    });
    setMessage('');
    setError('');
  }

  function toggleWishlist(product) {
    setWishlist((current) => {
      const exists = current.includes(product.id);
      showNotice(exists ? `${product.name} removed from wishlist.` : `${product.name} added to wishlist.`);
      return exists ? current.filter((id) => id !== product.id) : [...current, product.id];
    });
  }

  function changeQty(productIdValue, delta) {
    setCart((current) => current.map((item) => (item.id === productIdValue ? { ...item, qty: Math.max(1, Number(item.qty || 1) + delta) } : item)));
  }

  function removeFromCart(productIdValue) {
    setCart((current) => current.filter((item) => item.id !== productIdValue));
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (!cart.length) return;
    try {
      setPlacing(true);
      setError('');
      setMessage('');
      const response = await fetch(`${API_BASE_URL}/store/${encodeURIComponent(slug)}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...customer,
          items: cart.map((item) => ({ productId: item.id, qty: item.qty })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Order could not be placed');
      setCart([]);
      try {
        window.localStorage.removeItem(`online-store-cart:${slug}`);
      } catch {
        // Ignore storage failures.
      }
      setCustomer({ customerName: '', customerPhone: '', customerEmail: '', deliveryAddress: '', notes: '' });
      setMessage(`Order placed successfully. Order No: ${data.order?.orderNo || ''}`);
      openStorePath();
      setPage('products');
    } catch (orderError) {
      setError(orderError.message || 'Order could not be placed');
    } finally {
      setPlacing(false);
    }
  }

  function updateCustomer(key, value) {
    setCustomer((current) => ({ ...current, [key]: value }));
  }

  if (loading && !preview) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm font-black text-slate-500">Loading store...</main>;
  }

  if (error && !store) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-sm">
          <Store className="mx-auto mb-3 text-slate-300" size={34} />
          <h1 className="m-0 text-2xl font-black text-slate-950">Store unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </main>
    );
  }

  if (['boutique', 'marketplace', 'premium'].includes(templateName)) {
    const isBoutique = templateName === 'boutique';
    const isMarketplace = templateName === 'marketplace';
    const isPremium = templateName === 'premium';
    const darkText = 'text-slate-950';
    const mutedText = isPremium ? 'text-slate-600' : 'text-slate-500';
    const surface = isPremium ? 'border-amber-100 bg-white text-slate-950' : 'border-slate-200 bg-white text-slate-950';
    const pageShell = isPremium
      ? 'bg-[#f4f0e8] text-slate-950'
      : isMarketplace
      ? 'bg-orange-50 text-slate-950'
      : 'bg-pink-50 text-slate-950';
    const columnClasses = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4', 5: 'md:grid-cols-3 xl:grid-cols-5' };
    const productGrid = columnClasses[store?.theme?.productColumns] || (isMarketplace ? 'md:grid-cols-3 xl:grid-cols-5' : isBoutique ? 'md:grid-cols-3 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-4');
    const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-full px-5 text-sm font-black text-white shadow-lg';
    const heroFrame = isPremium
      ? 'rounded-[30px] border-amber-100 bg-white'
      : isMarketplace
      ? 'rounded-2xl border-orange-100 bg-white'
      : 'rounded-[36px] border-pink-100 bg-white';
    const navItems = [
      ['Home', () => { openStorePath(); setPage('products'); window.scrollTo({ top: 0, behavior: 'smooth' }); }],
      ['Products', () => scrollToSection('products', '/products')],
      ['Categories', () => scrollToSection('products', '/categories')],
      ['Offers', () => scrollToSection('offers', '/offers')],
      ['About', () => scrollToSection('about', '/about')],
    ];

    const Header = (
      <header data-store-section="header" className={`sticky top-0 z-50 ${isPremium ? 'border-b border-amber-200 bg-slate-950/95' : 'border-b border-slate-200 bg-white/95'} backdrop-blur`}>
        {store?.theme?.announcement ? <div className="px-4 py-2 text-center text-sm font-semibold text-white" style={{ background: primary }}>{store.theme.announcement}</div> : null}
        <div className="mx-auto flex max-w-[1780px] items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {isBoutique ? (
            <>
              <button type="button" onClick={() => { openStorePath(); setPage('products'); }} className="shrink-0 border-0 bg-transparent p-0 text-left">
                <StoreLogo store={store} primary={primary} />
              </button>
              <nav className="mx-auto hidden items-center justify-center gap-1 lg:flex">
                {navItems.map(([label, onClick]) => <button key={label} type="button" onClick={onClick} className="rounded-full px-4 py-2 text-sm font-black text-slate-700 hover:bg-pink-50">{label}</button>)}
              </nav>
              <div className="ml-auto flex items-center justify-end gap-3">
                <label className="relative hidden w-[280px] xl:block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="h-11 w-full rounded-full border border-pink-100 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-pink-300" />
                </label>
                <IconCounter icon={Heart} count={wishlist.length} primary={primary} active={storePage === 'wishlist'} onClick={() => scrollToSection('wishlist', '/wishlist')} label="Wishlist" />
                <IconCounter icon={ShoppingCart} count={itemCount} primary={primary} active={page === 'checkout'} onClick={() => { openStorePath('/cart'); setPage('checkout'); }} label="Cart" />
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { openStorePath(); setPage('products'); }} className="border-0 bg-transparent p-0 text-left">
                <StoreLogo store={store} primary={primary} inverse={isPremium} />
              </button>
              <label className={`relative ${isMarketplace ? 'mx-auto block w-full max-w-2xl' : 'ml-auto hidden w-[420px] lg:block'}`}>
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, brands, categories..." className={`h-12 w-full rounded-full border pl-12 pr-4 text-sm font-semibold outline-none ${isPremium ? 'border-amber-300/30 bg-white/10 text-white placeholder:text-amber-100/70' : 'border-slate-200 bg-white text-slate-900'}`} />
              </label>
              <nav className="hidden items-center gap-1 xl:flex">
                {navItems.slice(0, isMarketplace ? 4 : 6).map(([label, onClick]) => <button key={label} type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-black ${isPremium ? 'text-slate-200 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</button>)}
              </nav>
              <IconCounter icon={Heart} count={wishlist.length} primary={primary} active={storePage === 'wishlist'} onClick={() => scrollToSection('wishlist', '/wishlist')} label="Wishlist" />
              <IconCounter icon={ShoppingCart} count={itemCount} primary={primary} active={page === 'checkout'} onClick={() => { openStorePath('/cart'); setPage('checkout'); }} label="Cart" />
            </>
          )}
        </div>
        {isMarketplace ? (
          <div className="mx-auto hidden max-w-[1780px] items-center gap-2 px-4 pb-3 sm:px-6 lg:flex lg:px-8">
            {categories.map((item) => <button key={item} type="button" onClick={() => { setCategory(item); scrollToSection('products', '/categories'); }} className="rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-black text-orange-800">{item}</button>)}
          </div>
        ) : null}
      </header>
    );

    const Hero = !storePage && store?.theme?.showHero !== false ? (
      <section data-store-section="hero" className={`relative overflow-hidden border shadow-sm ${heroFrame}`}>
        <img src={bannerImage} alt={`${store?.storeName || 'Online Store'} banner`} style={{ objectFit: store?.theme?.bannerFit || 'cover', objectPosition: store?.theme?.bannerPosition || 'center' }} className="h-[260px] w-full object-cover sm:h-[340px] lg:h-[430px]" />
        {(store?.theme?.heroTitle || store?.theme?.heroText || store?.theme?.heroButton) ? <div className="store-banner-content absolute inset-0 flex flex-col items-start justify-center bg-gradient-to-r from-black/75 to-transparent p-8 text-white sm:p-14">
          {store.theme.heroTitle ? <h1 className="m-0 max-w-2xl text-3xl font-bold sm:text-5xl">{store.theme.heroTitle}</h1> : null}
          {store.theme.heroText ? <p className="mt-4 max-w-xl text-base sm:text-lg">{store.theme.heroText}</p> : null}
          {store.theme.heroButton ? <button type="button" onClick={() => scrollToSection('products', '/products')} style={{ background: primary }} className={`${primaryButton} mt-4 min-h-11`}>{store.theme.heroButton}</button> : null}
        </div> : null}
      </section>
    ) : null;

    return (
      <main className={`store-design min-h-screen ${pageShell}`} style={{ fontFamily: store?.theme?.fontFamily === 'serif' ? 'Georgia, serif' : store?.theme?.fontFamily === 'mono' ? 'ui-monospace, monospace' : 'Arial, sans-serif' }} onClickCapture={preview ? (event) => { event.preventDefault(); event.stopPropagation(); onPreviewSelect?.(event.target.closest('[data-store-section]')?.dataset.storeSection); } : undefined}>
        <style>{sectionStylesCss(store?.theme?.sectionStyles)}</style>
        {Header}
        <section className="mx-auto max-w-[1780px] px-4 py-6 sm:px-6 lg:px-8">
          {message ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</div> : null}
          {error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}

          {productDetail ? (
            <section className={`border p-5 shadow-sm sm:p-6 ${surface} ${isBoutique ? 'rounded-[34px]' : 'rounded-2xl'}`}>
              <Link to={`/store/${slug}`} className={`inline-flex items-center gap-2 text-sm font-black no-underline ${isPremium ? 'text-slate-200' : 'text-blue-600'}`}><ArrowLeft size={16} /> Back to products</Link>
              <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(360px,0.85fr)_1fr]">
                <div className={`overflow-hidden ${isBoutique ? 'rounded-[34px]' : 'rounded-2xl'}`}><div className="aspect-square"><ProductImage product={productDetail} /></div></div>
                <div className="flex flex-col justify-center">
                  <p className={`m-0 text-xs font-black uppercase tracking-[0.2em] ${mutedText}`}>{productDetail.category || productDetail.code || 'Product'}</p>
                  <h2 className={`m-0 mt-3 text-4xl font-black leading-tight tracking-normal sm:text-6xl ${darkText}`}>{productDetail.name}</h2>
                  <p className={`mt-5 max-w-2xl text-base leading-7 ${mutedText}`}>{productDetail.description || 'Available online'}</p>
                  <div className={`mt-6 text-4xl font-black ${darkText}`}>{formatMoney(productDetail.rate)}</div>
                  <button type="button" onClick={() => addToCart(productDetail)} style={{ background: primary }} className={`${primaryButton} mt-7 h-12 w-fit`}><ShoppingCart size={18} /> Add to cart</button>
                </div>
              </div>
            </section>
          ) : null}

          {page === 'products' ? (
            <>
              {Hero}
              {['products', 'categories', undefined].includes(storePage) ? (
                <section data-store-section="products" id="products" className={storePage ? `border p-5 shadow-sm ${surface} ${isBoutique ? 'rounded-[34px]' : 'rounded-2xl'}` : 'mt-8'}>
                  <div className={`mb-5 flex flex-col gap-4 ${isMarketplace ? 'xl:flex-row xl:items-center xl:justify-between' : 'xl:flex-row xl:items-end xl:justify-between'}`}>
                    <div>
                      <p className={`m-0 text-xs font-black uppercase tracking-[0.24em] ${mutedText}`}>{isMarketplace ? 'Catalog' : isPremium ? 'Selection' : 'Curated Shop'}</p>
                      <h2 className={`m-0 mt-2 text-4xl font-black tracking-normal ${darkText}`}>{storePage === 'categories' ? 'Categories' : (store?.theme?.productsTitle || 'Products')}</h2>
                      <p className={`m-0 mt-1 text-base font-semibold ${mutedText}`}>{filteredProducts.length} available items</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {categories.map((item) => <CategoryPill key={item} active={category === item} primary={primary} label={item} icon={item === 'All' ? null : Package} onClick={() => setCategory(item)} />)}
                      <label className="flex h-10 overflow-hidden rounded-full border border-slate-200 bg-white text-xs font-black text-slate-700">
                        <span className="grid place-items-center border-r border-slate-200 px-4 text-slate-400">Filter</span>
                        <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} className="h-full min-w-[150px] border-0 bg-white px-3 text-xs font-black text-slate-700 outline-none">
                          <option value="all">All products</option>
                          <option value="in-stock">In stock</option>
                          <option value="under-10000">Under Rs.10,000</option>
                          <option value="10000-50000">Rs.10,000 - Rs.50,000</option>
                          <option value="above-50000">Above Rs.50,000</option>
                        </select>
                      </label>
                      <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} className="h-10 rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 outline-none">
                        <option value="newest">Newest First</option>
                        <option value="price-low">Price Low to High</option>
                        <option value="price-high">Price High to Low</option>
                        <option value="name">Name A to Z</option>
                      </select>
                    </div>
                  </div>
                  <div className={`grid gap-4 ${productGrid}`}>
                    {filteredProducts.map((product) => <TemplateProductCard key={product.id} product={product} slug={slug} onAdd={addToCart} onWishlist={toggleWishlist} wished={wishlist.includes(product.id)} primary={primary} variant={templateName} />)}
                  </div>
                  {!filteredProducts.length ? <div className={`rounded-2xl border p-10 text-center text-sm font-semibold ${isPremium ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}>No products found.</div> : null}
                </section>
              ) : null}
              {storePage === 'wishlist' ? (
                <section id="wishlist" className={`border p-5 shadow-sm ${surface} ${isBoutique ? 'rounded-[34px]' : 'rounded-2xl'}`}>
                  <div className="mb-5 flex items-end justify-between gap-3">
                    <div><h2 className={`m-0 text-4xl font-black ${darkText}`}>Wishlist</h2><p className={`m-0 mt-1 ${mutedText}`}>{wishlistProducts.length} saved item(s)</p></div>
                    <button type="button" onClick={() => scrollToSection('products', '/products')} style={{ background: primary }} className={`${primaryButton} h-11`}>Continue shopping</button>
                  </div>
                  <div className={`grid gap-4 ${productGrid}`}>{wishlistProducts.map((product) => <TemplateProductCard key={product.id} product={product} slug={slug} onAdd={addToCart} onWishlist={toggleWishlist} wished primary={primary} variant={templateName} />)}</div>
                </section>
              ) : null}
              {(store?.theme?.showBenefits !== false && !storePage || storePage === 'offers') ? (
                <section data-store-section="benefits" id="offers" className={`mt-8 grid gap-4 border p-5 shadow-sm lg:grid-cols-4 ${surface} ${isBoutique ? 'rounded-[30px]' : 'rounded-2xl'}`}>
                  <HeroBenefit icon={Truck} title="Free Shipping" text="On all orders above Rs.999" tone="bg-blue-100 text-blue-600" />
                  <HeroBenefit icon={RefreshCw} title="Easy Returns" text="7 days hassle free returns" tone="bg-emerald-100 text-emerald-600" />
                  <HeroBenefit icon={ShieldCheck} title="Secure Payments" text="100% safe & secure" tone="bg-amber-100 text-amber-600" />
                  <HeroBenefit icon={Headphones} title="24/7 Support" text="Dedicated customer support" tone="bg-violet-100 text-violet-600" />
                </section>
              ) : null}
            </>
          ) : null}

          {page === 'checkout' ? (
            <section id="cart">
              <button type="button" onClick={() => { openStorePath(); setPage('products'); }} className="mb-4 inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><ArrowLeft size={16} /> Back to products</button>
              <div className={`grid gap-5 ${isMarketplace ? 'lg:grid-cols-[1fr_360px]' : 'lg:grid-cols-[1fr_440px]'}`}>
                <div className={`border p-5 shadow-sm ${surface} ${isBoutique ? 'rounded-[34px]' : 'rounded-2xl'}`}>
                  <div className="flex items-center justify-between"><h2 className={`m-0 text-3xl font-black ${darkText}`}>Cart</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{itemCount} items</span></div>
                  <div className="mt-4 divide-y divide-slate-100">{cart.map((item) => <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><strong className="line-clamp-1">{item.name}</strong><div className={`mt-1 text-sm font-semibold ${mutedText}`}>{formatMoney(item.rate)}</div></div><div className="inline-flex h-10 w-fit items-center rounded-full border border-slate-200 bg-white text-slate-700"><button type="button" onClick={() => changeQty(item.id, -1)} className="grid h-10 w-10 place-items-center"><Minus size={15} /></button><span className="min-w-8 text-center text-sm font-black">{item.qty}</span><button type="button" onClick={() => changeQty(item.id, 1)} className="grid h-10 w-10 place-items-center"><Plus size={15} /></button></div><div className="flex items-center justify-between gap-3 sm:justify-end"><strong>{formatMoney(Number(item.rate || 0) * item.qty)}</strong><button type="button" onClick={() => removeFromCart(item.id)} className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-600"><Trash2 size={16} /></button></div></div>)}</div>
                  {!cart.length ? <p className={`mt-4 rounded-xl px-4 py-5 text-center text-sm font-semibold ${isPremium ? 'bg-white/5 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>Cart is empty.</p> : null}
                  <div className="mt-5 flex justify-between rounded-2xl px-4 py-4 text-lg font-black text-white" style={{ background: primary }}><span>Total</span><span>{formatMoney(total)}</span></div>
                </div>
                <form onSubmit={placeOrder} className={`border p-5 shadow-sm ${surface} ${isBoutique ? 'rounded-[34px]' : 'rounded-2xl'}`}>
                  <h2 className={`m-0 text-3xl font-black ${darkText}`}>Place order</h2>
                  <div className="mt-4 grid gap-3">
                    <input required value={customer.customerName} onChange={(event) => updateCustomer('customerName', event.target.value)} placeholder="Name" className={inputClass} />
                    <input required value={customer.customerPhone} onChange={(event) => updateCustomer('customerPhone', event.target.value)} placeholder="Phone" className={inputClass} />
                    <input value={customer.customerEmail} onChange={(event) => updateCustomer('customerEmail', event.target.value)} placeholder="Email optional" className={inputClass} />
                    <textarea value={customer.deliveryAddress} onChange={(event) => updateCustomer('deliveryAddress', event.target.value)} placeholder="Address" className="min-h-28 rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
                    <textarea value={customer.notes} onChange={(event) => updateCustomer('notes', event.target.value)} placeholder="Notes optional" className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
                    <button disabled={!cart.length || placing} style={{ background: primary }} className={`${primaryButton} h-12 disabled:opacity-50`}><ShoppingCart size={17} /> {placing ? 'Placing...' : 'Place order'}</button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}
        </section>
        {store?.theme?.showFooter !== false || storePage === 'about' ? <footer data-store-section="footer" id="about" className={`${isPremium ? 'bg-black' : isMarketplace ? 'bg-orange-950' : 'bg-pink-950'} mt-8 text-white`}>
          <div className="mx-auto grid max-w-[1780px] gap-8 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-10">
            <div><StoreLogo store={store} primary={primary} inverse /><p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">{store?.theme?.footerText || store?.tagline || 'Your trusted destination for quality products at the best prices.'}</p></div>
            <div><h3 className="m-0 text-sm font-black">Shop</h3><div className="mt-4 grid gap-2 text-sm text-slate-300">{['Products', 'Categories', 'Offers', 'Wishlist'].map((item) => <button key={item} type="button" onClick={() => scrollToSection(item === 'Offers' ? 'offers' : item === 'Wishlist' ? 'wishlist' : 'products', `/${item.toLowerCase()}`)} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">{item}</button>)}</div></div>
            <div><h3 className="m-0 text-sm font-black">Support</h3><div className="mt-4 grid gap-2 text-sm text-slate-300">{['Shipping Policy', 'Return & Refund', 'Terms & Conditions', 'Privacy Policy'].map((item) => <button key={item} type="button" onClick={() => showNotice(`${item} page will be connected soon.`)} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">{item}</button>)}</div></div>
            <div><h3 className="m-0 text-sm font-black">Contact</h3><div className="mt-4 grid gap-3 text-sm text-slate-300"><a className="inline-flex items-center gap-2 text-slate-300 no-underline hover:text-white" href={`mailto:${store?.email || 'support@gobright.com'}`}><Mail size={15} /> {store?.email || 'support@gobright.com'}</a><a className="inline-flex items-center gap-2 text-slate-300 no-underline hover:text-white" href={`tel:${store?.phone || '+919876543210'}`}><Phone size={15} /> {store?.phone || '+91 98765 43210'}</a><span className="inline-flex items-center gap-2"><MapPin size={15} /> {store?.address || 'Chennai, India'}</span></div></div>
          </div>
        </footer> : null}
      </main>
    );
  }

  return (
    <main className={`min-h-screen pt-[76px] ${storefrontTheme.shell}`}>
      <header className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur ${storefrontTheme.header}`}>
        <div className="mx-auto flex max-w-[1780px] items-center gap-5 px-4 py-3 sm:px-6 lg:px-8">
          <button type="button" onClick={() => { openStorePath(); setPage('products'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="border-0 bg-transparent p-0 text-left">
            <StoreLogo store={store} primary={primary} />
          </button>
          <nav className="hidden items-center gap-2 lg:flex">
            <NavButton icon={Home} label="Home" primary={primary} active={!storePage && page === 'products'} onClick={() => { openStorePath(); setPage('products'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            <NavButton icon={Package} label="Products" primary={primary} active={storePage === 'products'} onClick={() => scrollToSection('products', '/products')} />
            <NavButton icon={Grid3X3} label="Categories" primary={primary} active={storePage === 'categories'} onClick={() => scrollToSection('products', '/categories')} />
            <NavButton icon={Tag} label="Offers" primary={primary} active={storePage === 'offers'} onClick={() => scrollToSection('offers', '/offers')} />
            <NavButton icon={Info} label="About" primary={primary} active={storePage === 'about'} onClick={() => scrollToSection('about', '/about')} />
          </nav>
          <label className="relative ml-auto hidden w-[430px] xl:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for products, brands, or categories..." className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-semibold outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50" />
          </label>
          <div className="ml-auto flex items-center gap-3 xl:ml-0">
            <IconCounter icon={Heart} count={wishlist.length} primary={primary} active={storePage === 'wishlist'} onClick={() => scrollToSection('wishlist', '/wishlist')} label="Wishlist" />
            <IconCounter icon={ShoppingCart} count={itemCount} primary={primary} active={page === 'checkout'} onClick={() => { openStorePath('/cart'); setPage('checkout'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} label="Cart" />
            <button type="button" onClick={() => showNotice('Customer profile menu will be available after account login.')} className="hidden items-center gap-3 border-0 bg-transparent sm:flex">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-sm font-black text-white">F</span>
              <span className="text-sm font-black">Fradrick</span>
              <ChevronDown size={16} className="text-slate-500" />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1780px] px-4 py-5 sm:px-6 lg:px-8">
        {message ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</div> : null}
        {error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}

        {productDetail ? (
          <section className={`border p-5 shadow-sm sm:p-6 ${storefrontTheme.card}`}>
            <Link to={`/store/${slug}`} className="inline-flex items-center gap-2 text-sm font-black text-blue-600 no-underline">
              <ArrowLeft size={16} /> Back to products
            </Link>
            <div className="mt-5 grid gap-6 lg:grid-cols-[460px_1fr]">
              <div className="overflow-hidden rounded-3xl border border-slate-200">
                <div className="aspect-square">
                  <ProductImage product={productDetail} />
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <p className="m-0 text-sm font-black uppercase text-slate-400">{productDetail.category || productDetail.code || 'Product'}</p>
                <h2 className="m-0 mt-2 text-3xl font-black leading-tight tracking-normal sm:text-5xl">{productDetail.name}</h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{productDetail.description || 'Available online'}</p>
                <div className="mt-5 text-3xl font-black">{formatMoney(productDetail.rate)}</div>
                <button type="button" onClick={() => addToCart(productDetail)} style={{ background: primary }} className="mt-6 inline-flex h-12 w-fit items-center gap-2 rounded-xl px-6 text-sm font-black text-white shadow-lg">
                  <ShoppingCart size={18} /> Add to cart
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {page === 'products' ? (
          <>
            {!storePage ? <section className={`relative overflow-hidden shadow-sm ring-1 ${storefrontTheme.hero}`}>
              <button type="button" onClick={() => showNotice('Previous banner will be added when more banners are configured.')} className="absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-500 shadow-lg md:grid">
                <ChevronLeft size={21} />
              </button>
              <div className="grid min-h-[250px] lg:grid-cols-[1fr_340px]">
                <div className={`relative overflow-hidden bg-gradient-to-r ${storefrontTheme.heroPanel} px-8 py-8 sm:px-16`}>
                  <img src={bannerImage} alt="Online shopping banner" className="absolute inset-y-0 right-0 hidden h-full w-[58%] object-cover opacity-90 lg:block" />
                  <div className="absolute inset-y-0 right-0 hidden w-[62%] bg-gradient-to-r from-blue-50 via-white/20 to-transparent lg:block" />
                  <div className="relative z-[1] max-w-3xl">
                    <p className="m-0 text-sm font-black uppercase tracking-[0.32em]" style={{ color: primary }}>New Arrivals</p>
                    <h2 className="m-0 mt-5 text-4xl font-black leading-tight tracking-normal text-slate-950 sm:text-5xl">
                      <span style={{ color: primary }}>Upgrade</span> Your Everyday Life
                    </h2>
                    <p className="m-0 mt-3 text-lg font-medium text-slate-600">Discover quality products at the best prices. Shop smart, live better.</p>
                    <div className="mt-7 flex flex-wrap items-center gap-5">
                      <button type="button" onClick={() => scrollToSection('products', '/products')} style={{ background: primary }} className="inline-flex h-12 items-center gap-2 rounded-xl px-7 text-sm font-black text-white shadow-lg">
                        Shop Now <ChevronRight size={18} />
                      </button>
                      <button type="button" onClick={() => showNotice('Demo video is not connected yet.')} className="inline-flex h-12 items-center gap-3 rounded-xl bg-transparent text-sm font-black text-slate-800">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-lg" style={{ color: primary }}><Play size={18} fill="currentColor" /></span>
                        Watch Demo
                      </button>
                    </div>
                    <div className="mt-8 flex gap-2">
                      {[0, 1, 2, 3].map((item) => <span key={item} style={item === 0 ? { background: primary } : undefined} className={`h-3 w-3 rounded-full ${item === 0 ? '' : 'bg-slate-300'}`} />)}
                    </div>
                  </div>
                </div>
                <aside className="hidden gap-8 p-8 lg:grid" style={{ background: `${primary}12` }}>
                  <HeroBenefit icon={Truck} title="Free Shipping" text="On all orders above Rs.999" tone="bg-emerald-100 text-emerald-600" />
                  <HeroBenefit icon={ShieldCheck} title="Secure Payment" text="100% secure checkout" tone="bg-blue-100 text-blue-600" />
                  <HeroBenefit icon={Headphones} title="24/7 Support" text="We're here to help" tone="bg-amber-100 text-amber-600" />
                </aside>
              </div>
              <button type="button" onClick={() => showNotice('Next banner will be added when more banners are configured.')} className="absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-500 shadow-lg md:grid">
                <ChevronRight size={21} />
              </button>
            </section> : null}

            {['products', 'categories', undefined].includes(storePage) ? <section id="products" className={storePage ? `mt-0 border p-5 shadow-sm ${storefrontTheme.card}` : 'mt-5'}>
              <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="m-0 text-3xl font-black tracking-normal">{storePage === 'categories' ? 'Categories' : 'Products'}</h2>
                  <p className="m-0 mt-1 text-base font-medium text-slate-500">{filteredProducts.length} available items</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {categories.map((item) => (
                    <CategoryPill key={item} active={category === item} primary={primary} label={item} icon={item === 'All' ? null : Package} onClick={() => setCategory(item)} />
                  ))}
                  <div className="inline-flex h-10 items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600">
                    <span className="px-4 text-slate-400">Sort by</span>
                    <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} className="h-full border-0 border-l border-slate-200 bg-white px-4 font-black outline-none">
                      <option value="newest">Newest First</option>
                      <option value="price-low">Price Low to High</option>
                      <option value="price-high">Price High to Low</option>
                      <option value="name">Name A to Z</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => setViewMode('grid')} style={viewMode === 'grid' ? { background: primary } : undefined} className={`grid h-10 w-12 place-items-center rounded-xl ${viewMode === 'grid' ? 'text-white' : 'border border-slate-200 bg-white text-slate-600'}`}><Grid3X3 size={18} /></button>
                  <button type="button" onClick={() => setViewMode('list')} style={viewMode === 'list' ? { background: primary } : undefined} className={`grid h-10 w-12 place-items-center rounded-xl ${viewMode === 'list' ? 'text-white' : 'border border-slate-200 bg-white text-slate-600'}`}><LayoutList size={18} /></button>
                </div>
              </div>

              <label className="relative mb-4 block xl:hidden">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
              </label>

              <div className={viewMode === 'grid' ? `grid gap-4 ${storefrontTheme.productGrid}` : 'grid gap-4'}>
                {filteredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} slug={slug} onWishlist={toggleWishlist} wished={wishlist.includes(product.id)} viewMode={viewMode} theme={storefrontTheme} primary={primary} />)}
              </div>
              {!filteredProducts.length ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">No products found.</div> : null}
            </section> : null}

            {storePage === 'wishlist' ? <section id="wishlist" className={`border p-5 shadow-sm ${storefrontTheme.card}`}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="m-0 text-3xl font-black tracking-normal">Wishlist</h2>
                  <p className="m-0 mt-1 text-base font-medium text-slate-500">{wishlistProducts.length} saved item(s)</p>
                </div>
                <button type="button" onClick={() => scrollToSection('products', '/products')} style={{ background: primary }} className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-black text-white">Continue shopping</button>
              </div>
              <div className={viewMode === 'grid' ? `grid gap-4 ${storefrontTheme.productGrid}` : 'grid gap-4'}>
                {wishlistProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} slug={slug} onWishlist={toggleWishlist} wished viewMode={viewMode} theme={storefrontTheme} primary={primary} />)}
              </div>
              {!wishlistProducts.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                <Heart className="mx-auto text-slate-300" size={36} />
                <h3 className="m-0 mt-3 text-xl font-black text-slate-950">Wishlist is empty</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">Save products from the store and they will appear here.</p>
              </div> : null}
            </section> : null}

            {(!storePage || storePage === 'offers') ? <section id="offers" className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-4">
              <HeroBenefit icon={Truck} title="Free Shipping" text="On all orders above Rs.999" tone="bg-blue-100 text-blue-600" />
              <HeroBenefit icon={RefreshCw} title="Easy Returns" text="7 days hassle free returns" tone="bg-emerald-100 text-emerald-600" />
              <HeroBenefit icon={ShieldCheck} title="Secure Payments" text="100% safe & secure" tone="bg-amber-100 text-amber-600" />
              <HeroBenefit icon={Headphones} title="24/7 Support" text="Dedicated customer support" tone="bg-violet-100 text-violet-600" />
            </section> : null}
          </>
        ) : null}

        {page === 'checkout' ? (
          <section id="cart" className="mt-2">
            <button type="button" onClick={() => { openStorePath(); setPage('products'); }} className="mb-4 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
              <ArrowLeft size={16} /> Back to products
            </button>
            <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
              <div className={`border p-5 shadow-sm sm:p-6 ${storefrontTheme.card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="m-0 text-2xl font-black tracking-normal">Cart</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{itemCount} items</span>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {cart.map((item) => (
                    <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div>
                        <strong className="line-clamp-1">{item.name}</strong>
                        <div className="mt-1 text-sm font-semibold text-slate-500">{formatMoney(item.rate)}</div>
                      </div>
                      <div className="inline-flex h-10 w-fit items-center rounded-xl border border-slate-200">
                        <button type="button" onClick={() => changeQty(item.id, -1)} className="grid h-10 w-10 place-items-center text-slate-600"><Minus size={15} /></button>
                        <span className="min-w-8 text-center text-sm font-black">{item.qty}</span>
                        <button type="button" onClick={() => changeQty(item.id, 1)} className="grid h-10 w-10 place-items-center text-slate-600"><Plus size={15} /></button>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <strong>{formatMoney(Number(item.rate || 0) * item.qty)}</strong>
                        <button type="button" onClick={() => removeFromCart(item.id)} className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                {!cart.length ? <p className="mt-4 rounded-xl bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-500">Cart is empty.</p> : null}
                <div className="mt-5 flex justify-between rounded-xl px-4 py-4 text-lg font-black text-white" style={{ background: primary }}>
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>

              <form onSubmit={placeOrder} className={`border p-5 shadow-sm sm:p-6 ${storefrontTheme.card}`}>
                <h2 className="m-0 text-2xl font-black tracking-normal">Place order</h2>
                <div className="mt-4 grid gap-3">
                  <input required value={customer.customerName} onChange={(event) => updateCustomer('customerName', event.target.value)} placeholder="Name" className={inputClass} />
                  <input required value={customer.customerPhone} onChange={(event) => updateCustomer('customerPhone', event.target.value)} placeholder="Phone" className={inputClass} />
                  <input value={customer.customerEmail} onChange={(event) => updateCustomer('customerEmail', event.target.value)} placeholder="Email optional" className={inputClass} />
                  <textarea value={customer.deliveryAddress} onChange={(event) => updateCustomer('deliveryAddress', event.target.value)} placeholder="Address" className="min-h-28 rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
                  <textarea value={customer.notes} onChange={(event) => updateCustomer('notes', event.target.value)} placeholder="Notes optional" className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
                  <button disabled={!cart.length || placing} style={{ background: primary }} className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50">
                    <ShoppingCart size={17} /> {placing ? 'Placing...' : 'Place order'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : null}
      </section>

      <footer id="about" className={`mt-8 ${storefrontTheme.footer}`}>
        <div className="mx-auto grid max-w-[1780px] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_0.8fr_0.9fr_1fr_1fr] lg:px-10">
          <div>
            <StoreLogo store={store} primary={primary} inverse />
            <p className="mt-6 max-w-xs text-sm leading-7 text-slate-300">Your trusted destination for quality products at the best prices.</p>
          </div>
          <div>
            <h3 className="m-0 text-sm font-black">Quick Links</h3>
            <div className="mt-5 grid gap-2 text-sm text-slate-300">
              <button type="button" onClick={() => { openStorePath(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">Home</button>
              <button type="button" onClick={() => scrollToSection('products', '/products')} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">Products</button>
              <button type="button" onClick={() => scrollToSection('products', '/categories')} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">Categories</button>
              <button type="button" onClick={() => scrollToSection('offers', '/offers')} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">Offers</button>
              <button type="button" onClick={() => scrollToSection('about', '/about')} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">About Us</button>
            </div>
          </div>
          <div>
            <h3 className="m-0 text-sm font-black">Help & Support</h3>
            <div className="mt-5 grid gap-2 text-sm text-slate-300">
              {['FAQs', 'Shipping Policy', 'Return & Refund', 'Terms & Conditions', 'Privacy Policy'].map((item) => (
                <button key={item} type="button" onClick={() => showNotice(`${item} page will be connected soon.`)} className="w-fit border-0 bg-transparent p-0 text-left text-slate-300 hover:text-white">{item}</button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="m-0 text-sm font-black">Contact Us</h3>
            <div className="mt-5 grid gap-3 text-sm text-slate-300">
              <a className="inline-flex items-center gap-2 text-slate-300 no-underline hover:text-white" href="mailto:support@gobright.com"><Mail size={15} /> support@gobright.com</a>
              <a className="inline-flex items-center gap-2 text-slate-300 no-underline hover:text-white" href="tel:+919876543210"><Phone size={15} /> +91 98765 43210</a>
              <span className="inline-flex items-center gap-2"><MapPin size={15} /> Chennai, India</span>
            </div>
          </div>
          <div>
            <h3 className="m-0 text-sm font-black">Follow Us</h3>
            <div className="mt-5 flex gap-3">
              {['f', 'ig', 'yt', 'x'].map((item) => <button type="button" key={item} onClick={() => showNotice(`${item.toUpperCase()} social link will be connected soon.`)} className="grid h-9 min-w-9 place-items-center rounded-lg border-0 bg-blue-500/20 px-2 text-xs font-black uppercase text-blue-200 hover:bg-blue-500/30">{item}</button>)}
            </div>
            <p className="mt-7 text-sm leading-6 text-slate-300">2026 {store?.storeName || 'Online Store'}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
