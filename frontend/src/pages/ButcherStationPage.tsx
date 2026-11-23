import React, { useState, useEffect, useRef } from 'react';
import { 
  Beef, 
  Scale, 
  QrCode, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Thermometer, 
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
  Percent,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Phone,
  Bike,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  HelpCircle,
  Truck,
  ArrowUpRight,
  Calendar,
  Layers,
  ShoppingBag
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
    address: 'Road No. 36, Jubilee Hills, Hyderabad',
    fssaiNumber: 'FSSAI-112243300',
    operatingHours: '05:30 AM - 09:30 PM',
    description: 'Specialist artisanal butchering, chilled meat & poultry station'
  });
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Master Store Operations State (Figma: Live Order Acceptance Master Toggle)
  const [isStoreOnline, setIsStoreOnline] = useState(true);

  // Active Partner Dashboard Tabs (Figma: Dashboard, Orders, Inventory, Earnings, Station)
  const [partnerTab, setPartnerTab] = useState<'dashboard' | 'orders' | 'inventory' | 'earnings' | 'station'>('dashboard');
  
  // Orders Sub-tabs (Figma: Orders, Preparing, Ready, Picked up)
  const [orderSegmentTab, setOrderSegmentTab] = useState<'all' | 'new' | 'preparing' | 'ready' | 'pickedup'>('all');
  
  // Data State
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Search & Filters
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersQuickFilter, setOrdersQuickFilter] = useState<'all' | 'today' | 'immediate'>('all');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState<string>('All');
  const [inventorySort, setInventorySort] = useState<'low_stock' | 'name' | 'price'>('low_stock');
  const [inventoryStockFilter, setInventoryStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');

  // Preparation Time Overrides per order (Figma: [-] 20 Mins [+])
  const [prepTimeMap, setPrepTimeMap] = useState<Record<string, number>>({});

  // Decline Order Modal State (Figma: Reject Order Confirmation)
  const [declineOrderTarget, setDeclineOrderTarget] = useState<Order | null>(null);
  const [declineReason, setDeclineReason] = useState<string>('out_of_stock');
  const [customDeclineText, setCustomDeclineText] = useState<string>('');

  // Handover to Delivery Partner Modal State (Figma: Handover to Delivery Partner)
  const [handoverTarget, setHandoverTarget] = useState<Order | null>(null);
  const [handoverPinInput, setHandoverPinInput] = useState<string>('');
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);

  // Stock Quick-Adjust State (Figma: Tactile Stock Increment/Decrement Quick Bar)
  const [adjustingStockId, setAdjustingStockId] = useState<string | null>(null);

  // Earnings Time Range (Figma: This Week, Today, This Month, Custom)
  const [earningsPeriod, setEarningsPeriod] = useState<'week' | 'today' | 'month' | 'custom'>('week');

  // Active Butcher Prep Terminal State
  const [weighedGrams, setWeighedGrams] = useState<number>(495);
  const [targetGrams, setTargetGrams] = useState<number>(500);
  const [selectedBatch, setSelectedBatch] = useState<string>('LOT-SURMAI-0400AM-MNG');
  const [coldBoxId, setColdBoxId] = useState<string>('BOX-HYD-417');
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
        showNotification('Web Serial supported on Google Chrome & Edge. Station in Calibrated Bench Tare mode.');
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
    } catch {
      setScaleConnectionStatus('calibrated');
      setScaleMode('bench_tare');
      setIsScaleStable(true);
      showNotification('✓ Station Operating in Calibrated Bench Tare Mode (Zero Tare Active)');
    }
  };

  const toggleScaleSimulation = () => {
    if (isSimulatingStream) {
      setIsSimulatingStream(false);
      showNotification('Digital scale feed paused.');
    } else {
      setIsSimulatingStream(true);
      setScaleConnectionStatus('calibrated');
      setScaleMode('simulation');
      showNotification('Digital Scale Active (±2g tolerance calibrated)');
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
    category: 'Chicken & Poultry',
    description: 'Fresh dressed cut, cleaned and chilled under 0°C to 4°C.',
    price: 340,
    mrp: 380,
    unit: '1kg',
    netWeight: '1000g',
    pieces: 'Whole Bird Cut (12-14 pcs)',
    serves: 'Serves 4',
    origin: 'Telangana Farm Verified Batch',
    cutStyle: 'Curry Cut',
    stock: 25
  });

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const rawBatches = [
    {
      id: 'LOT-SURMAI-0400AM-MNG',
      label: 'Surmai / Kingfish — Coastal Harbor Daily Catch',
      origin: 'Deep Sea Catch, Chilled at Harbor Cold Deck',
      catchTime: '04:00 AM Today',
      temp: '0.8°C'
    },
    {
      id: 'LOT-MUTTON-BLR-892',
      label: 'Free-Range Goat — Pasture Raised',
      origin: 'Pasture Raised, 100% Halal Hand-Cut & Chilled',
      catchTime: '05:30 AM Today',
      temp: '1.4°C'
    },
    {
      id: 'LOT-CHICKEN-FARM-201',
      label: 'Farm Fresh Chicken — Organic Farm Batch',
      origin: 'Hormone-Free Broiler Batch #201',
      catchTime: '06:00 AM Today',
      temp: '1.1°C'
    },
    {
      id: 'LOT-PRAWNS-CR-112',
      label: 'Sea Tiger Prawns — Coastal Harbor',
      origin: 'Wild Sea Catch, Deveined at Harbor Cold Deck',
      catchTime: '03:45 AM Today',
      temp: '0.6°C'
    }
  ];

  // Auto-polling & sound notification
  const ordersCountRef = useRef<number>(0);

  const loadPartnerData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [orderList, prodList] = await Promise.all([
        api.getPartnerOrders().catch(() => api.getOrders()),
        api.getPartnerProducts().catch(() => api.getProducts())
      ]);
      if (Array.isArray(orderList)) {
        if (orderList.length > ordersCountRef.current && ordersCountRef.current > 0) {
          playButcherChime();
          showNotification('New Customer Order Placed! Added to Prep Queue.');
        }
        ordersCountRef.current = orderList.length;
        setOrders(orderList);
      }
      if (Array.isArray(prodList)) setProducts(prodList);
    } catch (err) {
      console.error('Failed to load partner data:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'partner' && user.approvalStatus === 'approved') {
      loadPartnerData(true);
      const interval = setInterval(() => loadPartnerData(false), 4000);
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

  // Quick Stock Step Adjuster (Figma: Tactile Stock Increment/Decrement Quick Bar `[-] 3.4kg [+]`)
  const handleQuickAdjustStock = async (prod: Product, deltaKg: number) => {
    setAdjustingStockId(prod.id);
    const newStock = Math.max(0, parseFloat(((prod.stock || 0) + deltaKg).toFixed(1)));
    try {
      await api.updatePartnerStock(prod.id, { stock: newStock, inStock: newStock > 0 });
      setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock: newStock, inStock: newStock > 0 } : p));
      showNotification(`✓ ${prod.name} stock set to ${newStock}kg`);
    } catch (err: any) {
      alert(err.message || 'Failed to adjust stock');
    } finally {
      setAdjustingStockId(null);
    }
  };

  // Toggle Live Visibility (Figma: Label - Toggle Active Switch)
  const handleToggleStock = async (prod: Product) => {
    const nextStock = prod.stock > 0 ? 0 : 25;
    try {
      await api.updatePartnerStock(prod.id, { stock: nextStock, inStock: nextStock > 0 });
      setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, stock: nextStock, inStock: nextStock > 0 } : p));
      showNotification(`✓ ${prod.name} ${nextStock > 0 ? 'LIVE on Store' : 'PAUSED (Out of Stock)'}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update stock');
    }
  };

  // Add New Cut to Partner Catalog
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.addPartnerProduct(newProductForm);
      setProducts(prev => [created, ...prev]);
      setShowAddProductModal(false);
      showNotification(`✓ Added "${created.name}" to store cut inventory!`);
    } catch (err: any) {
      alert(err.message || 'Failed to add cut');
    }
  };

  // Stepper for Order Prep Time (Figma: [-] 20 Mins [+])
  const getOrderPrepTime = (orderId: string) => prepTimeMap[orderId] ?? 20;
  const adjustOrderPrepTime = (orderId: string, delta: number) => {
    setPrepTimeMap(prev => {
      const cur = prev[orderId] ?? 20;
      const next = Math.max(5, Math.min(90, cur + delta));
      return { ...prev, [orderId]: next };
    });
  };

  // Accept & Start Prep Action (Figma: Primary Button "Accept & Start Prep")
  const handleAcceptOrder = async (order: Order) => {
    try {
      const updated = await api.updatePartnerOrderStatus(order.id, {
        status: 'Preparing Cut',
        lifecycleStatus: 'PREPARING',
        prepTimeMins: getOrderPrepTime(order.id)
      });
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      playButcherChime();
      showNotification(`✓ Order #${order.orderNumber || order.id.slice(-6).toUpperCase()} Accepted! Timer: ${getOrderPrepTime(order.id)} mins`);
      handleStartButchering(order);
    } catch (err: any) {
      alert(err.message || 'Failed to accept order');
    }
  };

  // Decline Order Modal Trigger
  const handleOpenDeclineModal = (order: Order) => {
    setDeclineOrderTarget(order);
    setDeclineReason('out_of_stock');
    setCustomDeclineText('');
  };

  // Confirm Decline (Figma: Reject Order Confirmation)
  const handleConfirmDecline = async () => {
    if (!declineOrderTarget) return;
    try {
      const reasonLabel = 
        declineReason === 'out_of_stock' ? 'Out of Stock' :
        declineReason === 'scale_offline' ? 'Digital Scale / Equipment Offline' :
        declineReason === 'rush_hour' ? 'Orders May Not Be Ready on Time' :
        customDeclineText || 'Operational Reason';

      const updated = await api.updatePartnerOrderStatus(declineOrderTarget.id, {
        status: 'Cancelled by Store',
        lifecycleStatus: 'CANCELLED',
        declineReason: reasonLabel
      });

      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      showNotification(`Order #${declineOrderTarget.orderNumber || declineOrderTarget.id.slice(-6).toUpperCase()} Declined (${reasonLabel}).`);
      setDeclineOrderTarget(null);
    } catch (err: any) {
      alert(err.message || 'Failed to decline order');
    }
  };

  // Handover to Delivery Partner (Figma: Handover to Delivery Partner)
  const handleOpenHandoverModal = (order: Order) => {
    setHandoverTarget(order);
    setHandoverPinInput('');
  };

  const handleConfirmHandover = async () => {
    if (!handoverTarget) return;
    try {
      setIsSubmittingHandover(true);
      const updated = await api.updatePartnerOrderStatus(handoverTarget.id, {
        status: 'Out for Delivery',
        lifecycleStatus: 'PICKED_UP',
        handoverPinVerified: true,
        handoverTimestamp: new Date().toISOString()
      });

      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      playButcherChime();
      showNotification(`✓ Order #${handoverTarget.orderNumber || handoverTarget.id.slice(-6).toUpperCase()} Handed over to Courier!`);
      setHandoverTarget(null);
    } catch (err: any) {
      alert(err.message || 'Handover verification failed');
    } finally {
      setIsSubmittingHandover(false);
    }
  };

  // KDS Butchering Prep Terminal
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
    setColdBoxId(order.coolerId || `BOX-HYD-${Math.floor(100 + Math.random() * 900)}`);
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
        lifecycleStatus: 'READY_FOR_PICKUP',
        weighedWeight: `${weighedGrams}g`,
        sealTag: freshSealTag,
        batchLotId: selectedBatch,
        coolerId: coldBoxId,
        itemPrepList: lineItemChecklist
      });

      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      playButcherChime();
      showNotification(`✓ Order #${selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()} Ready for Courier Pickup!`);
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

  // Pipeline order classification
  const newIncomingOrders = orders.filter(o => 
    (!o.lifecycleStatus || o.lifecycleStatus === 'CONFIRMED' || o.lifecycleStatus === 'PENDING') &&
    o.status !== 'Cold Box Packed' &&
    o.status !== 'Delivered' &&
    o.status !== 'Cancelled by Store'
  );

  const preparingOrders = orders.filter(o => 
    o.lifecycleStatus === 'PREPARING' || 
    (o.status && o.status.toLowerCase().includes('preparing'))
  );

  const readyOrders = orders.filter(o => 
    o.lifecycleStatus === 'READY_FOR_PICKUP' || 
    o.status === 'Cold Box Packed'
  );

  const pickedUpOrders = orders.filter(o => 
    o.lifecycleStatus === 'PICKED_UP' || 
    o.lifecycleStatus === 'IN_TRANSIT' || 
    o.lifecycleStatus === 'OUT_FOR_DELIVERY' || 
    o.lifecycleStatus === 'DELIVERED'
  );

  // Filtered orders according to search & quick chips
  const filteredOrders = orders.filter(o => {
    if (orderSegmentTab === 'new' && !newIncomingOrders.some(x => x.id === o.id)) return false;
    if (orderSegmentTab === 'preparing' && !preparingOrders.some(x => x.id === o.id)) return false;
    if (orderSegmentTab === 'ready' && !readyOrders.some(x => x.id === o.id)) return false;
    if (orderSegmentTab === 'pickedup' && !pickedUpOrders.some(x => x.id === o.id)) return false;

    if (ordersSearch.trim()) {
      const q = ordersSearch.toLowerCase();
      const matchId = (o.orderNumber || o.id).toLowerCase().includes(q);
      const matchCust = (o.customerName || '').toLowerCase().includes(q);
      const matchItem = (o.items || []).some(it => it.name.toLowerCase().includes(q));
      if (!matchId && !matchCust && !matchItem) return false;
    }

    if (ordersQuickFilter === 'immediate') {
      const isUrgent = (o.items || []).some(it => it.name.toLowerCase().includes('ribeye') || it.name.toLowerCase().includes('mutton'));
      if (!isUrgent && orderSegmentTab === 'new') return false;
    }

    return true;
  });

  // Filtered Inventory
  const filteredProducts = products.filter(p => {
    if (inventoryCategory !== 'All' && p.category !== inventoryCategory) return false;
    if (inventoryStockFilter === 'in_stock' && p.stock <= 0) return false;
    if (inventoryStockFilter === 'out_of_stock' && p.stock > 0) return false;
    if (inventorySearch.trim()) {
      const q = inventorySearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.origin || '').toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    if (inventorySort === 'low_stock') return (a.stock || 0) - (b.stock || 0);
    if (inventorySort === 'price') return (b.price || 0) - (a.price || 0);
    return a.name.localeCompare(b.name);
  });

  // Metrics
  const todayTotalRevenue = orders
    .filter(o => o.status !== 'Cancelled by Store')
    .reduce((sum, o) => sum + (o.total || o.totalAmount || 0), 0);

  const netPayout = Math.round(todayTotalRevenue * 0.92);

  // =========================================================================
  // AUTHENTICATION & ONBOARDING GATE (When not authenticated as Partner)
  // =========================================================================
  if (!user || user.role !== 'partner') {
    return (
      <div className="min-h-screen bg-[#f7f7f9] text-[#0f172a] flex flex-col font-sans selection:bg-[#d11243]">
        <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-xs">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#d11243] flex items-center justify-center font-black text-white shadow-md">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="font-black text-sm tracking-tight text-[#0f172a]">BrisketBox Butcher Station</span>
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
            <h1 className="text-xl font-black text-[#0f172a]">Butcher & Partner Shop Portal</h1>
            <p className="text-xs text-gray-400">Artisanal Fresh Cuts, Live KDS Terminal & Inventory</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2 text-xs">
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
                className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold text-left hover:bg-emerald-900/60 transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Approved Partner</span>
                </div>
                <div className="text-[10px] text-emerald-700/80 truncate font-medium">Road No. 36, Jubilee Hills</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('newshop@brisketbox.in');
                  setLoginPassword('partner123');
                }}
                className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold text-left hover:bg-amber-100 shadow-xs transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Pending Audit</span>
                </div>
                <div className="text-[10px] text-amber-700/80 truncate font-medium">Hitech City Cold Station</div>
              </button>
            </div>
          </div>

          <div className="flex border-b border-slate-200">
            <button
              onClick={() => { setAuthMode('login'); setLoginError(null); }}
              className={`flex-1 py-3 text-xs font-bold cursor-pointer transition border-b-2 ${
                authMode === 'login' ? 'border-[#d11243] text-[#d11243]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In to Station
            </button>
            <button
              onClick={() => { setAuthMode('register'); setLoginError(null); }}
              className={`flex-1 py-3 text-xs font-bold cursor-pointer transition border-b-2 ${
                authMode === 'register' ? 'border-[#d11243] text-[#d11243]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Register Butcher Shop
            </button>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {regSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{regSuccess}</span>
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={handlePartnerLogin} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold text-xs mb-1.5">Partner Email / Terminal ID</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="partner@brisketbox.in"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:ring-2 focus:ring-rose-100 shadow-xs transition"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold text-xs mb-1.5">Station Access Key</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:ring-2 focus:ring-rose-100 shadow-xs transition"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                {isSubmittingAuth ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                <span>Open Terminal</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handlePartnerRegister} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold text-xs mb-1.5">Butcher Shop / Brand Name</label>
                <input
                  type="text"
                  required
                  value={regForm.shopName}
                  onChange={(e) => setRegForm({ ...regForm, shopName: e.target.value })}
                  placeholder="GoMeat Artisanal Cuts & Poultry Hub"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a] focus:outline-none focus:border-[#d11243] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold text-xs mb-1.5">Owner Name</label>
                  <input
                    type="text"
                    required
                    value={regForm.ownerName}
                    onChange={(e) => setRegForm({ ...regForm, ownerName: e.target.value })}
                    placeholder="Master Butcher"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a] focus:outline-none focus:border-[#d11243] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold text-xs mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    placeholder="+91 98800 00000"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a] focus:outline-none focus:border-[#d11243] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold text-xs mb-1.5">Business Email</label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="shop@gomeat.in"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a] focus:outline-none focus:border-[#d11243] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold text-xs mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a] focus:outline-none focus:border-[#d11243] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold text-xs mb-1.5">Shop Address</label>
                <input
                  type="text"
                  required
                  value={regForm.address}
                  onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                  placeholder="Road No. 36, Jubilee Hills, Hyderabad"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a] focus:outline-none focus:border-[#d11243] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold text-xs mb-1.5">FSSAI License</label>
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
                  <label className="block text-slate-700 font-bold text-xs mb-1.5">Operating Hours</label>
                  <input
                    type="text"
                    value={regForm.operatingHours}
                    onChange={(e) => setRegForm({ ...regForm, operatingHours: e.target.value })}
                    placeholder="05:30 AM - 09:30 PM"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a] focus:outline-none focus:border-[#d11243] focus:bg-white"
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
  // PENDING APPROVAL VIEW
  // =========================================================================
  if (user?.approvalStatus === 'pending_approval') {
    return (
      <div className="min-h-screen bg-[#f7f7f9] text-[#0f172a] flex flex-col font-sans">
        <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-xs">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-amber-400" />
              <span className="font-black text-sm text-[#0f172a]">BrisketBox Butcher Station</span>
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
              Hello <strong className="text-white">{user.name}</strong>, your partner application for <strong className="text-amber-300">{user.shopName || 'your butcher station'}</strong> is being audited by GoMeat Central Operations.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs text-left text-xs space-y-2 w-full">
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
  // APPROVED BUTCHER PARTNER DASHBOARD (Complete Figma System)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#f7f7f9] text-[#0f172a] flex flex-col font-sans selection:bg-[#d11243] selection:text-white pb-24 md:pb-16">
      
      {/* Top Bar Header (Figma: Header & Live Order Acceptance Master Toggle) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-xs px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          
          {/* Shop Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#d11243] flex items-center justify-center font-black text-white shadow-sm shrink-0">
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-tight text-[#0f172a]">
                  {user.shopName || user.name || 'GoMeat Master Station'}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-wider">
                  FSSAI Certified
                </span>
              </div>
              <p className="text-[11px] text-gray-500 truncate max-w-xs sm:max-w-md">
                {user.address || 'Road No. 36, Jubilee Hills, Hyderabad'} • 90 Mins Dispatch
              </p>
            </div>
          </div>

          {/* Quick Header Controls */}
          <div className="flex items-center gap-2">
            
            {/* Live Order Acceptance Master Toggle (Figma Node: 1165:763) */}
            <div 
              onClick={() => {
                setIsStoreOnline(!isStoreOnline);
                showNotification(isStoreOnline ? 'Store paused from taking new orders.' : 'Store is now LIVE for customer orders!');
              }}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-xl flex items-center gap-2 cursor-pointer transition select-none shadow-2xs"
            >
              <div className={`w-2.5 h-2.5 rounded-full ${isStoreOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              <div className="hidden sm:flex flex-col text-left">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-xs font-bold text-[#0f172a]">Live Orders</span>
                  <span className={`text-[9px] font-black px-1 rounded ${isStoreOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                    {isStoreOnline ? 'LIVE' : 'OFF'}
                  </span>
                </div>
                <span className="text-[10px] text-gray-500">{isStoreOnline ? 'Shop Online' : 'Paused'}</span>
              </div>
              
              {/* Figma Switch Component */}
              <div className={`w-10 h-5 flex items-center rounded-full p-0.5 transition duration-300 ${isStoreOnline ? 'bg-emerald-600 justify-end' : 'bg-gray-300 justify-start'}`}>
                <div className="bg-white w-4 h-4 rounded-full shadow-md" />
              </div>
            </div>

            {/* Industrial Digital Scale Quick Button */}
            <button
              onClick={() => setShowScaleModal(true)}
              title="Industrial Weighing Scale & Station Tare Setup"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                scaleConnectionStatus === 'hardware'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-gray-200 text-gray-700 hover:text-black hover:border-gray-300'
              }`}
            >
              <Scale className={`w-3.5 h-3.5 ${scaleConnectionStatus === 'hardware' ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span className="hidden md:inline">
                {scaleConnectionStatus === 'hardware' ? 'Scale: COM3' : isSimulatingStream ? 'Scale: Live Load' : 'Bench Tare'}
              </span>
            </button>

            {/* Sound Dispatch Chime Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Chime sound is active' : 'Chime sound is muted'}
              className="p-2 rounded-xl bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 transition cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-gray-400" />}
            </button>

            {/* Back to Store (if opened as modal) */}
            {onBackToStore && (
              <button
                onClick={onBackToStore}
                title="Return to Customer Store"
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-[#d11243]" />
                <span>Store</span>
              </button>
            )}

            <button
              onClick={logout}
              title="Sign Out of Station"
              className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#d11243] border border-rose-200 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-4 space-y-4">
        
        {/* Action Notice Toast */}
        {actionNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionNotice}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Desktop Tab Navigation Bar (Figma Segmented Navigation) */}
        <div className="hidden md:flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2">
            
            <button
              onClick={() => setPartnerTab('dashboard')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                partnerTab === 'dashboard'
                  ? 'bg-[#d11243] text-white shadow-sm'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Dashboard Overview</span>
            </button>

            <button
              onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('all'); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                partnerTab === 'orders'
                  ? 'bg-[#d11243] text-white shadow-sm'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Orders Queue</span>
              {newIncomingOrders.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  partnerTab === 'orders' ? 'bg-white text-[#d11243]' : 'bg-[#d11243] text-white'
                }`}>
                  {newIncomingOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setPartnerTab('inventory')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                partnerTab === 'inventory'
                  ? 'bg-[#d11243] text-white shadow-sm'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Cut Inventory</span>
              <span className="px-1.5 py-0.2 rounded-full bg-gray-200 text-gray-700 text-[10px] font-bold">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => setPartnerTab('earnings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                partnerTab === 'earnings'
                  ? 'bg-[#d11243] text-white shadow-sm'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Earnings & Payouts</span>
            </button>

            <button
              onClick={() => setPartnerTab('station')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                partnerTab === 'station'
                  ? 'bg-[#d11243] text-white shadow-sm'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Station Tare & Scale</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddProductModal(true)}
              className="px-3 py-2 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Cut</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SCREEN 1: PARTNER DASHBOARD (Figma Frame: nodeId=1132:1967)               */}
        {/* ========================================================================= */}
        {partnerTab === 'dashboard' && (
          <div className="space-y-4 animate-in fade-in">
            
            {/* Header Greeting Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
                  <span>Good morning, {user.name ? user.name.split(' ')[0] : 'Master Butcher'}!</span>
                </h1>
                <p className="text-xs text-gray-500">
                  {user.address || 'Road No. 36, Jubilee Hills, Hyderabad'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-gray-500">KDS Dispatch Queue Active</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
            </div>

            {/* Hero Revenue Bento Card (Figma Node: 1165:778) */}
            <div className="relative overflow-hidden bg-[#d11243] text-white rounded-2xl p-5 shadow-md">
              {/* Decorative cleaver watermark pattern */}
              <div className="absolute -bottom-6 -right-4 opacity-15 pointer-events-none">
                <Beef className="w-44 h-44 text-white rotate-12" />
              </div>

              <div className="relative z-10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-wider text-rose-100 uppercase">
                    TODAY'S GROSS SALES
                  </span>
                  <div className="bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 text-[11px] font-bold text-white">
                    <TrendingUp className="w-3 h-3" />
                    <span>+18.4% vs yday</span>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight">
                    ₹{todayTotalRevenue > 0 ? todayTotalRevenue.toLocaleString('en-IN') : '18,425'}
                  </span>
                  <span className="text-xs text-rose-100 font-medium">
                    / {orders.length > 0 ? orders.length : 38} customer orders
                  </span>
                </div>

                <div className="pt-2 border-t border-white/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-rose-100">Net Estimated Payout: </span>
                    <span className="font-bold text-white">₹{netPayout > 0 ? netPayout.toLocaleString('en-IN') : '16,951'}</span>
                  </div>
                  <span className="text-[11px] text-rose-200">Daily Payout at 6:00 AM</span>
                </div>
              </div>
            </div>

            {/* Fulfillment Pipeline Counters (3-Up Grid) (Figma Node: 1165:797) */}
            <div className="grid grid-cols-3 gap-3">
              
              {/* Pending Action Required */}
              <div 
                onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('new'); }}
                className="bg-white rounded-xl p-3 border border-gray-200 relative overflow-hidden shadow-2xs hover:border-[#d11243] cursor-pointer transition"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#d11243]" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Pending</span>
                  <div className="w-2 h-2 rounded-full bg-[#d11243] animate-pulse" />
                </div>
                <div className="mt-1 text-lg font-black text-[#d11243]">
                  {newIncomingOrders.length} New
                </div>
                <div className="text-[10px] text-gray-500 font-medium truncate">
                  Needs cut trim
                </div>
              </div>

              {/* In Butcher Queue / Preparing */}
              <div 
                onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('preparing'); }}
                className="bg-white rounded-xl p-3 border border-gray-200 relative overflow-hidden shadow-2xs hover:border-amber-500 cursor-pointer transition"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Preparing</span>
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                </div>
                <div className="mt-1 text-lg font-black text-[#0f172a]">
                  {preparingOrders.length} Active
                </div>
                <div className="text-[10px] text-gray-500 font-medium truncate">
                  Prep & scale tare
                </div>
              </div>

              {/* Ready / Dispatched */}
              <div 
                onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('ready'); }}
                className="bg-white rounded-xl p-3 border border-gray-200 relative overflow-hidden shadow-2xs hover:border-emerald-500 cursor-pointer transition"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-600" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Ready / Sent</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-600" />
                </div>
                <div className="mt-1 text-lg font-black text-[#0f172a]">
                  {readyOrders.length + pickedUpOrders.length} Ready
                </div>
                <div className="text-[10px] text-emerald-700 font-bold truncate">
                  100% on-time
                </div>
              </div>
            </div>

            {/* Quick Actions 2x2 Grid (Figma Node: 1165:826) */}
            <div className="grid grid-cols-2 gap-3">
              
              {/* Manage Orders Tile */}
              <div 
                onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('all'); }}
                className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs hover:border-gray-300 transition cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[#d11243] flex items-center justify-center text-white">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  {newIncomingOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#d11243] text-white text-[10px] font-black">
                      {newIncomingOrders.length}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="font-bold text-xs text-[#0f172a]">Manage Orders</div>
                  <div className="text-[11px] text-[#d11243] font-semibold">
                    {newIncomingOrders.length} Action Required
                  </div>
                </div>
              </div>

              {/* Order History Tile */}
              <div 
                onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('pickedup'); }}
                className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs hover:border-gray-300 transition cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
                    <Clock className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-gray-400">
                    {pickedUpOrders.length}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="font-bold text-xs text-[#0f172a]">Order History</div>
                  <div className="text-[11px] text-gray-500">
                    {pickedUpOrders.length} Dispatched
                  </div>
                </div>
              </div>

              {/* Payout Details Tile */}
              <div 
                onClick={() => setPartnerTab('earnings')}
                className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs hover:border-gray-300 transition cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="mt-2">
                  <div className="font-bold text-xs text-[#0f172a]">Payout Details</div>
                  <div className="text-[11px] text-gray-500">Next Payout, Tomorrow</div>
                </div>
              </div>

              {/* Scale Tare & Bench Support Tile */}
              <div 
                onClick={() => setShowScaleModal(true)}
                className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs hover:border-gray-300 transition cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
                    <Scale className="w-5 h-5" />
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <div className="mt-2">
                  <div className="font-bold text-xs text-[#0f172a]">Store Scale Tare</div>
                  <div className="text-[11px] text-emerald-700 font-bold">Butcher Desk Calibrated</div>
                </div>
              </div>
            </div>

            {/* Urgent Orders Section (Figma Node: 1165:861) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#0f172a]">Urgent Cut Orders</h2>
                  {newIncomingOrders.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#d11243] text-white text-[10px] font-bold">
                      {newIncomingOrders.length} Pending
                    </span>
                  )}
                </div>

                <button
                  onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('new'); }}
                  className="text-xs font-bold text-[#d11243] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {newIncomingOrders.length === 0 ? (
                <div className="bg-white rounded-xl p-6 border border-gray-200 text-center space-y-2 text-gray-500">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-[#0f172a]">All orders prepped & up to date!</p>
                  <p className="text-[11px]">New customer orders will chime instantly here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {newIncomingOrders.slice(0, 3).map((order) => {
                    const prepMins = getOrderPrepTime(order.id);
                    return (
                      <div key={order.id} className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs space-y-3">
                        
                        {/* Order Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-xs text-[#0f172a]">
                                Order #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#d11243]" />
                                <span>Just Now</span>
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-gray-700 mt-0.5">{order.customerName}</p>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-black text-[#0f172a]">
                              ₹{(order.total || order.totalAmount || 0).toLocaleString('en-IN')}
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold">Express Courier</span>
                          </div>
                        </div>

                        {/* Butcher Specs Items Box (Figma Node: 1165:886) */}
                        <div className="bg-gray-50 rounded-lg p-2.5 space-y-1.5 border border-gray-100">
                          {(order.items || []).map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-bold text-gray-700">
                                  {it.quantity}x
                                </span>
                                <span className="font-medium text-gray-800 truncate max-w-xs">
                                  {it.name} {it.cutStyle ? `(${it.cutStyle})` : ''}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-gray-500">
                                {it.netWeight || it.unit || '500g'}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Prep Time Stepper (Figma Node: 1165:903) */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-600 uppercase">Set Preparation Time</label>
                          <div className="bg-gray-100 rounded-lg px-3 py-1 flex items-center justify-between">
                            <button
                              onClick={() => adjustOrderPrepTime(order.id, -5)}
                              className="w-7 h-7 bg-white rounded shadow-2xs font-bold text-gray-700 flex items-center justify-center hover:bg-gray-50 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold text-[#0f172a]">
                              {prepMins} Mins
                            </span>
                            <button
                              onClick={() => adjustOrderPrepTime(order.id, 5)}
                              className="w-7 h-7 bg-white rounded shadow-2xs font-bold text-gray-700 flex items-center justify-center hover:bg-gray-50 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Action Buttons (Figma Node: 1165:915) */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleAcceptOrder(order)}
                            className="flex-1 py-2.5 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            <span>Accept & Start Prep</span>
                          </button>

                          <button
                            onClick={() => handleOpenDeclineModal(order)}
                            className="px-3 py-2.5 border border-[#d11243] text-[#d11243] hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Weekly Revenue Bento Card with inline SVG Bar Chart (Figma Node: 1165:923) */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase block">
                    WEEKLY REVENUE
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black text-[#0f172a]">₹1,24,800.00</span>
                    <span className="text-[11px] font-bold text-emerald-600">+14.2%</span>
                  </div>
                </div>
                <span className="px-2 py-1 bg-gray-100 rounded-full text-[10px] font-bold text-gray-600">
                  Avg. Earning ₹485.00
                </span>
              </div>

              {/* Weekly SVG Bar Chart (Figma Node: 1165:932) */}
              <div className="space-y-1">
                <div className="h-24 w-full flex items-end justify-between gap-2 pt-4 px-2">
                  {[
                    { day: 'M', height: '40%', val: '₹14,200', active: false },
                    { day: 'T', height: '55%', val: '₹18,500', active: false },
                    { day: 'W', height: '45%', val: '₹16,000', active: false },
                    { day: 'T', height: '65%', val: '₹21,400', active: false },
                    { day: 'F', height: '75%', val: '₹24,800', active: false },
                    { day: 'S', height: '95%', val: '₹29,400', active: true },
                    { day: 'Today', height: '60%', val: '₹18,425', active: false }
                  ].map((bar, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="w-full bg-gray-100 rounded-t h-20 flex items-end justify-center p-0.5 relative">
                        <div 
                          style={{ height: bar.height }}
                          className={`w-full rounded-t transition-all duration-500 ${
                            bar.active ? 'bg-[#d11243]' : 'bg-slate-700 hover:bg-slate-900'
                          }`}
                        />
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-6 bg-black text-white text-[9px] px-1 rounded transition pointer-events-none whitespace-nowrap">
                          {bar.val}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold ${bar.active ? 'text-[#d11243]' : 'text-gray-500'}`}>
                        {bar.day}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded bg-[#d11243]" />
                    <span>Saturday Peak: ₹29,400</span>
                  </div>
                  <span>257 weekly cuts packed</span>
                </div>
              </div>
            </div>

            {/* Recent Dispatches Live Feed (Figma Node: 1165:965) */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0f172a]">Recent Dispatches</h2>
                <span className="text-[10px] font-bold text-gray-400 uppercase">Live Feed</span>
              </div>

              <div className="divide-y divide-gray-100">
                {orders.slice(0, 4).map((o, idx) => (
                  <div key={o.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                        <Bike className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#0f172a]">#{o.orderNumber || o.id.slice(-6).toUpperCase()}</span>
                          <span className="text-gray-500">• {o.customerName}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate max-w-xs">
                          {(o.items || []).map(it => it.name).join(', ') || 'Chilled Cuts'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-[#0f172a]">
                        ₹{(o.total || o.totalAmount || 0).toLocaleString('en-IN')}
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        o.lifecycleStatus === 'DELIVERED' 
                          ? 'bg-gray-100 text-gray-600'
                          : o.lifecycleStatus === 'READY_FOR_PICKUP'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {o.lifecycleStatus === 'DELIVERED' ? 'Delivered' : o.lifecycleStatus === 'READY_FOR_PICKUP' ? 'Ready to Pickup' : 'On the way'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 2: ORDERS MANAGEMENT QUEUE (Figma Nodes: 1132:2370 & 1148:488)     */}
        {/* ========================================================================= */}
        {partnerTab === 'orders' && (
          <div className="space-y-4 animate-in fade-in">
            
            {/* SLA Pulse & Audio Alert Banner (Figma Node: 1165:1184) */}
            <div className="bg-[#d11243] text-white p-3.5 rounded-xl shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Volume2 className="w-5 h-5 text-white" />
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white" />
                </div>
                <div>
                  <div className="font-black text-sm">
                    {newIncomingOrders.length} Incoming Cut Orders
                  </div>
                  <p className="text-[11px] text-rose-100 font-medium">
                    Accept within 5 mins to maintain 99% SLA
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer"
                title={soundEnabled ? 'Mute alert chime' : 'Unmute alert chime'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-white" /> : <VolumeX className="w-4 h-4 text-rose-200" />}
              </button>
            </div>

            {/* Segmented Status Tabs (Figma Node: 1165:1200) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { key: 'all', label: 'All Orders', count: orders.length },
                { key: 'new', label: 'New Orders', count: newIncomingOrders.length },
                { key: 'preparing', label: 'Preparing', count: preparingOrders.length },
                { key: 'ready', label: 'Ready', count: readyOrders.length },
                { key: 'pickedup', label: 'Picked up', count: pickedUpOrders.length }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setOrderSegmentTab(tab.key as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    orderSegmentTab === tab.key
                      ? 'bg-[#d11243] text-white shadow-2xs'
                      : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    orderSegmentTab === tab.key ? 'bg-white text-[#d11243]' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search & Filter Bar (Figma Node: 1165:1222) */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white rounded-full border border-gray-200 px-3.5 py-2 flex items-center gap-2 shadow-2xs">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  placeholder="Search by order ID, customer, or meat cut..."
                  className="w-full text-xs bg-transparent focus:outline-none text-[#0f172a]"
                />
                {ordersSearch && (
                  <button onClick={() => setOrdersSearch('')} className="text-gray-400 hover:text-black">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Filter Ribbon (Figma Node: 1165:1229) */}
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  onClick={() => setOrdersQuickFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                    ordersQuickFilter === 'all' ? 'bg-[#d11243] text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setOrdersQuickFilter('today')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                    ordersQuickFilter === 'today' ? 'bg-[#d11243] text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setOrdersQuickFilter('immediate')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                    ordersQuickFilter === 'immediate' ? 'bg-[#d11243] text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  Immediate Prep
                </button>
              </div>
            </div>

            {/* Orders Feed */}
            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-xl p-8 border border-gray-200 text-center space-y-2 text-gray-500">
                <Package className="w-10 h-10 text-gray-400 mx-auto" />
                <p className="text-xs font-bold text-[#0f172a]">No orders found for selected status filter.</p>
                <p className="text-[11px]">Select another tab or clear search filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const prepMins = getOrderPrepTime(order.id);
                  const isNew = (!order.lifecycleStatus || order.lifecycleStatus === 'CONFIRMED' || order.lifecycleStatus === 'PENDING') && order.status !== 'Cold Box Packed';
                  const isPreparing = order.lifecycleStatus === 'PREPARING';
                  const isReady = order.lifecycleStatus === 'READY_FOR_PICKUP' || order.status === 'Cold Box Packed';
                  const isPickedUp = order.lifecycleStatus === 'PICKED_UP' || order.lifecycleStatus === 'DELIVERED';

                  return (
                    <div 
                      key={order.id} 
                      className={`bg-white rounded-xl border relative overflow-hidden shadow-2xs transition space-y-3 ${
                        isNew ? 'border-rose-200 p-4' : isPreparing ? 'border-amber-200 p-4' : 'border-gray-200 p-4'
                      }`}
                    >
                      {/* Top Urgency Accent Bar (Figma Node: 1165:1536) */}
                      <div className={`absolute top-0 left-0 right-0 h-1 ${
                        isNew ? 'bg-[#d11243]' : isPreparing ? 'bg-amber-500' : isReady ? 'bg-emerald-500' : 'bg-gray-300'
                      }`} />

                      {/* Order Context Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-[#0f172a]">
                              Order #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              isNew ? 'bg-rose-100 text-rose-800' : isPreparing ? 'bg-amber-100 text-amber-800' : isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {order.lifecycleStatus || order.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <span className="font-semibold text-gray-800">{order.customerName}</span>
                            <span>•</span>
                            <span>{order.customerPhone || '+91 98800 00000'}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-base font-black text-[#0f172a]">
                            ₹{(order.total || order.totalAmount || 0).toLocaleString('en-IN')}
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid Online'}
                          </span>
                        </div>
                      </div>

                      {/* Items & Cuts Checklist (Figma Node: 1165:1557) */}
                      <div className="space-y-1.5">
                        {(order.items || []).map((it, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-2.5 flex items-center justify-between border border-gray-100">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded bg-gray-200 text-gray-800 text-xs font-black flex items-center justify-center shrink-0">
                                {it.quantity}x
                              </span>
                              <div>
                                <span className="font-bold text-xs text-[#0f172a] block">{it.name}</span>
                                <span className="text-[11px] text-gray-500">
                                  {it.cutStyle ? `${it.cutStyle} • ` : ''}{it.netWeight || it.unit || '500g cut'}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-gray-700">
                              ₹{(it.price * it.quantity).toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Custom Butchering Knife Spec Callout (Figma Node: 1165:1578) */}
                      <div className="bg-blue-50/70 border border-blue-200/60 rounded-lg p-2.5 flex items-start gap-2 text-xs">
                        <Scissors className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-bold text-blue-900 tracking-wider uppercase block">
                            CUSTOM BUTCHER KNIFE SPEC
                          </span>
                          <span className="font-medium text-blue-950">
                            "Thick cut, bone trimmed, 0°C to 4°C chilled dry tray"
                          </span>
                        </div>
                      </div>

                      {/* Assigned Rider Info (when rider is assigned by automated dispatch) */}
                      {order.assignedRider && (
                        <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-lg p-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                              <Bike className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-emerald-950">
                                  {order.assignedRider.fullName || order.assignedRider.firstName}
                                </span>
                                <span className="text-[9px] font-black bg-emerald-200 text-emerald-900 px-1 rounded">
                                  ID VERIFIED
                                </span>
                              </div>
                              <span className="text-[11px] text-emerald-800">
                                {order.assignedRider.vehicle} • ETA {order.assignedRider.estimatedArrival}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-gray-500 block">Handover PIN</span>
                            <span className="font-mono font-bold text-xs text-gray-900 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                              {order.deliveryPin || '8941'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Action Toolbar by Lifecycle State */}
                      <div className="pt-1 flex items-center justify-between gap-2">
                        
                        {/* If New Order: Accept or Decline with Prep Timer */}
                        {isNew && (
                          <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase">Prep Time:</span>
                              <div className="bg-gray-100 rounded-lg px-2 py-1 flex items-center gap-2">
                                <button
                                  onClick={() => adjustOrderPrepTime(order.id, -5)}
                                  className="w-5 h-5 bg-white rounded shadow-2xs font-bold text-gray-700 flex items-center justify-center hover:bg-gray-50 cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="text-xs font-bold text-[#0f172a] min-w-12 text-center">
                                  {prepMins} Mins
                                </span>
                                <button
                                  onClick={() => adjustOrderPrepTime(order.id, 5)}
                                  className="w-5 h-5 bg-white rounded shadow-2xs font-bold text-gray-700 flex items-center justify-center hover:bg-gray-50 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenDeclineModal(order)}
                                className="px-3 py-2 border border-[#d11243] text-[#d11243] hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer"
                              >
                                Decline
                              </button>

                              <button
                                onClick={() => handleAcceptOrder(order)}
                                className="flex-1 sm:flex-none px-4 py-2 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                              >
                                <Scissors className="w-3.5 h-3.5" />
                                <span>Accept & Start Prep</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* If Preparing: Open Scale Tare Terminal or Mark Ready */}
                        {isPreparing && (
                          <div className="w-full flex items-center justify-between gap-2">
                            <button
                              onClick={() => handleStartButchering(order)}
                              className="px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                            >
                              <Scale className="w-3.5 h-3.5 text-amber-400" />
                              <span>Open Prep & Scale Tare Terminal</span>
                            </button>

                            <button
                              onClick={async () => {
                                const updated = await api.updatePartnerOrderStatus(order.id, {
                                  status: 'Cold Box Packed',
                                  lifecycleStatus: 'READY_FOR_PICKUP'
                                });
                                setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
                                playButcherChime();
                                showNotification(`✓ Order #${order.orderNumber || order.id.slice(-6).toUpperCase()} marked Ready for Courier!`);
                              }}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                            >
                              Order Ready
                            </button>
                          </div>
                        )}

                        {/* If Ready: Handover to Courier Button */}
                        {isReady && (
                          <div className="w-full flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Packed & Sealed in Cold Box</span>
                            </div>

                            <button
                              onClick={() => handleOpenHandoverModal(order)}
                              className="px-4 py-2 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5"
                            >
                              <Bike className="w-3.5 h-3.5" />
                              <span>Handover to Courier</span>
                            </button>
                          </div>
                        )}

                        {/* If Picked Up: Dispatched info */}
                        {isPickedUp && (
                          <div className="w-full flex items-center justify-between text-xs text-gray-500">
                            <div className="flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-emerald-600" />
                              <span>In Transit to Customer with Insulated Cold Box</span>
                            </div>
                            <span className="font-bold text-gray-700">Dispatched</span>
                          </div>
                        )}

                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 3: PRODUCT INVENTORY LIST (Figma Frame: nodeId=1132:5413)          */}
        {/* ========================================================================= */}
        {partnerTab === 'inventory' && (
          <div className="space-y-4 animate-in fade-in">
            
            {/* Search & Filter Header */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex-1 bg-white rounded-full border border-gray-200 px-3.5 py-2 flex items-center gap-2 shadow-2xs">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  placeholder="Search cuts, steaks, fillets, poultry..."
                  className="w-full text-xs bg-transparent focus:outline-none text-[#0f172a]"
                />
                {inventorySearch && (
                  <button onClick={() => setInventorySearch('')} className="text-gray-400 hover:text-black">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddProductModal(true)}
                  className="px-3 py-2 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Cut</span>
                </button>
              </div>
            </div>

            {/* Category Navigation Pills (Figma Node: 1165:2230) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { name: 'All', count: products.length },
                { name: 'Beef & Steaks', count: products.filter(p => p.category === 'Beef & Steaks').length || 18 },
                { name: 'Mutton & Lamb', count: products.filter(p => p.category === 'Mutton & Lamb').length || 12 },
                { name: 'Chicken & Poultry', count: products.filter(p => p.category === 'Chicken & Poultry').length || 16 },
                { name: 'Fish & Seafood', count: products.filter(p => p.category === 'Fish & Seafood').length || 10 },
                { name: 'Eggs', count: products.filter(p => p.category === 'Eggs').length || 8 }
              ].map(cat => (
                <button
                  key={cat.name}
                  onClick={() => setInventoryCategory(cat.name)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    inventoryCategory === cat.name
                      ? 'bg-[#d11243] text-white shadow-2xs'
                      : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    inventoryCategory === cat.name ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Sort & Status Secondary Bar (Figma Node: 1165:1906) */}
            <div className="flex items-center justify-between text-xs text-gray-600 pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInventorySort(prev => prev === 'low_stock' ? 'price' : 'low_stock')}
                  className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 font-bold flex items-center gap-1 hover:border-gray-300 cursor-pointer"
                >
                  <span>Sort: {inventorySort === 'low_stock' ? 'Stock: Low to High' : 'Price: High to Low'}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setInventoryStockFilter(prev => prev === 'all' ? 'out_of_stock' : prev === 'out_of_stock' ? 'in_stock' : 'all')}
                  className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 font-bold flex items-center gap-1 hover:border-gray-300 cursor-pointer"
                >
                  <span>Status: {inventoryStockFilter === 'all' ? 'All Statuses' : inventoryStockFilter === 'out_of_stock' ? 'Out of Stock' : 'In Stock'}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className="text-[11px] font-medium text-gray-500">
                {filteredProducts.length} Cuts Active
              </span>
            </div>

            {/* Product Inventory Cards (Figma Nodes: 1165:1922, 1165:1978) */}
            <div className="space-y-3">
              {filteredProducts.map((prod) => {
                const isOutOfStock = (prod.stock || 0) <= 0;
                const isLowStock = !isOutOfStock && (prod.stock || 0) < 10;
                const skuCode = `SKU #${prod.category.slice(0, 2).toUpperCase()}-${prod.id.slice(-4).toUpperCase()}`;

                return (
                  <div 
                    key={prod.id} 
                    className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs relative overflow-hidden space-y-3"
                  >
                    {/* Visual Status Indicator Bar on Edge (Figma Node: 1165:1923, 1165:1979) */}
                    <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                      isOutOfStock ? 'bg-[#ba1a1a]' : isLowStock ? 'bg-[#f59e0b]' : 'bg-[#16a34a]'
                    }`} />

                    <div className="flex gap-3 pl-1">
                      {/* Product Thumbnail */}
                      <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden relative shrink-0 border border-gray-100">
                        <img 
                          src={prod.imageUrl || prod.image || 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&q=80'} 
                          alt={prod.name} 
                          className="w-full h-full object-cover"
                        />
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="px-1.5 py-0.5 rounded bg-[#ba1a1a] text-white text-[9px] font-black uppercase">
                              Sold Out
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
                            {skuCode}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              0°C to 4°C Fresh
                            </span>
                          </div>
                        </div>

                        <h3 className="font-bold text-sm text-[#0f172a] truncate">{prod.name}</h3>
                        <p className="text-[11px] text-gray-500 truncate">{prod.category} • {prod.cutStyle || 'Master Cut'}</p>

                        <div className="flex items-baseline gap-1 text-sm font-black text-[#d11243]">
                          <span>₹{prod.price}</span>
                          <span className="text-[10px] font-normal text-gray-500">/ {prod.unit || 'kg'}</span>
                          {prod.mrp && prod.mrp > prod.price && (
                            <span className="text-[10px] text-gray-400 line-through ml-1">₹{prod.mrp}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Badges & Status Strip (Figma Node: 1165:1946) */}
                    <div className="bg-gray-50 rounded-lg p-2.5 flex items-center justify-between border border-gray-100">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-black text-[#0f172a]">{prod.stock || 0}</span>
                          <span className="text-xs font-semibold text-gray-600">kg available</span>
                        </div>
                        {isOutOfStock ? (
                          <span className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Sold out at physical station</span>
                          </span>
                        ) : isLowStock ? (
                          <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Low Stock • Min 5.0 kg</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Healthy Stock Reserve</span>
                          </span>
                        )}
                      </div>

                      {/* Master Active Switch (Frame 114 style) */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStock(prod)}
                          title="Toggle store listing on/off"
                          className={`w-11 h-6 flex items-center rounded-full p-0.5 transition duration-300 cursor-pointer ${
                            (prod.stock || 0) > 0 ? 'bg-emerald-600 justify-end' : 'bg-gray-300 justify-start'
                          }`}
                        >
                          <div className="bg-white w-5 h-5 rounded-full shadow-md" />
                        </button>
                      </div>
                    </div>

                    {/* Tactile Stock Increment/Decrement Quick Bar (Figma Node: 1165:1965) */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-semibold text-gray-600">Quick Adjust Stock</span>
                      
                      <div className="bg-gray-100 rounded-xl p-1 flex items-center gap-2">
                        <button
                          disabled={adjustingStockId === prod.id || (prod.stock || 0) <= 0}
                          onClick={() => handleQuickAdjustStock(prod, -0.5)}
                          className="w-8 h-8 bg-white hover:bg-gray-50 rounded-lg shadow-2xs font-bold text-gray-800 flex items-center justify-center transition cursor-pointer disabled:opacity-40"
                          title="Decrease stock by 0.5kg"
                        >
                          -
                        </button>

                        <span className="text-xs font-black text-[#0f172a] min-w-16 text-center">
                          {adjustingStockId === prod.id ? '...' : `${prod.stock || 0} kg`}
                        </span>

                        <button
                          disabled={adjustingStockId === prod.id}
                          onClick={() => handleQuickAdjustStock(prod, 0.5)}
                          className="w-8 h-8 bg-white hover:bg-gray-50 rounded-lg shadow-2xs font-bold text-gray-800 flex items-center justify-center transition cursor-pointer disabled:opacity-40"
                          title="Increase stock by 0.5kg"
                        >
                          +
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 4: EARNINGS DASHBOARD (Figma Frame: nodeId=1132:7842)              */}
        {/* ========================================================================= */}
        {partnerTab === 'earnings' && (
          <div className="space-y-4 animate-in fade-in">
            
            {/* Time Period Tabs (Figma Node: 1165:2543) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { key: 'week', label: 'This Week' },
                { key: 'today', label: 'Today' },
                { key: 'month', label: 'This Month' },
                { key: 'custom', label: 'Custom Range' }
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setEarningsPeriod(t.key as any)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition cursor-pointer shrink-0 ${
                    earningsPeriod === t.key
                      ? 'bg-[#d11243] text-white shadow-2xs'
                      : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Next Settlement Alert Banner (Figma Node: 1165:2557) */}
            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl shadow-2xs flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-bold text-emerald-800 tracking-wider uppercase block">
                  NEXT SETTLEMENT PAYOUT
                </span>
                <p className="text-xs font-bold text-emerald-950">
                  Tomorrow, 6:00 AM • HDFC Bank <span className="font-mono">****4921</span>
                </p>
              </div>
              <span className="text-[10px] font-bold bg-white text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
                Auto Direct Deposit
              </span>
            </div>

            {/* Hero Financial Card (Figma Node: 1165:2567) */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500">Available Balance</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <span>Ready for Payout</span>
                  </span>
                </div>
                <div className="text-3xl font-black text-[#0f172a] tracking-tight">
                  ₹{netPayout > 0 ? (netPayout * 2.8).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '48,650.00'}
                </div>
              </div>

              {/* Instant Transfer CTA (Figma Node: 1165:2580) */}
              <div className="space-y-2">
                <button
                  onClick={() => showNotification('✓ Instant settlement initiated to registered HDFC Account ****4921!')}
                  className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Instant Transfer to Bank</span>
                </button>

                <button
                  onClick={() => showNotification('Opening settlement and tax ledger...')}
                  className="w-full py-2.5 border border-[#d11243] text-[#d11243] hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>View All Past Payouts & History</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Sub-metrics Row (Figma Node: 1165:2585) */}
              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 border border-gray-100 text-center">
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase block">Today's Gross</span>
                  <span className="text-xs font-black text-[#0f172a]">
                    ₹{todayTotalRevenue > 0 ? todayTotalRevenue.toLocaleString('en-IN') : '8,420'}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block">+14.2%</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase block">Weekly Volume</span>
                  <span className="text-xs font-black text-[#0f172a]">₹48,650</span>
                  <span className="text-[10px] text-gray-500 block">38 orders</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase block">Avg Order</span>
                  <span className="text-xs font-black text-[#0f172a]">₹1,280</span>
                  <span className="text-[10px] text-emerald-600 font-bold block">Top 5%</span>
                </div>
              </div>
            </div>

            {/* Weekly SVG Revenue Bar Chart */}
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">
                Daily Payout Breakdown
              </h3>
              
              <div className="divide-y divide-gray-100 text-xs">
                {[
                  { date: 'Yesterday, 17 Nov', orders: 34, payout: '₹14,920.00', status: 'SETTLED' },
                  { date: 'Sunday, 16 Nov', orders: 48, payout: '₹22,140.00', status: 'SETTLED' },
                  { date: 'Saturday, 15 Nov', orders: 52, payout: '₹26,890.00', status: 'SETTLED' },
                  { date: 'Friday, 14 Nov', orders: 28, payout: '₹12,450.00', status: 'SETTLED' }
                ].map((row, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#0f172a] block">{row.date}</span>
                      <span className="text-[11px] text-gray-500">{row.orders} cuts fulfilled</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#0f172a] block">{row.payout}</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black">
                        {row.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 5: STATION TARE & CALIBRATION CENTER                                */}
        {/* ========================================================================= */}
        {partnerTab === 'station' && (
          <div className="space-y-4 animate-in fade-in">
            
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#0f172a]">Station Calibration Center</h2>
                  <p className="text-xs text-gray-500">Digital Weighing Scale, Cold Chain Telemetry & Carcass Yield</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <Scale className="w-5 h-5" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => setShowScaleModal(true)}
                  className="p-4 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-left transition cursor-pointer space-y-1"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
                    <Scale className="w-4 h-4 text-emerald-600" />
                    <span>Calibrate Bench Scale Tare</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Connect USB/RS-232 scale via Web Serial or operate with Calibrated Zero Tare mode.
                  </p>
                </button>

                <button
                  onClick={() => setShowYieldCalculator(true)}
                  className="p-4 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-left transition cursor-pointer space-y-1"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0f172a]">
                    <Percent className="w-4 h-4 text-amber-600" />
                    <span>Carcass Yield & Dressing Loss</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Log gross vs dressed cut weights for operational waste auditing and margin tracking.
                  </p>
                </button>
              </div>

              {/* Station Credentials */}
              <div className="pt-3 border-t border-gray-100 space-y-2 text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Station License ID:</span>
                  <span className="font-mono font-bold text-[#0f172a]">{user.shopId || 'STATION-HYD-417'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">FSSAI Number:</span>
                  <span className="font-mono text-emerald-700 font-bold">{user.fssaiNumber || '11224330000491'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Cold Chain Storage:</span>
                  <span className="text-emerald-700 font-bold">0°C to 4°C Blast Chilled</span>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* ========================================================================= */}
      {/* RESPONSIVE BOTTOM NAVIGATION DOCK (Figma Node: 1167:857)                   */}
      {/* ========================================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-lg px-2 py-2 flex items-center justify-around md:hidden">
        
        <button
          onClick={() => setPartnerTab('dashboard')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition ${
            partnerTab === 'dashboard' ? 'text-[#d11243]' : 'text-gray-500 hover:text-black'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span className="text-[10px] font-bold">Home</span>
        </button>

        <button
          onClick={() => { setPartnerTab('orders'); setOrderSegmentTab('all'); }}
          className={`flex flex-col items-center gap-1 cursor-pointer relative transition ${
            partnerTab === 'orders' ? 'text-[#d11243]' : 'text-gray-500 hover:text-black'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[10px] font-bold">Orders</span>
          {newIncomingOrders.length > 0 && (
            <span className="absolute -top-1 -right-2 bg-[#d11243] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
              {newIncomingOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setPartnerTab('inventory')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition ${
            partnerTab === 'inventory' ? 'text-[#d11243]' : 'text-gray-500 hover:text-black'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] font-bold">Inventory</span>
        </button>

        <button
          onClick={() => setPartnerTab('earnings')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition ${
            partnerTab === 'earnings' ? 'text-[#d11243]' : 'text-gray-500 hover:text-black'
          }`}
        >
          <DollarSign className="w-5 h-5" />
          <span className="text-[10px] font-bold">Earnings</span>
        </button>

        <button
          onClick={() => setPartnerTab('station')}
          className={`flex flex-col items-center gap-1 cursor-pointer transition ${
            partnerTab === 'station' ? 'text-[#d11243]' : 'text-gray-500 hover:text-black'
          }`}
        >
          <Wrench className="w-5 h-5" />
          <span className="text-[10px] font-bold">Station</span>
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* MODAL 1: DECLINE ORDER CONFIRMATION (Figma Frame: nodeId=1132:2937)       */}
      {/* ========================================================================= */}
      {declineOrderTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 border border-gray-100 max-h-[90vh] overflow-y-auto">
            
            {/* Top Tactile Drag Pill (Figma Node: 1132:2938) */}
            <div className="flex justify-center pb-1">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </div>

            {/* Modal Header */}
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-[#d11243] flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-base text-[#0f172a]">
                    Decline Order #{declineOrderTarget.orderNumber || declineOrderTarget.id.slice(-6).toUpperCase()}?
                  </h3>
                  <button 
                    onClick={() => setDeclineOrderTarget(null)}
                    className="text-gray-400 hover:text-gray-700 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Declining impacts your <strong className="text-gray-800">98.4% SLA</strong> rating. Select verified reason:
                </p>
              </div>
            </div>

            {/* Scrollable Operational Reasons Form (Figma Node: 1132:2954) */}
            <div className="space-y-2 text-xs">
              
              {/* Option 1: Out of Stock */}
              <label 
                onClick={() => setDeclineReason('out_of_stock')}
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                  declineReason === 'out_of_stock'
                    ? 'bg-rose-50 border-[#d11243]'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <input 
                  type="radio" 
                  name="decline" 
                  checked={declineReason === 'out_of_stock'} 
                  onChange={() => setDeclineReason('out_of_stock')}
                  className="mt-0.5 text-[#d11243]" 
                />
                <div>
                  <div className="font-bold text-[#0f172a]">Out of Stock</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Specific meat cut sold out at physical butcher station counter.
                  </p>
                </div>
              </label>

              {/* Option 2: Digital Scale / Equipment Offline */}
              <label 
                onClick={() => setDeclineReason('scale_offline')}
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                  declineReason === 'scale_offline'
                    ? 'bg-rose-50 border-[#d11243]'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <input 
                  type="radio" 
                  name="decline" 
                  checked={declineReason === 'scale_offline'} 
                  onChange={() => setDeclineReason('scale_offline')}
                  className="mt-0.5 text-[#d11243]" 
                />
                <div>
                  <div className="font-bold text-[#0f172a]">Digital Scale / Equipment Offline</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Scale calibration or refrigeration cold chain sensor maintenance.
                  </p>
                </div>
              </label>

              {/* Option 3: Orders May Not Be Ready on Time */}
              <label 
                onClick={() => setDeclineReason('rush_hour')}
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                  declineReason === 'rush_hour'
                    ? 'bg-rose-50 border-[#d11243]'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <input 
                  type="radio" 
                  name="decline" 
                  checked={declineReason === 'rush_hour'} 
                  onChange={() => setDeclineReason('rush_hour')}
                  className="mt-0.5 text-[#d11243]" 
                />
                <div>
                  <div className="font-bold text-[#0f172a] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Peak Load Queue Backlog</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Station cutting load exceeds courier SLA turnaround timeline.
                  </p>
                </div>
              </label>

              {/* Option 4: Other */}
              <label 
                onClick={() => setDeclineReason('other')}
                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                  declineReason === 'other'
                    ? 'bg-rose-50 border-[#d11243]'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <input 
                  type="radio" 
                  name="decline" 
                  checked={declineReason === 'other'} 
                  onChange={() => setDeclineReason('other')}
                  className="mt-0.5 text-[#d11243]" 
                />
                <div className="flex-1">
                  <div className="font-bold text-[#0f172a]">Operational Pause / Other</div>
                  {declineReason === 'other' && (
                    <input
                      type="text"
                      value={customDeclineText}
                      onChange={(e) => setCustomDeclineText(e.target.value)}
                      placeholder="Specify reason..."
                      className="mt-1.5 w-full px-2 py-1 bg-white border border-gray-300 rounded text-xs focus:outline-none"
                    />
                  )}
                </div>
              </label>
            </div>

            {/* SLA Warning Card (Figma Node: 1132:3004) */}
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-xs text-rose-900">
              <AlertCircle className="w-4 h-4 text-[#d11243] shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">WARNING: </strong>
                <span>3 declines within 1 hour will trigger temporary store auto-pause for 30 minutes.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeclineOrderTarget(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Keep Order
              </button>

              <button
                onClick={handleConfirmDecline}
                className="flex-1 py-2.5 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs"
              >
                Confirm Decline
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: HANDOVER TO DELIVERY PARTNER (Figma Frame: nodeId=1132:4282)     */}
      {/* ========================================================================= */}
      {handoverTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 border border-gray-100 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                  READY FOR DISPATCH
                </span>
                <span className="text-xs font-semibold text-gray-500">Packed & Sealed</span>
              </div>
              <button onClick={() => setHandoverTarget(null)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Context */}
            <div className="space-y-1">
              <h3 className="font-black text-lg text-[#0f172a]">
                Order #{handoverTarget.orderNumber || handoverTarget.id.slice(-6).toUpperCase()}
              </h3>
              <p className="text-xs text-gray-600">
                Customer: <strong className="text-black">{handoverTarget.customerName}</strong> ({handoverTarget.items.length} cuts prepped)
              </p>
            </div>

            {/* Courier Verification Card (Figma Node: 1132:4308) */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0f172a]">Assigned Courier Partner</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                  ID CONFIRMED
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[#d11243] text-white flex items-center justify-center font-black text-xl shrink-0 shadow-sm">
                  {handoverTarget.assignedRider?.fullName ? handoverTarget.assignedRider.fullName[0] : 'S'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm text-[#0f172a] truncate">
                    {handoverTarget.assignedRider?.fullName || handoverTarget.assignedRider?.firstName || 'Suresh Patil'}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {handoverTarget.assignedRider?.vehicle || 'Ather 450X (KA-04-EV-819)'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                      4.98 Rating
                    </span>
                    <span className="text-[10px] text-gray-500">• 1,420 Deliveries</span>
                  </div>
                </div>

                <a 
                  href={`tel:${handoverTarget.assignedRider?.maskedPhone || '9880000000'}`}
                  className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:text-black shadow-2xs"
                  title="Call Courier Partner"
                >
                  <Phone className="w-4 h-4" />
                </a>
              </div>

              {/* Hardware & Cold Bag Check Info */}
              <div className="bg-white rounded-xl p-2.5 border border-gray-200 text-xs space-y-1">
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Approved for Safe Cold Delivery (0°C to 4°C Chilled)</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Insulated carrier bag certified with temperature retention seal.
                </p>
              </div>
            </div>

            {/* Handover Verification PIN */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Enter Rider Handover PIN</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={4}
                  value={handoverPinInput}
                  onChange={(e) => setHandoverPinInput(e.target.value)}
                  placeholder="e.g. 8941"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-center font-mono font-bold text-base tracking-widest text-[#0f172a] focus:outline-none focus:border-[#d11243]"
                />
                <button
                  type="button"
                  onClick={() => setHandoverPinInput(handoverTarget.deliveryPin || '8941')}
                  className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Auto-Fill PIN
                </button>
              </div>
            </div>

            {/* Confirm Handover Button */}
            <button
              disabled={isSubmittingHandover}
              onClick={handleConfirmHandover}
              className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmittingHandover ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bike className="w-4 h-4" />}
              <span>Verify & Complete Handover</span>
            </button>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: KDS ACTIVE BUTCHER PREP & SCALE TARE TERMINAL                    */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white text-[#0f172a] w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#d11243] flex items-center justify-center text-white font-black">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0f172a]">
                    Master Butcher Prep Station
                  </h3>
                  <span className="text-xs text-gray-400">
                    Order #{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()} • {selectedOrder.customerName}
                  </span>
                </div>
              </div>

              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Digital Scale Load-Cell Display */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  DIGITAL SCALE BENCH TARE
                </span>
                <div className="flex items-baseline gap-2 justify-center sm:justify-start">
                  <span className="text-4xl font-mono font-black text-[#0f172a]">
                    {weighedGrams}g
                  </span>
                  <span className="text-xs text-gray-400 font-bold">/ Target: {targetGrams}g</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className={isWithinTolerance ? 'text-emerald-400' : 'text-rose-400'}>
                    {weightDiff >= 0 ? `+${weightDiff}g` : `${weightDiff}g`} ({weightPercent}%)
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className={isWithinTolerance ? 'text-emerald-400' : 'text-rose-400'}>
                    {isWithinTolerance ? 'Within ±5% Tolerance' : 'Exceeds ±5% Variance'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWeighedGrams(targetGrams)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Zero / Calibrated Tare
                </button>
                <button
                  onClick={toggleScaleSimulation}
                  className="px-3 py-2 bg-emerald-950/80 border border-emerald-700 text-emerald-300 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {isSimulatingStream ? 'Pause Load' : 'Live Stream'}
                </button>
              </div>
            </div>

            {/* Multi-Item Line Checklist */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-300">Items Cut Checklist</span>
              <div className="space-y-2">
                {lineItemChecklist.map((it, idx) => (
                  <div 
                    key={idx}
                    onClick={() => handleToggleItemCheck(idx)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      it.isDone ? 'bg-emerald-950/40 border-emerald-800' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {it.isDone ? (
                        <CheckSquare className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-500 shrink-0" />
                      )}
                      <div>
                        <span className={`text-xs font-bold block ${it.isDone ? 'text-emerald-200 line-through' : 'text-white'}`}>
                          {it.quantity}x {it.name}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {it.cutStyle} • Target: {it.targetGrams}g • Weighed: {it.weighedGrams}g
                        </span>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      it.isDone ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-gray-400'
                    }`}>
                      {it.isDone ? 'CUT & TARE DONE' : 'PENDING'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fresh Seal & Cold Box ID */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-gray-400 block text-[10px] font-bold uppercase">COLD BOX RFID</span>
                <span className="font-mono text-white font-bold text-sm">{coldBoxId}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-gray-400 block text-[10px] font-bold uppercase">TAMPER FRESH SEAL</span>
                <span className="font-mono text-emerald-400 font-bold text-sm">{freshSealTag}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowThermalLabelModal(true)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Thermal ESC/POS Label</span>
              </button>

              <button
                disabled={isPacking}
                onClick={handleCompletePrep}
                className="flex-1 py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPacking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Seal Cold Box & Mark Ready</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: SCALE SETUP MODAL (Industrial COM Port + Calibrated Bench Mode)  */}
      {/* ========================================================================= */}
      {showScaleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white text-[#0f172a] w-full max-w-md rounded-2xl p-5 shadow-2xl border border-gray-200 space-y-4">
            
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-sm text-[#0f172a]">Digital Scale Station Setup</h3>
              </div>
              <button onClick={() => setShowScaleModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                <span className="font-bold text-emerald-950 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Calibrated Bench Tare (Default Mode Active)</span>
                </span>
                <p className="text-[11px] text-emerald-800">
                  Station operating with pre-calibrated zero tare and ±5% certified culinary tolerance.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0f172a]">Physical Hardware Scale (COM Port)</span>
                  <span className="text-[10px] text-gray-500">9600 Baud</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Connect physical USB/RS-232 industrial scale (Avery Berkel, Essae, CAS, Metler Toledo) via Web Serial API.
                </p>
                <button
                  onClick={connectHardwareScale}
                  className="w-full py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Select COM Port / USB Device
                </button>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#0f172a] block">Digital Scale Test Feed</span>
                  <span className="text-[11px] text-gray-500">Live tare calibration feed (±2g tolerance)</span>
                </div>
                <button
                  onClick={toggleScaleSimulation}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                    isSimulatingStream ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {isSimulatingStream ? 'Stop Feed' : 'Start Feed'}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowScaleModal(false)}
              className="w-full py-2.5 bg-[#d11243] text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-[#b80f3b] transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: CARCASS YIELD & DRESSING LOSS CALCULATOR                          */}
      {/* ========================================================================= */}
      {showYieldCalculator && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white text-[#0f172a] w-full max-w-md rounded-2xl p-5 shadow-2xl border border-gray-200 space-y-4">
            
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-sm text-[#0f172a]">Carcass Yield & Waste Calculator</h3>
              </div>
              <button onClick={() => setShowYieldCalculator(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-600 font-bold block mb-1">Gross Carcass (g)</label>
                  <input
                    type="number"
                    value={grossCarcassGrams}
                    onChange={(e) => setGrossCarcassGrams(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-gray-600 font-bold block mb-1">Dressed Yield (g)</label>
                  <input
                    type="number"
                    value={dressedCarcassGrams}
                    onChange={(e) => setDressedCarcassGrams(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 grid grid-cols-2 gap-2 text-center">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase font-bold block">Usable Yield</span>
                  <span className="text-lg font-black text-emerald-700">{yieldPercent}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 uppercase font-bold block">Dressing Loss</span>
                  <span className="text-lg font-black text-[#d11243]">{dressingLossPercent}% ({lossGrams}g)</span>
                </div>
              </div>

              <button
                onClick={handleSaveYieldLog}
                className="w-full py-2.5 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Log Operational Waste
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: THERMAL LABEL GENERATOR                                          */}
      {/* ========================================================================= */}
      {showThermalLabelModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white text-black w-full max-w-xs rounded-2xl p-5 shadow-2xl border border-gray-200 space-y-3 font-mono text-xs">
            
            <div className="text-center border-b pb-2">
              <h4 className="font-black text-sm uppercase">GOMEAT ARTISANAL CUTS</h4>
              <p className="text-[10px] text-gray-600">0°C to 4°C Blast Chilled Chain</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>ORDER:</span>
                <span className="font-bold">#{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>CUT TARE:</span>
                <span className="font-bold">{weighedGrams}g</span>
              </div>
              <div className="flex justify-between">
                <span>BOX RFID:</span>
                <span>{coldBoxId}</span>
              </div>
              <div className="flex justify-between">
                <span>SEAL:</span>
                <span>{freshSealTag}</span>
              </div>
            </div>

            <div className="py-2 text-center border-t border-b">
              <div className="text-lg font-bold tracking-widest">||| | || |||| | |||</div>
              <span className="text-[9px] text-gray-500">SCAN TO VERIFY CHILLED CHAIN</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handlePrintThermalLabel}
                className="flex-1 py-2 bg-black text-white font-bold rounded-lg text-xs cursor-pointer hover:bg-gray-800"
              >
                Print 58mm
              </button>
              <button
                onClick={() => setShowThermalLabelModal(false)}
                className="px-3 py-2 bg-gray-200 text-gray-800 font-bold rounded-lg text-xs cursor-pointer hover:bg-gray-300"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: ADD NEW PRODUCT MODAL                                            */}
      {/* ========================================================================= */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white text-[#0f172a] w-full max-w-md rounded-2xl p-5 shadow-2xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#d11243]" />
                <h3 className="font-extrabold text-sm text-[#0f172a]">Add Cut to Shop Catalog</h3>
              </div>
              <button onClick={() => setShowAddProductModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3 text-xs">
              <div>
                <label className="text-gray-700 font-bold block mb-1">Product Cut Name</label>
                <input
                  type="text"
                  required
                  value={newProductForm.name}
                  onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                  placeholder="e.g. Free-Range Chicken Breast Fillets"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-700 font-bold block mb-1">Category</label>
                  <select
                    value={newProductForm.category}
                    onChange={(e) => setNewProductForm({ ...newProductForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a]"
                  >
                    <option value="Chicken & Poultry">Chicken & Poultry</option>
                    <option value="Mutton & Lamb">Mutton & Lamb</option>
                    <option value="Beef & Steaks">Beef & Steaks</option>
                    <option value="Fish & Seafood">Fish & Seafood</option>
                    <option value="Eggs">Eggs</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-700 font-bold block mb-1">Price (₹ / unit)</label>
                  <input
                    type="number"
                    required
                    value={newProductForm.price}
                    onChange={(e) => setNewProductForm({ ...newProductForm, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-700 font-bold block mb-1">Cut Weight / Unit</label>
                  <input
                    type="text"
                    value={newProductForm.unit}
                    onChange={(e) => setNewProductForm({ ...newProductForm, unit: e.target.value })}
                    placeholder="1kg / 500g"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a]"
                  />
                </div>
                <div>
                  <label className="text-gray-700 font-bold block mb-1">Opening Stock (kg)</label>
                  <input
                    type="number"
                    value={newProductForm.stock}
                    onChange={(e) => setNewProductForm({ ...newProductForm, stock: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a]"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-700 font-bold block mb-1">Artisanal Cut Style</label>
                <input
                  type="text"
                  value={newProductForm.cutStyle}
                  onChange={(e) => setNewProductForm({ ...newProductForm, cutStyle: e.target.value })}
                  placeholder="e.g. Curry Cut / Boneless Cubes / Steaks"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-[#0f172a]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Add Cut to Inventory
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
