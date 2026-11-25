import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SoundProvider } from './context/SoundContext';
import { ToastProvider } from './context/ToastContext';
import { CartProvider, useCart } from './context/CartContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { SoundControlButton } from './components/SoundControlButton';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartDrawer } from './components/CartDrawer';
import { FloatingBottomCartBar } from './components/FloatingBottomCartBar';
import { SEOHead } from './components/SEOHead';
import { DEFAULT_HONEST_PRODUCTS } from './data/honestProducts';
import type { Order, DeliveryAddress } from './types';

// Lazy-load portal and admin dashboards - customers must NEVER download admin, rider, or partner code on initial visit
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const RiderDeliveryPage = lazy(() => import('./pages/RiderDeliveryPage').then(m => ({ default: m.RiderDeliveryPage })));
const ButcherStationPage = lazy(() => import('./pages/ButcherStationPage').then(m => ({ default: m.ButcherStationPage })));
const CustomerDashboardPage = lazy(() => import('./pages/CustomerDashboardPage').then(m => ({ default: m.CustomerDashboardPage })));
const OrderTrackingPage = lazy(() => import('./pages/OrderTrackingPage').then(m => ({ default: m.OrderTrackingPage })));
const CoolerReturnsPage = lazy(() => import('./pages/CoolerReturnsPage').then(m => ({ default: m.CoolerReturnsPage })));

// Lazy-load overlay modals
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then(m => ({ default: m.CheckoutModal })));
const OrderConfirmationModal = lazy(() => import('./components/OrderConfirmationModal').then(m => ({ default: m.OrderConfirmationModal })));
const LegalModal = lazy(() => import('./components/LegalModals').then(m => ({ default: m.LegalModal })));
const ContactModal = lazy(() => import('./components/ContactModal').then(m => ({ default: m.ContactModal })));
const WhatsAppButton = lazy(() => import('./components/WhatsAppButton').then(m => ({ default: m.WhatsAppButton })));
const GlassmorphicLoginGate = lazy(() => import('./components/GlassmorphicLoginGate').then(m => ({ default: m.GlassmorphicLoginGate })));
const LocationSelectorModal = lazy(() => import('./components/LocationSelectorModal').then(m => ({ default: m.LocationSelectorModal })));

const PageLoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center py-24 min-h-[300px]">
    <div className="w-8 h-8 border-3 border-[#d11243] border-t-transparent rounded-full animate-spin mb-3" />
    <span className="text-xs font-semibold text-gray-500">Loading module...</span>
  </div>
);

interface RouteState {
  page: 'home' | 'catalog' | 'tracking' | 'dashboard' | 'coolers' | 'admin' | 'rider' | 'butcher' | 'product';
  category?: string;
  productId?: string;
  orderId?: string;
}

const parseCurrentRoute = (): RouteState => {
  if (typeof window === 'undefined') return { page: 'home' };
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();

  // Backward compatibility for hash links
  if (hash === 'rider' || pathname === '/rider') return { page: 'rider' };
  if (['partner', 'butcher'].includes(hash) || ['/partner', '/butcher'].includes(pathname)) return { page: 'butcher' };
  if (hash === 'admin' || pathname === '/admin') return { page: 'admin' };
  if (hash === 'dashboard' || pathname === '/dashboard') return { page: 'dashboard' };
  if (hash === 'coolers' || pathname === '/coolers') return { page: 'coolers' };

  if (pathname.startsWith('/tracking') || hash === 'tracking') {
    const parts = pathname.split('/');
    return { page: 'tracking', orderId: parts[2] || '' };
  }

  if (pathname.startsWith('/category/')) {
    const rawCat = pathname.replace('/category/', '');
    const decoded = decodeURIComponent(rawCat);
    const matched = ['Chicken', 'Mutton', 'Seafood', 'Combos'].find(c => c.toLowerCase() === decoded.toLowerCase()) || decoded;
    return { page: 'catalog', category: matched };
  }

  if (pathname.startsWith('/product/')) {
    const prodId = pathname.replace('/product/', '');
    return { page: 'product', productId: decodeURIComponent(prodId) };
  }

  if (pathname === '/catalog' || hash === 'catalog') {
    return { page: 'catalog' };
  }

  return { page: 'home' };
};

const MainApp: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isCartOpen, setIsCartOpen } = useCart();
  const [route, setRoute] = useState<RouteState>(parseCurrentRoute);
  
  // Modals and Overlays
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authRoleHint, setAuthRoleHint] = useState<'customer' | 'admin'>('customer');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'tos' | 'privacy' | null>(null);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isAiButcherOpen, setIsAiButcherOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [activeProductForSeo, setActiveProductForSeo] = useState<any>(null);

  useEffect(() => {
    if (route.page === 'product' && route.productId) {
      const match = DEFAULT_HONEST_PRODUCTS.find(p => p.id === route.productId);
      if (match) {
        setActiveProductForSeo(match);
      }
    } else if (route.page !== 'product') {
      setActiveProductForSeo(null);
    }
  }, [route.page, route.productId]);

  // Customer Delivery Address State (saved in localStorage - null for new visitors)
  const [currentAddress, setCurrentAddress] = useState<DeliveryAddress | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('brisketbox_active_address');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return null;
  });

  const [selectedCity, setSelectedCity] = useState(() => currentAddress?.city || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => route.category || 'All');

  const currentTab = ['rider', 'butcher', 'admin', 'dashboard', 'coolers', 'tracking'].includes(route.page)
    ? (route.page as 'rider' | 'butcher' | 'admin' | 'dashboard' | 'coolers' | 'tracking')
    : 'catalog';

  const navigate = (to: string) => {
    if (typeof window === 'undefined') return;
    window.history.pushState({ type: 'route', path: to }, '', to);
    const parsed = parseCurrentRoute();
    setRoute(parsed);
    if (parsed.category) {
      setSelectedCategory(parsed.category);
    }
  };

  const handleSelectAddress = (addr: DeliveryAddress) => {
    setCurrentAddress(addr);
    setSelectedCity(addr.city);
    localStorage.setItem('brisketbox_active_address', JSON.stringify(addr));
  };

  const handleOpenLocationModal = () => {
    window.history.pushState({ type: 'modal', name: 'location' }, '');
    setIsLocationModalOpen(true);
  };

  // Synchronize browser history popstate
  useEffect(() => {
    const handlePopState = () => {
      // Step 1: If any overlay or modal is active, dismiss it
      if (isLocationModalOpen) {
        setIsLocationModalOpen(false);
        return;
      }
      if (isAiButcherOpen) {
        setIsAiButcherOpen(false);
        return;
      }
      if (isAuthOpen) {
        setIsAuthOpen(false);
        return;
      }
      if (isConfirmationOpen) {
        setIsConfirmationOpen(false);
        return;
      }
      if (isCheckoutOpen) {
        setIsCheckoutOpen(false);
        return;
      }
      if (legalModalType) {
        setLegalModalType(null);
        return;
      }
      if (isContactOpen) {
        setIsContactOpen(false);
        return;
      }
      if (isCartOpen) {
        setIsCartOpen(false);
        return;
      }

      // Step 2: Route update
      const updated = parseCurrentRoute();
      setRoute(updated);
      if (updated.category) {
        setSelectedCategory(updated.category);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLocationModalOpen, isAiButcherOpen, isAuthOpen, isCheckoutOpen, isConfirmationOpen, legalModalType, isContactOpen, isCartOpen, setIsCartOpen]);

  // Tab switching with real URL routes
  const handleTabChange = (tab: 'home' | 'catalog' | 'tracking' | 'dashboard' | 'coolers' | 'admin' | 'rider' | 'butcher') => {
    const pathMap: Record<string, string> = {
      home: '/',
      catalog: '/catalog',
      tracking: '/tracking',
      dashboard: '/dashboard',
      coolers: '/coolers',
      admin: '/admin',
      rider: '/rider',
      butcher: '/partner'
    };
    navigate(pathMap[tab] || '/');
  };

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    if (cat === 'All') {
      navigate('/catalog');
    } else {
      navigate(`/category/${cat.toLowerCase()}`);
    }
  };

  const handleOpenAuth = (roleHint?: 'customer' | 'admin') => {
    setAuthRoleHint(roleHint || 'customer');
    window.history.pushState({ type: 'modal', name: 'auth' }, '');
    setIsAuthOpen(true);
  };

  const handleCloseAuth = () => {
    setIsAuthOpen(false);
    if (authRoleHint === 'admin') {
      handleTabChange('admin');
    }
  };

  const handleProceedToCheckout = () => {
    if (!user) {
      handleOpenAuth('customer');
      return;
    }
    window.history.pushState({ type: 'modal', name: 'checkout' }, '');
    setIsCheckoutOpen(true);
  };

  const handleCloseCheckout = () => {
    setIsCheckoutOpen(false);
  };

  const handleOpenLegalModal = (type: 'tos' | 'privacy') => {
    window.history.pushState({ type: 'modal', name: 'legal' }, '');
    setLegalModalType(type);
  };

  const handleOpenAiButcher = () => {
    window.history.pushState({ type: 'modal', name: 'butcher-concierge' }, '');
    setIsAiButcherOpen(true);
  };

  const handleCloseAiButcher = () => {
    setIsAiButcherOpen(false);
  };

  const handleOrderSuccess = (newOrder: Order) => {
    setConfirmedOrder(newOrder);
    window.history.pushState({ type: 'modal', name: 'order-confirmation' }, '');
    setIsConfirmationOpen(true);
  };

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-[#f7f7f9] dark:bg-[#080c14] text-gray-800 dark:text-gray-100 flex flex-col font-sans selection:bg-[#d11243] selection:text-white transition-colors duration-300 relative">
      
      {/* Dynamic SEO Metadata & Schema */}
      {route.page === 'product' ? (
        <SEOHead 
          title={activeProductForSeo ? `${activeProductForSeo.name} | BrisketBox` : 'Fresh Cut Meat & Seafood | BrisketBox'}
          description={activeProductForSeo?.description || 'Fresh meat cut to order and delivered cold in reusable packaging.'}
          path={`/product/${route.productId}`}
          image={activeProductForSeo?.image || '/images/hero_banner_meat.webp'}
          product={activeProductForSeo}
        />
      ) : route.page === 'catalog' && selectedCategory && selectedCategory !== 'All' ? (
        <SEOHead 
          title={`Fresh ${selectedCategory} Cut Daily | BrisketBox`}
          description={`Order fresh ${selectedCategory.toLowerCase()} cuts delivered chilled.`}
          path={`/category/${selectedCategory.toLowerCase()}`}
        />
      ) : route.page === 'tracking' ? (
        <SEOHead 
          title="Order Tracking | BrisketBox"
          description="Track your fresh meat delivery status and order updates in real-time."
          path="/tracking"
        />
      ) : (
        <SEOHead 
          title="BrisketBox | Freshness, Sealed with Flavour"
          description="Fresh chicken, mutton and coastal seafood cut daily and delivered cold in reusable cold boxes."
          path="/"
        />
      )}

      {/* Top Navbar - Only rendered for Consumer Storefront & Admin Hub */}
      {!['rider', 'butcher'].includes(currentTab) && (
        <Navbar
          currentTab={currentTab}
          setCurrentTab={(tab) => handleTabChange(tab as any)}
          onOpenAuth={handleOpenAuth}
          selectedCity={selectedCity}
          setSelectedCity={setSelectedCity}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          currentAddress={currentAddress}
          onOpenLocationModal={handleOpenLocationModal}
          selectedCategory={selectedCategory}
          onSelectCategory={handleCategorySelect}
        />
      )}

      {/* Main Container */}
      <main className={`flex-1 w-full min-w-0 ${['rider', 'butcher'].includes(currentTab) ? 'p-0 max-w-full' : 'max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-5'}`}>
        {route.page === 'home' && (
          <HomePage 
            onNavigateToCatalog={(cat) => {
              if (cat) setSelectedCategory(cat);
              navigate(cat && cat !== 'All' ? `/category/${cat.toLowerCase()}` : '/catalog');
            }}
            onNavigateToProduct={(productId) => navigate(`/product/${productId}`)}
            onNavigateToReturns={() => {
              if (!user) handleOpenAuth('customer');
              else handleTabChange('coolers');
            }}
          />
        )}

        {route.page === 'catalog' && (
          <CatalogPage 
            initialCategory={selectedCategory}
            searchQuery={searchQuery}
            onSetSearchQuery={setSearchQuery}
            onNavigateToProduct={(productId) => navigate(`/product/${productId}`)}
            onNavigateHome={() => navigate('/')}
            onNavigateToReturns={() => {
              if (!user) handleOpenAuth('customer');
              else handleTabChange('coolers');
            }}
          />
        )}

        {route.page === 'product' && route.productId && (
          <ProductDetailPage 
            productId={route.productId}
            onNavigateHome={() => navigate('/')}
            onNavigateCatalog={() => navigate('/catalog')}
            onOpenCart={() => setIsCartOpen(true)}
          />
        )}

        <Suspense fallback={<PageLoadingSpinner />}>
          {currentTab === 'tracking' && (
            <OrderTrackingPage 
              onNavigateToReturns={() => {
                if (!user) handleOpenAuth('customer');
                else handleTabChange('coolers');
              }}
            />
          )}

          {currentTab === 'dashboard' && (
            user ? (
              <CustomerDashboardPage 
                onNavigateToTracking={(_orderId) => {
                  handleTabChange('tracking');
                }}
                onNavigateToCatalog={() => {
                  handleTabChange('catalog');
                }}
              />
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-8 text-center max-w-md mx-auto my-12 space-y-3">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Please Sign In to Access Customer Dashboard</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">View previous orders, track live parcels, download invoices, and manage cold-box refunds.</p>
                <button
                  onClick={() => handleOpenAuth('customer')}
                  className="px-4 py-2 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs"
                >
                  Sign In to Dashboard
                </button>
              </div>
            )
          )}

          {currentTab === 'coolers' && (
            user ? (
              <CoolerReturnsPage />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center max-w-md mx-auto my-12 space-y-3">
                <h3 className="font-bold text-gray-900 text-sm">Please Sign In to View Your Cold Boxes</h3>
                <p className="text-xs text-gray-500">Sign in with your registered account to manage cold boxes and delivery tracking.</p>
                <button
                  onClick={() => handleOpenAuth('customer')}
                  className="px-4 py-2 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs"
                >
                  Sign In with Credentials
                </button>
              </div>
            )
          )}

          {currentTab === 'admin' && (
            authLoading ? (
              <div className="flex items-center justify-center py-24 text-xs text-gray-500 font-bold">
                <div className="animate-spin mr-2 w-4 h-4 border-2 border-[#d11243] border-t-transparent rounded-full" />
                <span>Verifying Operations Hub credentials...</span>
              </div>
            ) : user?.role === 'admin' ? (
              <AdminDashboardPage />
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-8 text-center max-w-md mx-auto my-12 space-y-3">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Operations Admin Authentication Required</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Access to the Central Hub Operations Control Room requires verified administrator credentials.</p>
                <button
                  onClick={() => handleOpenAuth('admin')}
                  className="px-4 py-2 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                >
                  Sign In as Admin
                </button>
              </div>
            )
          )}

          {currentTab === 'rider' && (
            <RiderDeliveryPage onBackToStore={() => handleTabChange('catalog')} />
          )}

          {currentTab === 'butcher' && (
            <ButcherStationPage onBackToStore={() => handleTabChange('catalog')} />
          )}
        </Suspense>
      </main>

      {/* Footer - Only shown for Consumer Storefront & Admin */}
      {!['rider', 'butcher'].includes(currentTab) && (
        <footer className="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 mt-16 text-xs text-gray-600 dark:text-gray-400 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            <div className="space-y-3">
              <div className="flex items-center">
                <img 
                  src="/images/logo.webp" 
                  alt="BrisketBox - Freshness, Sealed with Flavour" 
                  className="h-10 sm:h-12 w-auto max-w-[200px] object-contain dark:hidden" 
                />
                <img 
                  src="/images/logo-dark.webp" 
                  alt="BrisketBox - Freshness, Sealed with Flavour" 
                  className="h-10 sm:h-12 w-auto max-w-[200px] object-contain hidden dark:block" 
                />
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Fresh meat and seafood cut daily and delivered cold to your door. Freshness, sealed with flavour.
              </p>
            </div>

            <div>
              <p className="text-neutral-900 dark:text-white font-bold mb-3">Fresh Categories</p>
              <ul className="space-y-1.5 text-neutral-600 dark:text-neutral-400 text-xs">
                <li>Daily Fish & Seafood (Surmai, Pomfret)</li>
                <li>Fresh Chicken</li>
                <li>Tender Mutton</li>
                <li>Jumbo Prawns (Cleaned & Deveined)</li>
                <li>Ready to Cook Marinades</li>
              </ul>
            </div>

            <div>
              <p className="text-neutral-900 dark:text-white font-bold mb-3">Quality & Service</p>
              <ul className="space-y-1.5 text-neutral-600 dark:text-neutral-400 text-xs">
                <li>Zero Security Deposit (Free Packaging)</li>
                <li>EPP Insulated Box with Ice Gel Packs</li>
                <li>Chilled Temperature Packaging</li>
                <li>Express Doorstep Delivery</li>
              </ul>
            </div>

            <div>
              <p className="text-gray-950 dark:text-white font-bold mb-3">Customer & Legal</p>
              <ul className="space-y-1 text-xs">
                <li>
                  <button 
                    onClick={() => handleOpenLegalModal('tos')} 
                    className="min-h-[44px] flex items-center py-2 px-1 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    Terms of Service & Delivery Policy
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleOpenLegalModal('privacy')} 
                    className="min-h-[44px] flex items-center py-2 px-1 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    Privacy Policy (DPDP Compliance)
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => {
                      window.history.pushState({ type: 'modal', name: 'contact' }, '');
                      setIsContactOpen(true);
                    }} 
                    className="min-h-[44px] flex items-center py-2 px-1 text-emerald-800 dark:text-emerald-300 font-bold hover:text-emerald-900 dark:hover:text-emerald-200 cursor-pointer gap-1.5 focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    <span>Contact Support & Concierge</span>
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => {
                      if (!user) handleOpenAuth('customer');
                      else handleTabChange('coolers');
                    }} 
                    className="min-h-[44px] flex items-center py-2 px-1 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    Doorstep Box Collection
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleTabChange('rider')} 
                    className="min-h-[44px] flex items-center py-2 px-1 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    Fleet Rider Partner App
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleTabChange('butcher')} 
                    className="min-h-[44px] flex items-center py-2 px-1 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    Master Butcher Station & KDS
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => {
                      if (user?.role === 'admin') handleTabChange('admin');
                      else handleOpenAuth('admin');
                    }} 
                    className="min-h-[44px] flex items-center py-2 px-1 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    Hub Fulfillment Operations
                  </button>
                </li>
              </ul>
            </div>

          </div>

          <div className="border-t border-gray-100 dark:border-slate-800 pt-5 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 gap-2">
            <div>
              © 2026 BrisketBox Technologies Private Limited. All rights reserved.
            </div>
            <div>
              Fresh Cold-Chain Direct Delivery
            </div>
          </div>
        </div>
      </footer>
      )}

      {/* Swiggy Style Floating Bottom Cart Bar */}
      <FloatingBottomCartBar
        onViewCart={() => setIsCartOpen(true)}
        isHidden={['rider', 'butcher'].includes(currentTab) || isCartOpen || isCheckoutOpen || isConfirmationOpen || isLocationModalOpen || isAiButcherOpen}
      />

      {/* Cart Drawer */}
      <CartDrawer onCheckout={handleProceedToCheckout} />

      <Suspense fallback={null}>
        {/* Checkout Modal */}
        {isCheckoutOpen && (
          <CheckoutModal
            isOpen={isCheckoutOpen}
            onClose={handleCloseCheckout}
            onOrderSuccess={handleOrderSuccess}
            selectedCity={selectedCity}
            currentAddress={currentAddress}
            onOpenLocationModal={handleOpenLocationModal}
          />
        )}

        {/* Location Selector Modal */}
        {isLocationModalOpen && (
          <LocationSelectorModal
            isOpen={isLocationModalOpen}
            onClose={() => setIsLocationModalOpen(false)}
            currentAddress={currentAddress}
            onSelectAddress={handleSelectAddress}
            selectedCity={selectedCity}
            onCityChange={setSelectedCity}
          />
        )}

        {/* Order Confirmation & Telemetry Modal (Figma Step 5) */}
        {isConfirmationOpen && (
          <OrderConfirmationModal
            order={confirmedOrder}
            isOpen={isConfirmationOpen}
            onClose={() => setIsConfirmationOpen(false)}
            onViewLiveTelemetry={() => {
              setIsConfirmationOpen(false);
              handleTabChange('tracking');
            }}
            onNavigateToReturns={() => {
              setIsConfirmationOpen(false);
              handleTabChange('coolers');
            }}
            onOpenCart={() => setIsCartOpen(true)}
          />
        )}

        {/* Glassmorphic Login / Register Modal (Prompted only on Checkout or Sign In click) */}
        {isAuthOpen && (
          <GlassmorphicLoginGate
            isOpen={isAuthOpen}
            isModalMode={true}
            roleHint={authRoleHint}
            onCloseModal={handleCloseAuth}
            onUnlockGuest={handleCloseAuth}
          />
        )}

        {/* Legal Modals */}
        {legalModalType && (
          <LegalModal
            type={legalModalType}
            onClose={() => setLegalModalType(null)}
          />
        )}

        {/* Customer Support & Concierge Modal */}
        {isContactOpen && (
          <ContactModal
            isOpen={isContactOpen}
            onClose={() => setIsContactOpen(false)}
          />
        )}

        {/* Floating Master Butcher Concierge & WhatsApp Concierge (Rule 11: hidden if cart or checkout open) */}
        {!['rider', 'butcher', 'admin'].includes(currentTab) && (
          <WhatsAppButton 
            isChatbotOpen={isAiButcherOpen}
            onOpenChatbot={handleOpenAiButcher}
            onCloseChatbot={handleCloseAiButcher}
            onNavigateTab={handleTabChange}
            isCheckoutOpen={isCheckoutOpen}
            isProductPage={route.page === 'product'}
          />
        )}
      </Suspense>

      {/* Fixed Sound Control Button (Top-Right on All Pages & Portals) */}
      <SoundControlButton />

    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <SoundProvider>
            <ToastProvider>
              <CartProvider>
                <MainApp />
              </CartProvider>
            </ToastProvider>
          </SoundProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
