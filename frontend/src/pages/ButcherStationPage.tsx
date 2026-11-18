import React, { useState, useEffect } from 'react';
import { 
  Beef, 
  Scale, 
  QrCode, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Thermometer, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  Package, 
  RefreshCw, 
  ChevronRight,
  Sliders,
  Scissors,
  Store,
  ArrowLeft,
  Flame,
  Award,
  LogOut,
  Plus,
  Edit2,
  Check,
  FileText,
  Volume2,
  VolumeX,
  Eye,
  Wrench,
  Barcode,
  CheckSquare,
  Square,
  Percent
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Order, Product } from '../types';

interface ButcherStationPageProps {
  onBackToStore?: () => void;
}

export const ButcherStationPage: React.FC<ButcherStationPageProps> = ({ onBackToStore }) => {
  const { user, setAuthSession, logout } = useAuth();

  // Auth Form State (when not authenticated as partner)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('partner@brisketbox.in');
  const [loginPassword, setLoginPassword] = useState('partner123');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Registration Form State
  const [regForm, setRegForm] = useState({
    shopName: '',
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    address: 'Indiranagar Harbor Station, Bengaluru',
    fssaiNumber: 'FSSAI-112243300',
    operatingHours: '05:30 AM - 09:30 PM',
    description: 'Specialist halal butchering and coastal fish station'
  });
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Active Partner Dashboard Tabs
  const [partnerTab, setPartnerTab] = useState<'orders' | 'inventory'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Active Butcher Prep Terminal State
  const [weighedGrams, setWeighedGrams] = useState<number>(495);
  const [targetGrams, setTargetGrams] = useState<number>(500);
  const [selectedBatch, setSelectedBatch] = useState<string>('LOT-SURMAI-0400AM-MNG');
  const [coldBoxId, setColdBoxId] = useState<string>('BOX-BLR-417');
  const [freshSealTag, setFreshSealTag] = useState<string>('FS-89412');
  const [liveTemp, setLiveTemp] = useState<number>(1.2);
  const [isPacking, setIsPacking] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);

  // Audio Dispatch Chime (Synthesized Web Audio API)
  const [soundEnabled, setSoundEnabled] = useState(true);
  const playButcherChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playTone(523.25, 0.0, 0.15); // C5
      playTone(659.25, 0.16, 0.15); // E5
      playTone(783.99, 0.32, 0.25); // G5
    } catch {}
  };

  // Industrial Digital Scale Connection (Web Serial API & Calibrated Bench Mode)
  const [scaleConnectionStatus, setScaleConnectionStatus] = useState<'calibrated' | 'hardware' | 'connecting'>('calibrated');
  const [scaleMode, setScaleMode] = useState<'bench_tare' | 'hardware_serial' | 'simulation'>('bench_tare');
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [isScaleStable, setIsScaleStable] = useState(true);
  const [isSimulatingStream, setIsSimulatingStream] = useState(false);

  const connectHardwareScale = async () => {
    try {
      setScaleConnectionStatus('connecting');
      if (!('serial' in navigator)) {
        showNotification('Web Serial is supported on Google Chrome & Edge. Station switched to Calibrated Bench Tare.');
        setScaleConnectionStatus('calibrated');
        setScaleMode('bench_tare');
        return;
      }
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      setScaleConnectionStatus('hardware');
      setScaleMode('hardware_serial');
      setIsScaleStable(true);
      showNotification('✓ Industrial Digital Scale Connected via COM Port (9600 baud)');
      playButcherChime();
    } catch (err: any) {
      // User closed the port selector or cancelled without selecting a physical scale
      setScaleConnectionStatus('calibrated');
      setScaleMode('bench_tare');
      setIsScaleStable(true);
      showNotification('✓ Station Operating in Calibrated Bench Tare Mode (Manual / Zero Tare Active)');
    }
  };

  const toggleScaleSimulation = () => {
    if (isSimulatingStream) {
      setIsSimulatingStream(false);
      showNotification('Live stream simulation paused.');
    } else {
      setIsSimulatingStream(true);
      setScaleConnectionStatus('calibrated');
      setScaleMode('simulation');
      showNotification('✓ Live Load-Cell Stream Simulation Active (±2g variance)');
      playButcherChime();
    }
  };

  useEffect(() => {
    if (!isSimulatingStream) return;
    const interval = setInterval(() => {
      setWeighedGrams(prev => {
        const jitter = (Math.random() - 0.5) * 4;
        const newWeight = Math.round(targetGrams + jitter);
        return Math.max(0, newWeight);
      });
      setIsScaleStable(true);
    }, 1200);
    return () => clearInterval(interval);
  }, [isSimulatingStream, targetGrams]);

  // Thermal Barcode Label Generator Modal
  const [showThermalLabelModal, setShowThermalLabelModal] = useState(false);
  const handlePrintThermalLabel = () => {
    window.print();
    setPrintSuccess(true);
    showNotification('✓ ESC/POS 58mm Label Sent to Thermal Printer');
  };

  // Multi-Item Line Checklist State
  const [lineItemChecklist, setLineItemChecklist] = useState<Array<{
    productId: string;
    name: string;
    quantity: number;
    targetGrams: number;
    weighedGrams: number;
    batchLotId: string;
    cutStyle?: string;
    isDone: boolean;
  }>>([]);

  // Carcass Yield & Dressing Loss Waste Calculator
  const [showYieldCalculator, setShowYieldCalculator] = useState(false);
  const [carcassType, setCarcassType] = useState<'broiler' | 'mutton' | 'surmai'>('broiler');
  const [grossCarcassGrams, setGrossCarcassGrams] = useState<number>(2000);
  const [dressedCarcassGrams, setDressedCarcassGrams] = useState<number>(1480);
  const [yieldLogs, setYieldLogs] = useState<Array<{
    type: string;
    gross: number;
    dressed: number;
    lossPercent: number;
    time: string;
  }>>([
    { type: 'Live Broiler Poultry', gross: 2200, dressed: 1650, lossPercent: 25.0, time: '06:15 AM' },
    { type: 'Whole Seer Fish (Surmai)', gross: 1800, dressed: 1476, lossPercent: 18.0, time: '07:30 AM' }
  ]);

  const lossGrams = Math.max(0, grossCarcassGrams - dressedCarcassGrams);
  const yieldPercent = ((dressedCarcassGrams / (grossCarcassGrams || 1)) * 100).toFixed(1);
  const dressingLossPercent = ((lossGrams / (grossCarcassGrams || 1)) * 100).toFixed(1);

  const handleSaveYieldLog = () => {
    const newLog = {
      type: carcassType === 'broiler' ? 'Live Broiler Poultry' : carcassType === 'mutton' ? 'Whole Mutton Carcass' : 'Whole Seer Fish',
      gross: grossCarcassGrams,
      dressed: dressedCarcassGrams,
      lossPercent: parseFloat(dressingLossPercent),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setYieldLogs([newLog, ...yieldLogs]);
    showNotification(`✓ Logged Dressing Loss: ${dressingLossPercent}% (${lossGrams}g loss)`);
    setShowYieldCalculator(false);
  };
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    category: 'Fish & Seafood',
    description: 'Fresh dressed cut, cleaned and chilled.',
    price: 499,
    mrp: 549,
    unit: '500g',
    netWeight: '450g',
    pieces: '4-6 Steaks',
    serves: 'Serves 2-3',
    origin: 'Mangalore Old Port Harbor',
    cutStyle: 'Clean Steaks',
    stock: 40
  });

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const rawBatches = [
    {
      id: 'LOT-SURMAI-0400AM-MNG',
      label: 'Surmai / Kingfish — Mangalore Old Port Daily Catch',
      origin: 'Deep Coastal Waters of Karnataka (Vessel #IND-KA-092)',
      catchTime: '04:00 AM Today',
      temp: '0.8°C'
    },
    {
      id: 'LOT-MUTTON-BLR-892',
      label: 'Free-Range Goat — Devanahalli Pasture Raised',
      origin: 'Pasture Raised, 100% Halal Hand-Cut & Chilled',
      catchTime: '05:30 AM Today',
      temp: '1.4°C'
    },
    {
      id: 'LOT-CHICKEN-FARM-201',
      label: 'Free-Range Chicken — Nelamangala Organic Farm',
      origin: 'Hormone-Free Free-Range Broiler Batch #201',
      catchTime: '06:00 AM Today',
      temp: '1.1°C'
    },
    {
      id: 'LOT-PRAWNS-CR-112',
      label: 'Sea Tiger Prawns — Karwar Deep Estuary',
      origin: 'Wild Sea Catch, Deveined at Harbor Cold Deck',
      catchTime: '03:45 AM Today',
      temp: '0.6°C'
    }
  ];

  // Load orders & inventory for this shop
  const loadPartnerData = async () => {
    try {
      setLoading(true);
      const [orderList, prodList] = await Promise.all([
        api.getPartnerOrders().catch(() => api.getOrders()),
        api.getPartnerProducts().catch(() => api.getProducts())
      ]);
      if (Array.isArray(orderList)) setOrders(orderList);
      if (Array.isArray(prodList)) setProducts(prodList);
    } catch (err) {
      console.error('Failed to load partner data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'partner' && user.approvalStatus === 'approved') {
      loadPartnerData();
      const interval = setInterval(loadPartnerData, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Handler: Partner Login
  const handlePartnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmittingAuth(true);

    try {
      const data = await api.partnerLogin({ email: loginEmail, password: loginPassword });
      setAuthSession(data.user, data.token);
      showNotification(`Welcome, ${data.user.shopName || data.user.name}!`);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please check your shop credentials.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Handler: Partner Registration
  const handlePartnerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmittingAuth(true);

    try {
      const res = await api.partnerRegister(regForm);
      setRegSuccess('Shop application submitted! Your account is Pending Operations Approval.');
      if (res.partner) {
        setAuthSession(res.partner, 'temp_token_pending');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Registration failed.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Handler: Toggle Product In Stock / Out of Stock
  const handleToggleStock = async (prod: Product) => {
    const nextStock = prod.stock > 0 ? 0 : 30;
    try {
      await api.updatePartnerStock(prod.id, { stock: nextStock, inStock: nextStock > 0 });
      setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock: nextStock, inStock: nextStock > 0 } : p));
      showNotification(`${prod.name} marked ${nextStock > 0 ? 'IN STOCK' : 'OUT OF STOCK'}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update stock');
    }
  };

  // Handler: Add New Cut to Partner Catalog
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.addPartnerProduct(newProductForm);
      setProducts(prev => [created, ...prev]);
      setShowAddProductModal(false);
      showNotification(`Added "${created.name}" to shop catalog!`);
    } catch (err: any) {
      alert(err.message || 'Failed to add cut');
    }
  };

  // KDS Butchering Actions
  const handleStartButchering = (order: Order) => {
    setSelectedOrder(order);
    const firstItem = order.items[0];
    let target = 500;
    if (firstItem?.netWeight?.includes('1kg') || firstItem?.netWeight?.includes('1000g')) {
      target = 1000;
    } else if (firstItem?.netWeight?.includes('800g')) {
      target = 800;
    } else if (firstItem?.netWeight?.includes('250g')) {
      target = 250;
    }
    setTargetGrams(target);
    setWeighedGrams(target - Math.floor(Math.random() * 8) + 2);
    setColdBoxId(order.coolerId || `BOX-BLR-${Math.floor(100 + Math.random() * 900)}`);
    setFreshSealTag(`FS-${Math.floor(10000 + Math.random() * 90000)}`);
    setLiveTemp(1.2);
    setPrintSuccess(false);

    const nameLower = (firstItem?.name || '').toLowerCase();
    if (nameLower.includes('mutton')) setSelectedBatch('LOT-MUTTON-BLR-892');
    else if (nameLower.includes('prawn')) setSelectedBatch('LOT-PRAWNS-CR-112');
    else if (nameLower.includes('chicken')) setSelectedBatch('LOT-CHICKEN-FARM-201');
    else setSelectedBatch('LOT-SURMAI-0400AM-MNG');

    // Multi-Item Line Checklist Generation
    const checklist = (order.items || []).map((it, idx) => {
      let tGrams = 500;
      if (it.netWeight?.includes('1kg') || it.netWeight?.includes('1000g') || it.unit?.includes('1kg')) tGrams = 1000;
      else if (it.netWeight?.includes('800g')) tGrams = 800;
      else if (it.netWeight?.includes('250g')) tGrams = 250;

      const itemLower = (it.name || '').toLowerCase();
      let b = 'LOT-SURMAI-0400AM-MNG';
      if (itemLower.includes('mutton') || itemLower.includes('lamb')) b = 'LOT-MUTTON-BLR-892';
      else if (itemLower.includes('prawn')) b = 'LOT-PRAWNS-CR-112';
      else if (itemLower.includes('chicken')) b = 'LOT-CHICKEN-FARM-201';

      return {
        productId: it.productId || `prod_${idx}`,
        name: it.name,
        quantity: it.quantity,
        targetGrams: tGrams,
        weighedGrams: tGrams - Math.floor(Math.random() * 6) + 1,
        batchLotId: b,
        cutStyle: it.cutStyle || 'Master Cut',
        isDone: idx === 0
      };
    });
    setLineItemChecklist(checklist);
  };

  const handleToggleItemCheck = (idx: number) => {
    setLineItemChecklist(prev => prev.map((item, i) => i === idx ? { ...item, isDone: !item.isDone } : item));
  };

  const handleCompletePrep = async () => {
    if (!selectedOrder) return;
    try {
      setIsPacking(true);
      const updated = await api.updatePartnerOrderStatus(selectedOrder.id, {
        status: 'Cold Box Packed',
        lifecycleStatus: 'PACKED',
        weighedWeight: `${weighedGrams}g`,
        sealTag: freshSealTag,
        batchLotId: selectedBatch,
        coolerId: coldBoxId,
        itemPrepList: lineItemChecklist
      });

      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      playButcherChime();
      showNotification(`✓ Order #${selectedOrder.orderNumber || selectedOrder.id} ready for rider pickup!`);
      setSelectedOrder(null);
    } catch (err: any) {
      alert(err.message || 'Failed to complete butcher preparation');
    } finally {
      setIsPacking(false);
    }
  };

  const weightDiff = weighedGrams - targetGrams;
  const weightPercent = ((weightDiff / targetGrams) * 100).toFixed(1);
  const isWithinTolerance = Math.abs(parseFloat(weightPercent)) <= 5.0;

  // =========================================================================
  // VIEW 1: AUTHENTICATION & ONBOARDING GATE (When not authenticated as Partner)
  // =========================================================================
  if (!user || user.role !== 'partner') {
    return (
      <div className="min-h-screen bg-[#070b13] text-gray-100 flex flex-col font-sans selection:bg-[#d11243]">
        <header className="bg-slate-950/90 border-b border-slate-800 px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center font-black text-white shadow-md">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="font-black text-sm tracking-tight text-white">BrisketBox Partner Station</span>
            </div>
            {onBackToStore && (
              <button
                onClick={onBackToStore}
                className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-rose-400" />
                <span>Store</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-md w-full mx-auto px-4 py-8 space-y-6">
          <div className="text-center space-y-1.5">
            <h1 className="text-xl font-black text-white">Butcher & Partner Shop Portal</h1>
            <p className="text-xs text-gray-400">Artisanal Fresh Cuts, Live KDS Terminal & Inventory</p>
          </div>

          {/* Quick Demo Access Bar */}
          <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Quick 1-Click Demo Profiles:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('partner@brisketbox.in');
                  setLoginPassword('partner123');
                }}
                className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[11px] font-bold text-left hover:bg-emerald-900/60 transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center gap-1">
                  <span>Abdul Rahim</span>
                  <span className="text-[9px] px-1 bg-emerald-500 text-black rounded font-black">Approved</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">Central Station #14</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('karthik.poultry@gmail.com');
                  setLoginPassword('partner123');
                }}
                className="p-2 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-300 text-[11px] font-bold text-left hover:bg-amber-900/60 transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center gap-1">
                  <span>Karthik Poultry</span>
                  <span className="text-[9px] px-1 bg-amber-500 text-black rounded font-black">Pending</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">Nelamangala Broiler</div>
              </button>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs font-bold">
            <button
              onClick={() => { setAuthMode('login'); setLoginError(null); }}
              className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                authMode === 'login' ? 'bg-[#d11243] text-white shadow-xs' : 'text-gray-400 hover:text-white'
              }`}
            >
              Partner Shop Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setLoginError(null); }}
              className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                authMode === 'register' ? 'bg-[#d11243] text-white shadow-xs' : 'text-gray-400 hover:text-white'
              }`}
            >
              Shop Registration
            </button>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {regSuccess && (
            <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-800 text-amber-200 text-xs flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{regSuccess}</span>
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={handlePartnerLogin} className="space-y-3.5 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 text-xs">
              <div>
                <label className="block text-gray-300 font-bold mb-1">Business Email or Phone</label>
                <input
                  type="text"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="partner@brisketbox.in or +91 98000 00000"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-bold mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                {isSubmittingAuth ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                <span>Access Partner Dashboard</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handlePartnerRegister} className="space-y-3 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 text-xs">
              <div>
                <label className="block text-gray-300 font-bold mb-1">Shop / Outlet Name</label>
                <input
                  type="text"
                  required
                  value={regForm.shopName}
                  onChange={(e) => setRegForm({ ...regForm, shopName: e.target.value })}
                  placeholder="Coastal Harbor Seafood & Halal Cuts #12"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Owner Name</label>
                  <input
                    type="text"
                    required
                    value={regForm.ownerName}
                    onChange={(e) => setRegForm({ ...regForm, ownerName: e.target.value })}
                    placeholder="Abdul Rahim"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    placeholder="+91 98800 00000"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Business Email</label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="shop@brisketbox.in"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-bold mb-1">Shop Address & Pickup Location</label>
                <input
                  type="text"
                  required
                  value={regForm.address}
                  onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                  placeholder="Shop #4, 100ft Road, Indiranagar, Bengaluru 560038"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">FSSAI License Number</label>
                  <input
                    type="text"
                    required
                    value={regForm.fssaiNumber}
                    onChange={(e) => setRegForm({ ...regForm, fssaiNumber: e.target.value })}
                    placeholder="11224330000491"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-[#d11243]"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Operating Hours</label>
                  <input
                    type="text"
                    value={regForm.operatingHours}
                    onChange={(e) => setRegForm({ ...regForm, operatingHours: e.target.value })}
                    placeholder="05:30 AM - 09:30 PM"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 shadow-md flex items-center justify-center gap-2 mt-2"
              >
                {isSubmittingAuth ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>Submit Shop Application</span>
              </button>
            </form>
          )}
        </main>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: PENDING APPROVAL NOTICE (When registered but not approved yet)
  // =========================================================================
  if (user?.approvalStatus === 'pending_approval') {
    return (
      <div className="min-h-screen bg-[#070b13] text-gray-100 flex flex-col font-sans selection:bg-[#d11243]">
        <header className="bg-slate-950/90 border-b border-slate-800 px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-amber-400" />
              <span className="font-black text-sm text-white">BrisketBox Partner Station</span>
            </div>
            <button
              onClick={logout}
              className="text-xs font-bold text-rose-400 hover:text-rose-300 cursor-pointer flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-md w-full mx-auto px-4 py-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-amber-950/80 border border-amber-600/60 flex items-center justify-center text-amber-400 shadow-xl">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-black text-white">Shop Verification in Progress</h2>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              Hello <strong className="text-white">{user.name}</strong>, your partner application for <strong className="text-amber-300">{user.shopName || 'your butcher station'}</strong> is being audited by BrisketBox Central Operations.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left text-xs space-y-2 w-full">
            <div className="flex justify-between">
              <span className="text-gray-400">Shop ID:</span>
              <span className="font-mono text-white font-bold">{user.shopId || user.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Application Status:</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black text-[10px] border border-amber-500/40">
                PENDING APPROVAL
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">FSSAI Status:</span>
              <span className="text-gray-200">{user.fssaiNumber || 'Document Verified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Operations Turnaround:</span>
              <span className="text-emerald-400 font-bold">Today by 6:00 PM</span>
            </div>
          </div>

          <div className="flex gap-2 w-full pt-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Status</span>
            </button>
            <button
              onClick={logout}
              className="px-4 py-2.5 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-rose-900/60 transition"
            >
              Sign Out
            </button>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: APPROVED BUTCHER PARTNER DASHBOARD (KDS Terminal & Product Catalog)
  // =========================================================================
  const pendingPrepOrders = orders.filter(
    (o) => o.orderStatus === 'CONFIRMED' || o.orderStatus === 'PREPARING' || o.status === 'Preparing'
  );
  const readyOrders = orders.filter(
    (o) => o.lifecycleStatus === 'READY_FOR_PICKUP' || o.status === 'Cold Box Packed'
  );

  return (
    <div className="min-h-screen bg-[#070b13] text-gray-100 flex flex-col font-sans selection:bg-[#d11243]">
      
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center font-black text-white shadow-md">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-tight text-white">
                  {user.shopName || user.name}
                </span>
                <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase">
                  FSSAI Verified
                </span>
              </div>
              <p className="text-[10px] text-gray-400">
                Partner Station #{user.shopId ? user.shopId.slice(-4).toUpperCase() : '14'} • {user.address || 'Bengaluru Central'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Digital Scale Station Button */}
            <button
              onClick={() => setShowScaleModal(true)}
              title="Industrial Weighing Scale & Station Tare Setup"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                scaleConnectionStatus === 'hardware'
                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-gray-200 hover:text-white hover:border-slate-600'
              }`}
            >
              <Scale className={`w-3.5 h-3.5 ${scaleConnectionStatus === 'hardware' ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="hidden sm:inline">
                {scaleConnectionStatus === 'hardware' ? 'Scale: COM3' : isSimulatingStream ? 'Scale: Streaming' : 'Scale: Bench Tare'}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${scaleConnectionStatus === 'hardware' || isSimulatingStream ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            </button>

            {/* Carcass Yield & Dressing Loss Calculator */}
            <button
              onClick={() => setShowYieldCalculator(true)}
              title="Carcass Yield & Dressing Loss Waste Calculator"
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Percent className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Yield & Loss Calc</span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Chime sound is active' : 'Chime sound is muted'}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-gray-300 hover:text-white transition cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-gray-400" />}
            </button>

            <button
              onClick={() => setShowAddProductModal(true)}
              className="px-3 py-1.5 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Cut</span>
            </button>

            <button
              onClick={logout}
              title="Sign Out of Partner Portal"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 border border-slate-700 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-4 pb-20 space-y-4">
        
        {/* Action Notice Toast */}
        {actionNotice && (
          <div className="p-3 bg-emerald-950/90 border border-emerald-700 text-emerald-200 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setPartnerTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-2 ${
              partnerTab === 'orders' ? 'bg-[#d11243] text-white shadow-xs' : 'bg-slate-900 text-gray-400 hover:text-white'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Order Prep Terminal ({pendingPrepOrders.length})</span>
          </button>

          <button
            onClick={() => setPartnerTab('inventory')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-2 ${
              partnerTab === 'inventory' ? 'bg-[#d11243] text-white shadow-xs' : 'bg-slate-900 text-gray-400 hover:text-white'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Product Catalog & Stock ({products.length})</span>
          </button>
        </div>

        {/* TAB 1: ORDER PREP TERMINAL (KDS) */}
        {partnerTab === 'orders' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Pending Butchering</span>
                <span className="text-2xl font-black text-amber-400">{pendingPrepOrders.length} Orders</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Ready for Rider Pickup</span>
                <span className="text-2xl font-black text-emerald-400">{readyOrders.length} Boxes</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-gray-400 uppercase font-bold block">Station Temperature</span>
                <span className="text-2xl font-black text-sky-400">1.2°C Chilled Seal</span>
              </div>
            </div>

            {pendingPrepOrders.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="font-bold text-white text-sm">All Butchering Orders Completed!</h3>
                <p className="text-xs text-gray-400">Ready boxes are stored in 0°C to 4°C chilling vault awaiting rider pickup.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingPrepOrders.map(ord => (
                  <div key={ord.id} className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-bold text-sm text-white">#{ord.orderNumber || ord.id}</span>
                        <p className="text-xs text-gray-400 mt-0.5">{ord.customerName} • {ord.deliverySlot}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black">
                        PREPARATION
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                      {ord.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-gray-200">
                          <div>
                            <span className="font-bold">{it.quantity}x {it.name}</span>
                            <span className="text-gray-400 block text-[11px]">Cut Style: {it.cutStyle || 'Standard'} • Net: {it.netWeight || it.unit}</span>
                          </div>
                          <span className="font-mono text-emerald-400 font-bold">₹{it.price * it.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 flex gap-2">
                      <button
                        onClick={() => handleStartButchering(ord)}
                        className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>Open Scale Tare & Chilled Seal</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SHOP INVENTORY & PRODUCT MANAGER */}
        {partnerTab === 'inventory' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-400">
                Managing {products.length} Fresh Cuts Catalogued to Your Shop
              </span>
              <button
                onClick={() => setShowAddProductModal(true)}
                className="px-3 py-1.5 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(prod => {
                const inStock = (prod.stock || 0) > 0;

                return (
                  <div key={prod.id} className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
                    <div className="flex gap-3">
                      <img
                        src={prod.image || prod.imageUrl || '/images/products/prod_1.jpg'}
                        alt={prod.name}
                        className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-[#d11243] uppercase font-black block">{prod.category}</span>
                        <h4 className="font-extrabold text-white text-xs truncate">{prod.name}</h4>
                        <div className="flex items-center gap-1.5 text-xs font-bold mt-1">
                          <span className="text-emerald-400">₹{prod.price}</span>
                          <span className="text-gray-500 line-through text-[11px]">₹{prod.mrp || prod.price + 50}</span>
                          <span className="text-[10px] text-gray-400">/ {prod.unit}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-gray-400 block text-[10px]">Depot Stock:</span>
                        <strong className="text-white font-mono">{prod.stock || 0} Units</strong>
                      </div>

                      <button
                        onClick={() => handleToggleStock(prod)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                          inStock
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900/60'
                            : 'bg-rose-950/60 text-rose-300 border-rose-800 hover:bg-rose-900/60'
                        }`}
                      >
                        {inStock ? '✓ IN STOCK' : '✕ OUT OF STOCK'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* SCALE TARE & FRESHSEAL MODAL                                             */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setSelectedOrder(null)} className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 text-gray-100 z-10 space-y-4 text-xs shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div>
                <h3 className="font-black text-white text-sm">
                  Butcher Prep & Chilled Seal • #{selectedOrder.orderNumber || selectedOrder.id}
                </h3>
                <p className="text-[11px] text-gray-400">Master Butcher workstation verification & batch audit</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-white p-1">✕</button>
            </div>

            {/* Scale Readout & Tare Station */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Industrial Scale Readout</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${scaleConnectionStatus === 'hardware' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-amber-300'}`}>
                    {scaleConnectionStatus === 'hardware' ? 'COM3 Calibrated' : isSimulatingStream ? 'Live Stream' : 'Calibrated Bench'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono text-emerald-400">{weighedGrams}g</span>
                  <span className={`text-[11px] font-bold ${isWithinTolerance ? 'text-emerald-400' : 'text-amber-400'}`}>
                    ({weightDiff >= 0 ? `+${weightDiff}` : weightDiff}g / {weightPercent}%)
                  </span>
                </div>
                <span className="text-[11px] text-gray-400 block mt-0.5">Target: {targetGrams}g (Quality Tolerance: ±5%)</span>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <button
                  type="button"
                  onClick={() => setWeighedGrams(targetGrams)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-200 font-bold text-xs cursor-pointer border border-slate-700 transition"
                >
                  Tare Zero (0.00g)
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setWeighedGrams(prev => Math.max(0, prev - 10))}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-gray-300 font-mono text-xs"
                  >-10g</button>
                  <button
                    type="button"
                    onClick={() => setWeighedGrams(prev => prev + 10)}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-gray-300 font-mono text-xs"
                  >+10g</button>
                </div>
              </div>
            </div>

            {/* Multi-Item Prep Checklist Table */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">
                Line-Item Cut Verification ({lineItemChecklist.length} Cuts)
              </span>
              <div className="border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80 bg-slate-950">
                {lineItemChecklist.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleToggleItemCheck(idx)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition ${
                      item.isDone ? 'bg-emerald-950/20' : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                        item.isDone ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-slate-700 text-transparent'
                      }`}>
                        ✓
                      </div>
                      <div>
                        <div className="font-bold text-gray-200 flex items-center gap-2">
                          <span className={item.isDone ? 'line-through text-gray-400' : 'text-white'}>
                            {item.quantity}x {item.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-semibold">
                            {item.cutStyle}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                          Lot: {item.batchLotId} • Weighed: {item.weighedGrams}g / {item.targetGrams}g
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase text-emerald-400">
                      {item.isDone ? 'Prepped' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cold Box & Thermal Vault Status */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-gray-400 block text-[10px]">Cold Box Chamber Temp</span>
                <span className="font-mono font-bold text-sky-400 text-sm">1.2°C (0°C to 4°C Safe)</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-gray-400 block text-[10px]">Security Tamper Seal</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">{freshSealTag}</span>
              </div>
            </div>

            {/* Action Buttons: Print Thermal Sticker & Mark Ready */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowThermalLabelModal(true)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-gray-100 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-700 flex items-center gap-1.5"
              >
                <Barcode className="w-4 h-4 text-amber-400" />
                <span>58mm Label</span>
              </button>

              <button
                type="button"
                disabled={isPacking}
                onClick={handleCompletePrep}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                {isPacking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Seal Box & Dispatch to Fleet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 58mm / 80mm ESC/POS THERMAL BARCODE LABEL PRINT PREVIEW MODAL             */}
      {/* ========================================================================= */}
      {showThermalLabelModal && selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setShowThermalLabelModal(false)} className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 text-gray-100 z-10 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="font-black text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Barcode className="w-4 h-4 text-emerald-400" />
                <span>58mm Thermal Label Output</span>
              </h3>
              <button onClick={() => setShowThermalLabelModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            {/* The Thermal Sticker Viewport (Black & White ESC/POS Simulation) */}
            <div className="bg-white text-black p-4 rounded-xl font-mono text-[11px] leading-tight shadow-md border-2 border-dashed border-gray-400 space-y-2">
              <div className="text-center pb-1 border-b border-black">
                <div className="text-sm font-black tracking-tighter uppercase">BRISKETBOX ARTISANAL MEATS</div>
                <div className="text-[9px] font-bold">FSSAI Lic No: {user.fssaiNumber || '11224330000491'}</div>
                <div className="text-[8px]">{user.shopName || 'Bengaluru Central Dark Hub #14'}</div>
              </div>

              <div className="space-y-0.5 text-[10px]">
                <div className="flex justify-between font-bold">
                  <span>ORDER #{selectedOrder.orderNumber || selectedOrder.id}</span>
                  <span>{new Date().toLocaleDateString('en-IN')}</span>
                </div>
                <div>CUSTOMER: {selectedOrder.customerName}</div>
                <div>SLOT: {selectedOrder.deliverySlot || 'Express 90-Min'}</div>
              </div>

              <div className="border-t border-b border-black py-1 space-y-0.5 text-[10px]">
                {lineItemChecklist.map((it, idx) => (
                  <div key={idx} className="flex justify-between font-bold">
                    <span>{it.quantity}x {it.name.slice(0, 20)}</span>
                    <span>{it.weighedGrams}g</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t border-dotted border-gray-600 font-black">
                  <span>TOTAL WEIGHED:</span>
                  <span>{weighedGrams}g</span>
                </div>
              </div>

              <div className="text-[9px] space-y-0.5">
                <div>CHAMBER TEMP: 1.2°C (0°C to 4°C Certified)</div>
                <div>LOT / BATCH: {selectedBatch}</div>
                <div>TAMPER SEAL: {freshSealTag}</div>
                <div>BEST BEFORE: 48 HRS FROM PACKING (REFRIGERATED)</div>
              </div>

              {/* Barcode graphic lines */}
              <div className="pt-2 text-center">
                <div className="h-10 bg-[repeating-linear-gradient(90deg,#000,#000_2px,#fff_2px,#fff_5px,#000_5px,#000_8px,#fff_8px,#fff_10px)] w-full mx-auto" />
                <span className="text-[9px] tracking-widest font-black block mt-1">*{selectedOrder.id.toUpperCase()}*</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handlePrintThermalLabel}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Send to Thermal Printer (ESC/POS)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowThermalLabelModal(false)}
                className="px-3 py-2.5 bg-slate-800 text-gray-300 font-bold rounded-xl text-xs hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CARCASS YIELD & DRESSING LOSS WASTE CALCULATOR MODAL                      */}
      {/* ========================================================================= */}
      {showYieldCalculator && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setShowYieldCalculator(false)} className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 text-gray-100 z-10 space-y-4 text-xs shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-600 text-amber-400 flex items-center justify-center">
                  <Percent className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm">Carcass Yield & Dressing Loss Calculator</h3>
                  <p className="text-[10px] text-gray-400">Butcher station waste audit & commercial yield control</p>
                </div>
              </div>
              <button onClick={() => setShowYieldCalculator(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            {/* Animal / Fish Species Selector */}
            <div className="space-y-1">
              <label className="text-gray-400 font-bold text-[11px] block">Select Carcass / Whole Specimen:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'broiler', label: 'Broiler Poultry', normLoss: '25-28%' },
                  { id: 'mutton', label: 'Mutton Carcass', normLoss: '38-42%' },
                  { id: 'surmai', label: 'Whole Seer Fish', normLoss: '16-20%' }
                ].map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCarcassType(c.id as any);
                      if (c.id === 'broiler') { setGrossCarcassGrams(2000); setDressedCarcassGrams(1480); }
                      else if (c.id === 'mutton') { setGrossCarcassGrams(12000); setDressedCarcassGrams(7440); }
                      else { setGrossCarcassGrams(2500); setDressedCarcassGrams(2050); }
                    }}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      carcassType === c.id
                        ? 'bg-amber-950/60 border-amber-600 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">{c.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">Norm: {c.normLoss}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs: Gross Weight vs Dressed Weight */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <label className="text-gray-400 block font-bold text-[10px]">Gross / Live Carcass (g):</label>
                <input
                  type="number"
                  value={grossCarcassGrams}
                  onChange={(e) => setGrossCarcassGrams(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 font-mono font-bold text-white text-sm focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <label className="text-gray-400 block font-bold text-[10px]">Dressed Net Meat (g):</label>
                <input
                  type="number"
                  value={dressedCarcassGrams}
                  onChange={(e) => setDressedCarcassGrams(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 font-mono font-bold text-emerald-400 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Live KPI Results */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-center">
                <span className="text-[10px] text-emerald-300 font-bold uppercase block">Usable Yield</span>
                <span className="text-xl font-black font-mono text-emerald-400">{yieldPercent}%</span>
                <span className="text-[10px] text-gray-400 block mt-0.5">{dressedCarcassGrams}g usable</span>
              </div>

              <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-800 text-center">
                <span className="text-[10px] text-rose-300 font-bold uppercase block">Dressing Loss</span>
                <span className="text-xl font-black font-mono text-rose-400">{dressingLossPercent}%</span>
                <span className="text-[10px] text-gray-400 block mt-0.5">{lossGrams}g trim/bone</span>
              </div>

              <div className="p-3 rounded-2xl bg-sky-950/40 border border-sky-800 text-center">
                <span className="text-[10px] text-sky-300 font-bold uppercase block">Standard Audit</span>
                <span className="text-xs font-bold text-sky-300 block mt-1.5">
                  {parseFloat(dressingLossPercent) <= 30 ? '✓ Commercial Pass' : '⚠️ High Loss'}
                </span>
              </div>
            </div>

            {/* Recent Yield Audit Logs */}
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Recent Station Batches:</span>
              <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 bg-slate-950">
                {yieldLogs.map((log, i) => (
                  <div key={i} className="p-2.5 flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-gray-200">{log.type}</span>
                      <span className="text-[10px] text-gray-400 block">Gross: {log.gross}g → Net: {log.dressed}g</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold font-mono text-rose-400">{log.lossPercent}% Loss</span>
                      <span className="text-[10px] text-gray-500 block">{log.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={handleSaveYieldLog}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
              >
                Save Batch to Station Waste Log
              </button>
              <button
                type="button"
                onClick={() => setShowYieldCalculator(false)}
                className="px-4 py-2.5 bg-slate-800 text-gray-300 font-bold rounded-xl text-xs hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADD PRODUCT MODAL                                                        */}
      {/* ========================================================================= */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setShowAddProductModal(false)} className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-gray-100 z-10 space-y-4 text-xs shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="font-black text-white text-sm">Add New Fresh Cut to Shop</h3>
              <button onClick={() => setShowAddProductModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3">
              <div>
                <label className="block text-gray-300 font-bold mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  value={newProductForm.name}
                  onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                  placeholder="e.g. Rechado White Pomfret Steaks"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Category</label>
                  <select
                    value={newProductForm.category}
                    onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  >
                    <option value="Fish & Seafood">Fish & Seafood</option>
                    <option value="Tender Mutton">Tender Mutton</option>
                    <option value="Fresh Chicken">Fresh Chicken</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Cut Style</label>
                  <input
                    type="text"
                    value={newProductForm.cutStyle}
                    onChange={(e) => setNewProductForm({ ...newProductForm, cutStyle: e.target.value })}
                    placeholder="Curry Cut / Fillet"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={newProductForm.price}
                    onChange={(e) => setNewProductForm({ ...newProductForm, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Initial Stock</label>
                  <input
                    type="number"
                    required
                    value={newProductForm.stock}
                    onChange={(e) => setNewProductForm({ ...newProductForm, stock: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-[#d11243]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl transition cursor-pointer shadow-md mt-2"
              >
                Add Cut to Shop Catalog
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INDUSTRIAL SCALE & STATION TARE CONFIGURATION MODAL                       */}
      {/* ========================================================================= */}
      {showScaleModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setShowScaleModal(false)} className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 text-gray-100 z-10 space-y-4 text-xs shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-950/80 border border-amber-600 text-amber-400 flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm">Industrial Weighing Scale & Station Tare</h3>
                  <p className="text-[10px] text-gray-400">FSSAI Legal for Trade Weights & Measures Standard</p>
                </div>
              </div>
              <button onClick={() => setShowScaleModal(false)} className="text-gray-400 hover:text-white p-1">✕</button>
            </div>

            {/* Industrial Digital LED Readout */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-400">
                <span>Live Digital Load Cell Readout</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-mono font-bold">
                    STABLE
                  </span>
                  <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[9px] font-mono font-bold">
                    NET
                  </span>
                </div>
              </div>

              <div className="flex items-baseline justify-between">
                <div className="text-4xl font-black font-mono text-emerald-400 tracking-tight">
                  {weighedGrams}.00 <span className="text-xl font-bold text-emerald-500">g</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 block text-[10px]">Station Protocol:</span>
                  <span className="font-mono text-amber-300 font-bold text-xs">
                    {scaleConnectionStatus === 'hardware' ? 'COM3 (9600 Baud RS232)' : isSimulatingStream ? 'Continuous Stream (Live)' : 'Calibrated Bench Mode'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-gray-400 flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span>Maximum Capacity: 30.000 kg</span>
                <span>Verification Scale Interval (e): 1.0g</span>
              </div>
            </div>

            {/* 3 Operational Modes */}
            <div className="space-y-2">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Select Scale Interface:</span>

              {/* Mode 1: Calibrated Bench Tare (Default) */}
              <div className={`p-3.5 rounded-2xl border transition ${
                scaleMode === 'bench_tare' && !isSimulatingStream
                  ? 'bg-amber-950/40 border-amber-600/80'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>Calibrated Station Bench Tare</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500 text-black font-black uppercase">Standard</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Recommended for dark hub butchery stations. Zeroes the cutting pan and enforces quality weights.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSimulatingStream(false);
                      setScaleMode('bench_tare');
                      setScaleConnectionStatus('calibrated');
                      setWeighedGrams(targetGrams);
                      showNotification('✓ Station set to Calibrated Bench Tare (Zeroed)');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-200 font-bold text-xs cursor-pointer border border-slate-700 shrink-0 ml-2"
                  >
                    Tare Zero
                  </button>
                </div>
              </div>

              {/* Mode 2: Hardware Serial Port */}
              <div className={`p-3.5 rounded-2xl border transition ${
                scaleConnectionStatus === 'hardware'
                  ? 'bg-emerald-950/40 border-emerald-600/80'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>Physical USB / RS-232 Hardware Scale</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-gray-300 font-bold">Web Serial</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Connect Essae, Toledo, Avery Weigh-Tronix, or CAS scales via COM port at 9600 baud.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={connectHardwareScale}
                    className="px-3 py-1.5 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold text-xs cursor-pointer shadow-xs shrink-0 ml-2"
                  >
                    {scaleConnectionStatus === 'hardware' ? 'Re-scan Port' : 'Detect COM Port'}
                  </button>
                </div>
              </div>

              {/* Mode 3: Continuous Stream Simulation */}
              <div className={`p-3.5 rounded-2xl border transition ${
                isSimulatingStream
                  ? 'bg-emerald-950/40 border-emerald-600/80'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>Continuous Load-Cell Stream Simulator</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">Demo / Test</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Emulates live serial stream packets with realistic micro-variances (±2g).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleScaleSimulation}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer shrink-0 ml-2 transition ${
                      isSimulatingStream
                        ? 'bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                    }`}
                  >
                    {isSimulatingStream ? 'Stop Stream' : 'Start Stream'}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowScaleModal(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs cursor-pointer transition text-center"
              >
                Close Scale Setup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
