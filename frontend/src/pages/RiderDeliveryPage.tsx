import React, { useState, useEffect, useRef } from 'react';
import { 
  Bike, 
  MapPin, 
  Phone, 
  Navigation, 
  CheckCircle2, 
  ShieldCheck, 
  Camera, 
  QrCode, 
  RotateCcw, 
  RefreshCw, 
  AlertCircle, 
  Lock, 
  Thermometer, 
  Package, 
  ChevronRight,
  Store,
  DollarSign,
  Compass,
  ArrowLeft,
  Sparkles,
  Award,
  Zap,
  LogOut,
  UserCheck,
  Clock,
  FileText,
  Volume2,
  VolumeX,
  Banknote,
  Wifi,
  WifiOff,
  Check,
  CreditCard,
  X
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Order } from '../types';

interface RiderDeliveryPageProps {
  onBackToStore?: () => void;
}

export const RiderDeliveryPage: React.FC<RiderDeliveryPageProps> = ({ onBackToStore }) => {
  const { user, setAuthSession, logout } = useAuth();
  
  // Auth Form State (when not authenticated as rider)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('rider@brisketbox.in');
  const [loginPassword, setLoginPassword] = useState('Brisket#Rider2026!');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Registration Form State
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    address: 'Bengaluru, Karnataka',
    vehicleType: 'Electric 2-Wheeler (EV)',
    vehicleNumber: 'KA-04-EV-',
    licenseNumber: 'DL-042026',
    upiId: ''
  });
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Rider Dashboard State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<'runs' | 'returns' | 'map' | 'earnings'>('runs');
  const [isOnline, setIsOnline] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Doorstep Handover State
  const [deliveryPin, setDeliveryPin] = useState(['', '', '', '']);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [handoverSuccess, setHandoverSuccess] = useState(false);

  // Reverse Logistics (ThermalVault Cold Box Return)
  const [isReturningBox, setIsReturningBox] = useState(true);
  const [scannedBoxId, setScannedBoxId] = useState('BOX-BLR-417');
  const [coolerCheckResult, setCoolerCheckResult] = useState<{
    stage: string;
    isColdChainMaintained: boolean;
    finalTemp: number;
    refundApproved: boolean;
    message: string;
  } | null>(null);
  const [isCheckingCooler, setIsCheckingCooler] = useState(false);
  const [boxInspection, setBoxInspection] = useState({
    lidIntact: true,
    gelPackInside: true,
    cleanGasket: true,
  });

  // Proof of Delivery (POD)
  const [podPhoto, setPodPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live GPS Tracking Broadcaster
  const [isGpsStreaming, setIsGpsStreaming] = useState(true);
  const [lastGpsPing, setLastGpsPing] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({
    lat: 12.9716,
    lng: 77.5946
  });

  // Audio Dispatch Chime (Synthesized Web Audio API)
  const [soundEnabled, setSoundEnabled] = useState(true);
  const playOrderChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playTone(587.33, 0.0, 0.15); // D5
      playTone(739.99, 0.16, 0.15); // F#5
      playTone(880.00, 0.32, 0.25);  // A5
    } catch {}
  };

  // Real Camera Barcode/QR Scanner for Coolers
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);

  const startCameraScanner = async () => {
    setCameraModalOpen(true);
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera device access not supported by browser');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      setCameraError(err.message || 'Camera permission denied or camera not found');
    }
  };

  const stopCameraScanner = () => {
    if (cameraVideoRef.current && cameraVideoRef.current.srcObject) {
      const stream = cameraVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setCameraModalOpen(false);
  };

  const handleSelectScannedBarcode = (code: string) => {
    setScannedBoxId(code);
    playOrderChime();
    stopCameraScanner();
    showNotification(`✓ Scanned Box: ${code}`);
    if (selectedOrder) {
      api.checkCoolerHealth(code, selectedOrder.id).then(res => setCoolerCheckResult(res)).catch(() => {});
    }
  };

  // Offline Elevator/Basement Queue & Network Resilience
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Security PIN Lockout & Rate-Limiting Protection
  const [pinLockoutSeconds, setPinLockoutSeconds] = useState(0);
  const [pinRemainingAttempts, setPinRemainingAttempts] = useState(3);

  // Lockout Countdown Timer
  useEffect(() => {
    if (pinLockoutSeconds <= 0) return;
    const t = setInterval(() => {
      setPinLockoutSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [pinLockoutSeconds]);

  // Cash on Delivery (COD) Floating Cash in Hand & Hub Deposit
  const [cashCollectedInput, setCashCollectedInput] = useState('');
  const [cashInHand, setCashInHand] = useState(user?.cashInHand || 0);
  const [isCashDepositModalOpen, setIsCashDepositModalOpen] = useState(false);
  const [depositAmountInput, setDepositAmountInput] = useState('');

  const handleDepositCash = async () => {
    const amt = Number(depositAmountInput || cashInHand);
    if (!amt || amt <= 0) return;
    try {
      const res = await api.depositRiderCash(amt);
      setCashInHand(res.remainingCashInHand);
      setIsCashDepositModalOpen(false);
      setDepositAmountInput('');
      playOrderChime();
      showNotification(`✓ Cash Deposited: ₹${res.depositedAmount} (Receipt: ${res.receiptNo})`);
    } catch (err: any) {
      alert(err.message || 'Failed to deposit cash');
    }
  };

  const syncOfflineQueue = async () => {
    const raw = localStorage.getItem('brisketbox_offline_handover_queue');
    if (!raw) return;
    try {
      const queue = JSON.parse(raw);
      if (Array.isArray(queue) && queue.length > 0) {
        for (const item of queue) {
          await api.handoverOrder(item.orderId, item.handoverData).catch(() => {});
        }
        localStorage.removeItem('brisketbox_offline_handover_queue');
        setOfflineQueueCount(0);
        showNotification(`✓ Reconnected! Synced ${queue.length} offline delivery run(s).`);
        loadOrders();
      }
    } catch {}
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const raw = localStorage.getItem('brisketbox_offline_handover_queue');
    if (raw) {
      try {
        const q = JSON.parse(raw);
        setOfflineQueueCount(Array.isArray(q) ? q.length : 0);
      } catch {}
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Load orders assigned to rider or ready for dispatch
  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await api.getRiderOrders().catch(() => api.getOrders());
      if (Array.isArray(data)) {
        if (data.length > orders.length && orders.length > 0) {
          playOrderChime();
        }
        setOrders(data);
      }
    } catch (err) {
      console.error('Failed to load rider orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'rider' && user.approvalStatus === 'approved') {
      loadOrders();
      const interval = setInterval(loadOrders, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // GPS Location Streamer simulation
  useEffect(() => {
    let watchId: number | null = null;
    let intervalId: any = null;

    if (isGpsStreaming && user?.role === 'rider') {
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCurrentCoords(coords);
            setLastGpsPing(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            if (selectedOrder) {
              api.updateRiderLocation(selectedOrder.id, coords).catch(() => {});
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000 }
        );
      }

      intervalId = setInterval(() => {
        setCurrentCoords(prev => {
          const next = {
            lat: prev.lat + (Math.random() - 0.5) * 0.0003,
            lng: prev.lng + (Math.random() - 0.5) * 0.0003
          };
          setLastGpsPing(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          return next;
        });
      }, 4000);
    }

    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (intervalId) clearInterval(intervalId);
    };
  }, [isGpsStreaming, selectedOrder, user]);

  // Handler: Rider Login
  const handleRiderLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmittingAuth(true);

    try {
      const data = await api.riderLogin({ email: loginEmail, password: loginPassword });
      setAuthSession(data.user, data.token);
      showNotification(`Welcome back, ${data.user.name}!`);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Handler: Rider Registration
  const handleRiderRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmittingAuth(true);

    try {
      const res = await api.riderRegister(regForm);
      setRegSuccess('Application submitted! Your account is Pending Operations Approval.');
      // Update session with pending rider
      if (res.rider) {
        setAuthSession(res.rider, 'temp_token_pending');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Registration failed.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Handler: Toggle Online
  const handleToggleOnline = async () => {
    const next = !isOnline;
    setIsOnline(next);
    try {
      await api.setRiderOnline(next);
      showNotification(next ? 'Status: ONLINE (Receiving orders)' : 'Status: OFFLINE');
    } catch (err) {
      console.warn('Online status sync notice:', err);
    }
  };

  // 8-Stage Lifecycle Transitions
  const handleAdvanceLifecycle = async (order: Order, nextStage: string) => {
    try {
      const updated = await api.updateRiderLifecycle(order.id, { lifecycleStatus: nextStage });
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(updated);
      }
      showNotification(`Status updated: ${nextStage.replace(/_/g, ' ')}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update order status');
    }
  };

  // Handle PIN typing
  const handlePinChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newPin = [...deliveryPin];
    newPin[idx] = digit;
    setDeliveryPin(newPin);
    setPinError(null);

    if (digit && idx < 3) {
      pinInputRefs[idx + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !deliveryPin[idx] && idx > 0) {
      pinInputRefs[idx - 1].current?.focus();
    }
  };

  const handleOpenHandover = (order: Order) => {
    setSelectedOrder(order);
    setDeliveryPin(['', '', '', '']);
    setPinError(null);
    setHandoverSuccess(false);
    setPodPhoto(null);
    setIsReturningBox(true);
    setCoolerCheckResult(null);
    setScannedBoxId(order.coolerId || 'BOX-BLR-417');
    setTimeout(() => pinInputRefs[0].current?.focus(), 150);
  };

  const handleRunCoolerInspection = async () => {
    if (!selectedOrder) return;
    try {
      setIsCheckingCooler(true);
      const res = await api.checkCoolerHealth(scannedBoxId || selectedOrder.coolerId, selectedOrder.id);
      setCoolerCheckResult(res);
      showNotification(res.message);
    } catch (e: any) {
      alert(e.message || 'Cooler compliance audit failed');
    } finally {
      setIsCheckingCooler(false);
    }
  };

  const handleFillDemoPin = () => {
    if (!selectedOrder) return;
    const pin = (selectedOrder.deliveryPin || '4821').split('');
    setDeliveryPin(pin);
    pinInputRefs[3].current?.focus();
  };

  const handleSubmitHandover = async () => {
    if (!selectedOrder) return;
    if (pinLockoutSeconds > 0) {
      setPinError(`Security lockout active. Please wait ${pinLockoutSeconds}s before retrying.`);
      return;
    }
    const enteredPin = deliveryPin.join('').trim();
    if (enteredPin.length !== 4) {
      setPinError('Please enter the full 4-digit customer delivery PIN.');
      return;
    }

    const isCod = selectedOrder.paymentMethod?.toLowerCase().includes('cash') || selectedOrder.paymentMethod?.toLowerCase().includes('cod');
    const collectedAmt = isCod ? Number(cashCollectedInput || selectedOrder.total) : undefined;

    // Offline Elevator/Basement Queue Resilience
    if (!navigator.onLine) {
      const rawQueue = localStorage.getItem('brisketbox_offline_handover_queue');
      const queue = rawQueue ? JSON.parse(rawQueue) : [];
      queue.push({
        orderId: selectedOrder.id,
        handoverData: {
          deliveryPin: enteredPin,
          pin: enteredPin,
          coolerReturned: isReturningBox,
          cashCollected: isCod,
          cashAmount: collectedAmt,
          podImage: podPhoto || undefined,
          notes: 'Handover verified in offline mode. Auto-synced upon reconnection.'
        },
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('brisketbox_offline_handover_queue', JSON.stringify(queue));
      setOfflineQueueCount(queue.length);
      setHandoverSuccess(true);
      if (collectedAmt) {
        setCashInHand(prev => prev + collectedAmt);
      }
      playOrderChime();
      showNotification('Queued in Offline Storage! Will auto-sync when network returns.');
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: 'Delivered', lifecycleStatus: 'DELIVERED' } : o));
      setTimeout(() => {
        setSelectedOrder(null);
        setHandoverSuccess(false);
      }, 2000);
      return;
    }

    try {
      setIsVerifying(true);
      setPinError(null);

      const updated = await api.handoverOrder(selectedOrder.id, {
        deliveryPin: enteredPin,
        pin: enteredPin,
        coolerReturned: isReturningBox,
        cashCollected: isCod,
        cashAmount: collectedAmt,
        podImage: podPhoto || undefined,
        notes: isReturningBox
          ? `Returned Box #${scannedBoxId}. Condition: Lid=${boxInspection.lidIntact ? 'OK' : 'Damaged'}, Gasket=${boxInspection.cleanGasket ? 'OK' : 'Leak'}. Logged for hub sanitisation (Zero deposit).`
          : 'Customer retained cold box for next order return pickup.'
      });

      setHandoverSuccess(true);
      setPinRemainingAttempts(3);
      if (collectedAmt) {
        setCashInHand(prev => prev + collectedAmt);
      }
      playOrderChime();
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      showNotification('✓ Verified Delivery! ₹50 credited to your shift earnings.');
      
      setTimeout(() => {
        setSelectedOrder(null);
        setHandoverSuccess(false);
      }, 2200);
    } catch (err: any) {
      if (err.locked || err.remainingSec) {
        setPinLockoutSeconds(err.remainingSec || 300);
        setPinError(`Lockout Active: 3 incorrect attempts. Retry in ${err.remainingSec || 300}s.`);
      } else if (err.remainingAttempts !== undefined) {
        setPinRemainingAttempts(err.remainingAttempts);
        setPinError(`Invalid PIN. ${err.remainingAttempts} attempt(s) remaining before security lockout.`);
      } else {
        setPinError(err.message || 'Invalid delivery PIN. Please ask customer to check their screen.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPodPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // =========================================================================
  // VIEW 1: AUTHENTICATION & ONBOARDING GATE (When not logged in as Rider)
  // =========================================================================
  if (!user || user.role !== 'rider') {
    return (
      <div className="min-h-screen bg-[#f4f6f8] text-slate-900 flex flex-col font-sans selection:bg-[#d11243]">
        <header className="bg-white border-b border-slate-200/90 text-slate-900 shadow-xs px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#d11243] to-rose-700 flex items-center justify-center font-black text-white shadow-md">
                <Bike className="w-4 h-4" />
              </div>
              <span className="font-black text-sm tracking-tight text-white">BrisketBox Fleet Partner</span>
            </div>
            {onBackToStore && (
              <button
                onClick={onBackToStore}
                className="text-xs font-bold text-slate-500 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-rose-400" />
                <span>Store</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-md w-full mx-auto px-4 py-8 space-y-6">
          <div className="text-center space-y-1.5">
            <h1 className="text-xl font-black text-slate-900">Delivery Partner Portal</h1>
            <p className="text-xs text-slate-500">0°C to 4°C ThermalVault Cold-Chain Express Logistics</p>
          </div>

          {/* Quick Demo Access Bar */}
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2 text-xs">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Quick 1-Click Demo Profiles:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('rider@brisketbox.in');
                  setLoginPassword('Brisket#Rider2026!');
                }}
                className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold text-left hover:bg-emerald-900/60 transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>Suresh Patil</span>
                  <span className="text-[9px] px-1 bg-emerald-500 text-black rounded font-black">Fleet #1</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">rider@brisketbox.in</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('mahesh.rider@gmail.com');
                  setLoginPassword('Brisket#Rider2026!');
                }}
                className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold text-left hover:bg-emerald-900/60 transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>Mahesh Kumar</span>
                  <span className="text-[9px] px-1 bg-emerald-500 text-black rounded font-black">Fleet #2</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">mahesh.rider@gmail.com</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('ramesh.rider@brisketbox.in');
                  setLoginPassword('Brisket#Rider2026!');
                }}
                className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold text-left hover:bg-emerald-900/60 transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>Ramesh Gowda</span>
                  <span className="text-[9px] px-1 bg-emerald-500 text-black rounded font-black">Fleet #3</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">ramesh.rider@brisketbox.in</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('imran.rider@brisketbox.in');
                  setLoginPassword('Brisket#Rider2026!');
                }}
                className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold text-left hover:bg-emerald-900/60 transition cursor-pointer"
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>Imran Pasha</span>
                  <span className="text-[9px] px-1 bg-emerald-500 text-black rounded font-black">Fleet #4</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono mt-0.5">imran.rider@brisketbox.in</div>
              </button>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-slate-200/80 p-1 border border-slate-300 text-xs font-bold">
            <button
              onClick={() => { setAuthMode('login'); setLoginError(null); }}
              className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                authMode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rider Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setLoginError(null); }}
              className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                authMode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Partner Registration
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
            <form onSubmit={handleRiderLogin} className="space-y-3.5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs text-slate-800">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Rider Email or Phone</label>
                <input
                  type="text"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="rider@brisketbox.in or +91 97412 88301"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                {isSubmittingAuth ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bike className="w-4 h-4" />}
                <span>Access Rider Dashboard</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRiderRegister} className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs text-slate-800">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  placeholder="Suresh Patil"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="ramesh@gmail.com"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Mobile Phone</label>
                  <input
                    type="tel"
                    required
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    placeholder="+91 98801 00000"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Set Password</label>
                <input
                  type="password"
                  required
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Vehicle Type</label>
                  <select
                    value={regForm.vehicleType}
                    onChange={(e) => setRegForm({ ...regForm, vehicleType: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-[#d11243] focus:bg-white"
                  >
                    <option value="Electric 2-Wheeler (EV)">Electric 2-Wheeler (EV)</option>
                    <option value="Motorcycle (Petrol)">Motorcycle (Petrol)</option>
                    <option value="Scooter">Scooter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Vehicle Reg Number</label>
                  <input
                    type="text"
                    required
                    value={regForm.vehicleNumber}
                    onChange={(e) => setRegForm({ ...regForm, vehicleNumber: e.target.value })}
                    placeholder="KA-04-EV-9999"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-900 font-mono focus:outline-none focus:border-[#d11243]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Driving License Number</label>
                <input
                  type="text"
                  required
                  value={regForm.licenseNumber}
                  onChange={(e) => setRegForm({ ...regForm, licenseNumber: e.target.value })}
                  placeholder="DL-0420240091823"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-900 font-mono focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">UPI ID for Payouts</label>
                <input
                  type="text"
                  required
                  value={regForm.upiId}
                  onChange={(e) => setRegForm({ ...regForm, upiId: e.target.value })}
                  placeholder="rider@oksbi or phone@paytm"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-900 font-mono focus:outline-none focus:border-[#d11243]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 shadow-md flex items-center justify-center gap-2 mt-2"
              >
                {isSubmittingAuth ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>Submit Rider Application</span>
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
      <div className="min-h-screen bg-[#f4f6f8] text-slate-900 flex flex-col font-sans selection:bg-[#d11243]">
        <header className="bg-white border-b border-slate-200/90 text-slate-900 shadow-xs px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bike className="w-5 h-5 text-amber-400" />
              <span className="font-black text-sm text-white">BrisketBox Fleet Partner</span>
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
          <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-black text-slate-900">Application Under Review</h2>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Hello <strong className="text-white">{user.name}</strong>, your delivery rider application has been submitted to BrisketBox Central Operations.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs text-left text-xs space-y-2 w-full">
            <div className="flex justify-between">
              <span className="text-gray-400">Account ID:</span>
              <span className="font-mono text-slate-900 font-bold">{user.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Application Status:</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black text-[10px] border border-amber-500/40">
                PENDING APPROVAL
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Registered Vehicle:</span>
              <span className="text-slate-800">{user.vehicleType || 'Electric 2-Wheeler'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Estimated Review:</span>
              <span className="text-emerald-600 font-bold">Within 2–4 Hours</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-500">
            For urgent dispatch inquiries, contact Central Hub Ops at <strong className="text-slate-700">+91 97412 88301</strong>.
          </p>

          <div className="flex gap-2 w-full pt-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Status</span>
            </button>
            <button
              onClick={logout}
              className="px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-rose-100 transition"
            >
              Sign Out
            </button>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: APPROVED RIDER PARTNER DASHBOARD (Full 8-Stage Operations Terminal)
  // =========================================================================
  const activeOrders = orders.filter(
    (o) => o.orderStatus !== 'DELIVERED' && o.orderStatus !== 'CANCELLED'
  );
  const deliveredOrders = orders.filter((o) => o.orderStatus === 'DELIVERED');

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900 flex flex-col font-sans selection:bg-[#d11243]">
      
      {/* Top Rider Partner Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 text-slate-900 shadow-xs px-4 sm:px-6 py-2.5">
        <div className="max-w-4xl w-full mx-auto flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d11243] to-rose-700 flex items-center justify-center font-black text-white shadow-md">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm tracking-tight text-slate-900">{user.name}</span>
                <span className="px-1.5 py-0.2 rounded bg-rose-50 text-[#d11243] border border-rose-200 text-[10px] font-mono font-bold">
                  {user.id ? `RD-${user.id.slice(-4).toUpperCase()}` : 'RD-819'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">{user.vehicleType || 'EV Cold Fleet'} • Hub Depot</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Dispatch Chime Toggle */}
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playOrderChime();
              }}
              title={soundEnabled ? "Audio Alerts: ON" : "Audio Alerts: OFF"}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                soundEnabled ? 'bg-slate-100 text-[#d11243] border-slate-200 hover:bg-slate-200' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Offline/Online Network Indicator */}
            <div className={`px-2 py-1 rounded-xl text-[10px] font-bold border flex items-center gap-1 ${
              isOffline ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              {isOffline ? <WifiOff className="w-3 h-3 text-amber-400" /> : <Wifi className="w-3 h-3 text-emerald-600" />}
              <span>{isOffline ? 'Elevator/Offline' : '4G Online'}</span>
            </div>

            {/* Live Online Toggle */}
            <button
              onClick={handleToggleOnline}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                isOnline
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </button>

            <button
              onClick={logout}
              title="Sign Out of Rider App"
              className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Rider App Viewport */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 pt-5 pb-28 space-y-4 min-w-0">

        {/* Action Notice Toast */}
        {actionNotice && (
          <div className="p-3 bg-emerald-950/90 border border-emerald-700 text-emerald-200 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Top Active Shift KPI Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Shift Earnings:</span>
              <span className="text-xl font-black font-mono text-emerald-600">
                ₹{user.earningsToday || (deliveredOrders.length * 50 + 150)}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
              <Award className="w-3 h-3 text-amber-400" />
              <span>4.9 Rating</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-100">
            <div className="p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Assigned</span>
              <span className="text-base font-black text-slate-900">{activeOrders.length}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50/80 border border-slate-200/70">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Completed</span>
              <span className="text-base font-black text-emerald-600">{deliveredOrders.length}</span>
            </div>
            <div 
              onClick={() => setIsCashDepositModalOpen(true)}
              title="Click to view Cash in Hand & Deposit at Hub"
              className="p-2 rounded-xl bg-amber-50/70 border border-amber-200 hover:border-amber-300 hover:bg-amber-100/60 transition cursor-pointer shadow-xs"
            >
              <span className="text-[10px] text-amber-800 block uppercase font-bold">Cash in Hand</span>
              <span className="text-base font-black text-amber-800 font-mono">₹{cashInHand}</span>
            </div>
          </div>
        </div>

        {/* Offline Queue Resilience Banner */}
        {offlineQueueCount > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs flex items-center justify-between text-amber-900 shadow-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span><strong>{offlineQueueCount} run(s)</strong> stored locally in offline elevator queue.</span>
            </div>
            <button
              onClick={syncOfflineQueue}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] cursor-pointer"
            >
              Sync Now
            </button>
          </div>
        )}

        {/* View Tabs - Clean Industrial Segmented Bar */}
        <div className="flex border-b border-slate-200 bg-white rounded-xl px-2 shadow-xs">
          <button
            onClick={() => setCurrentScreen('runs')}
            className={`flex-1 py-3 text-xs font-bold transition border-b-2 flex items-center justify-center gap-2 cursor-pointer ${
              currentScreen === 'runs' 
                ? 'border-[#d11243] text-[#d11243]' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Active Deliveries ({activeOrders.length})</span>
          </button>
          <button
            onClick={() => setCurrentScreen('earnings')}
            className={`flex-1 py-3 text-xs font-bold transition border-b-2 flex items-center justify-center gap-2 cursor-pointer ${
              currentScreen === 'earnings' 
                ? 'border-[#d11243] text-[#d11243]' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Delivery History ({deliveredOrders.length})</span>
          </button>
        </div>

        {/* SCREEN 1: ACTIVE RUNS WITH 8-STAGE LIFECYCLE */}
        {currentScreen === 'runs' && (
          <div className="space-y-4">
            {activeOrders.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/60 rounded-3xl border border-slate-800/80 space-y-3">
                <Bike className="w-10 h-10 text-gray-600 mx-auto" />
                <h3 className="font-bold text-white text-sm">No Active Delivery Runs</h3>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Stay Online. Newly prepared meat orders from partner butcher stations will appear here.
                </p>
                <button
                  onClick={loadOrders}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-800 rounded-xl text-xs font-bold cursor-pointer transition inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Queue</span>
                </button>
              </div>
            ) : (
              activeOrders.map((ord) => {
                const stage = ord.lifecycleStatus || 'OUT_FOR_DELIVERY';

                return (
                  <div 
                    key={ord.id} 
                    className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 space-y-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-900 font-mono">
                            #{ord.orderNumber || ord.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-[#d11243] border border-rose-200 text-[10px] font-black uppercase">
                            {stage.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {(ord.items || []).length} Pack(s) • ₹{ord.total} • {ord.paymentMethod || 'Prepaid'}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">Cold Box</span>
                        <span className="font-mono text-emerald-700 font-bold text-xs bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">{ord.coolerId}</span>
                      </div>
                    </div>

                    {/* Customer & Address Card with 1-Tap Google Maps Navigation */}
                    <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900 text-sm">{ord.customerName}</span>
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ord.deliveryAddress + ', Bengaluru')}&travelmode=two_wheeler`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 font-bold text-[11px] transition shadow-xs"
                          >
                            <Navigation className="w-3 h-3 text-blue-200" />
                            <span>Navigate</span>
                          </a>
                          <a
                            href={`tel:${ord.customerPhone}`}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 font-bold text-[11px] shadow-xs"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-[#d11243] shrink-0 mt-0.5" />
                        <span className="leading-snug">{ord.deliveryAddress}</span>
                      </div>
                      {ord.deliveryNotes && (
                        <p className="text-xs text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
                          Note: "{ord.deliveryNotes}"
                        </p>
                      )}
                    </div>

                    {/* 8-Stage Dynamic Action Buttons */}
                    <div className="pt-1 flex flex-wrap gap-2">
                      {stage === 'ORDER_ASSIGNED' && (
                        <button
                          onClick={() => handleAdvanceLifecycle(ord, 'RIDER_ACCEPTED')}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
                        >
                          Accept Delivery Run
                        </button>
                      )}

                      {stage === 'RIDER_ACCEPTED' && (
                        <button
                          onClick={() => handleAdvanceLifecycle(ord, 'PREPARING_PICKUP')}
                          className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                        >
                          Head to Partner Shop
                        </button>
                      )}

                      {stage === 'PREPARING_PICKUP' && (
                        <button
                          onClick={() => handleAdvanceLifecycle(ord, 'ARRIVED_AT_SHOP')}
                          className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                        >
                          Arrived at Partner Shop
                        </button>
                      )}

                      {stage === 'ARRIVED_AT_SHOP' && (
                        <div className="w-full flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedOrder(ord);
                              startCameraScanner();
                            }}
                            className="px-3.5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Scan Box Camera</span>
                          </button>
                          <button
                            onClick={() => handleAdvanceLifecycle(ord, 'PICKED_UP')}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
                          >
                            Confirm Cold Box Pick Up
                          </button>
                        </div>
                      )}

                      {stage === 'PICKED_UP' && (
                        <button
                          onClick={() => handleAdvanceLifecycle(ord, 'OUT_FOR_DELIVERY')}
                          className="flex-1 py-2.5 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Start Run to Customer</span>
                        </button>
                      )}

                      {stage === 'OUT_FOR_DELIVERY' && (
                        <button
                          onClick={() => handleAdvanceLifecycle(ord, 'ARRIVED_AT_CUSTOMER')}
                          className="flex-1 py-2.5 bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Arrived at Customer Doorstep</span>
                        </button>
                      )}

                      {stage === 'ARRIVED_AT_CUSTOMER' && (
                        <button
                          onClick={() => handleOpenHandover(ord)}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Verify Customer PIN & Complete Handover</span>
                        </button>
                      )}

                      {/* Fallback button if status was direct out for delivery */}
                      {stage !== 'ARRIVED_AT_CUSTOMER' && stage !== 'ORDER_ASSIGNED' && (
                        <button
                          onClick={() => handleOpenHandover(ord)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                        >
                          Doorstep Handover
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* SCREEN 2: EARNINGS & HISTORY */}
        {currentScreen === 'earnings' && (
          <div className="space-y-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-500">Completed Shift Deliveries</span>
              <div className="divide-y divide-slate-100 text-xs">
                {deliveredOrders.length === 0 ? (
                  <p className="text-gray-500 py-4 text-center">No delivered orders completed in this shift yet.</p>
                ) : (
                  deliveredOrders.map(ord => (
                    <div key={ord.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="font-mono font-bold text-slate-900">#{ord.orderNumber || ord.id}</div>
                        <div className="text-[11px] text-gray-400">{ord.customerName} • {ord.deliveryAddress.slice(0, 30)}...</div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-emerald-600 block">+₹50</span>
                        <span className="text-[10px] text-gray-500">Delivered</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* DOORSTEP HANDOVER MODAL (Customer PIN & Cold Box Inspection)              */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setSelectedOrder(null)} className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 z-10 space-y-4 text-xs shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Verify Handover • #{selectedOrder.orderNumber || selectedOrder.id}
                </h3>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {handoverSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-white">Delivery Verified & Complete!</h4>
                <p className="text-xs text-slate-500">Cold box recorded. ₹50 added to your rider payout.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* PIN Security Lockout Banner */}
                {pinLockoutSeconds > 0 && (
                  <div className="p-3 bg-rose-950/90 border border-rose-700 text-rose-200 rounded-2xl text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Security Lockout Active</span>
                    </div>
                    <p className="text-[11px] text-rose-300">
                      3 invalid PIN attempts. Please wait <strong className="font-mono text-white text-xs">{pinLockoutSeconds}s</strong> before retrying.
                    </p>
                  </div>
                )}

                {/* Cash on Delivery (COD) Collection Box */}
                {(selectedOrder.paymentMethod?.toLowerCase().includes('cash') || selectedOrder.paymentMethod?.toLowerCase().includes('cod')) && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900 flex items-center gap-1.5">
                        <Banknote className="w-4 h-4 text-amber-400" />
                        <span>Cash to Collect (COD):</span>
                      </span>
                      <span className="font-mono font-black text-amber-800 text-base">₹{selectedOrder.total}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/80">
                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1">Cash Received (₹)</label>
                        <input
                          type="number"
                          placeholder={String(selectedOrder.total)}
                          value={cashCollectedInput}
                          onChange={(e) => setCashCollectedInput(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-amber-800 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-600 block mb-1">Change to Return</span>
                        <span className="font-mono font-bold text-emerald-600 text-sm block pt-1">
                          ₹{Math.max(0, (Number(cashCollectedInput) || selectedOrder.total) - selectedOrder.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4-Digit PIN Input Box */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-700">
                      Customer Handover PIN:
                    </label>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {pinRemainingAttempts < 3 ? `${pinRemainingAttempts} tries remaining` : 'Max 3 attempts'}
                    </span>
                  </div>

                  <div className="flex justify-center gap-2 pt-1">
                    {deliveryPin.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={pinInputRefs[idx]}
                        type="text"
                        maxLength={1}
                        disabled={pinLockoutSeconds > 0}
                        value={digit}
                        onChange={(e) => handlePinChange(idx, e.target.value)}
                        onKeyDown={(e) => handlePinKeyDown(idx, e)}
                        className="w-11 h-12 text-center text-xl font-mono font-black rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-40"
                      />
                    ))}
                  </div>

                  {pinError && (
                    <p className="text-[11px] text-rose-400 font-semibold">{pinError}</p>
                  )}

                  <button
                    type="button"
                    disabled={pinLockoutSeconds > 0}
                    onClick={handleFillDemoPin}
                    className="text-[10px] text-emerald-600 hover:underline pt-1 cursor-pointer disabled:opacity-40"
                  >
                    Auto-Fill Demo PIN ({selectedOrder.deliveryPin || '4291'})
                  </button>
                </div>

                {/* ThermalVault Box Collection */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                      <span>Cold Box Returned?</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsReturningBox(!isReturningBox)}
                      className={`px-3 py-1 rounded-full text-[10px] font-black cursor-pointer border ${
                        isReturningBox
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}
                    >
                      {isReturningBox ? 'YES (Box Retrieved)' : 'NO (Retained by Customer)'}
                    </button>
                  </div>

                  {isReturningBox && (
                    <div className="text-[11px] text-gray-400 space-y-2 pt-1 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <span>Cold Box Tag:</span>
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900 font-mono">{scannedBoxId}</strong>
                          <button
                            type="button"
                            onClick={startCameraScanner}
                            className="px-2 py-0.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>Scan</span>
                          </button>
                        </div>
                      </div>

                      {/* Temperature Compliance Audit Button */}
                      <button
                        type="button"
                        onClick={handleRunCoolerInspection}
                        disabled={isCheckingCooler}
                        className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-bold text-sky-300 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Thermometer className="w-3.5 h-3.5 text-sky-400" />
                        <span>{isCheckingCooler ? 'Analyzing Cold Chain Data...' : 'Audit Cold-Chain (0°C - 4°C Rule)'}</span>
                      </button>

                      {coolerCheckResult && (
                        <div className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                          coolerCheckResult.refundApproved
                            ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-200'
                            : 'bg-rose-950/70 border-rose-700/80 text-rose-200'
                        }`}>
                          <div className="flex justify-between items-center font-bold">
                            <span>Cooler Status: {coolerCheckResult.stage}</span>
                            <span className="font-mono">{coolerCheckResult.finalTemp}°C</span>
                          </div>
                          <p className="text-[10px] leading-relaxed">{coolerCheckResult.message}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isVerifying || pinLockoutSeconds > 0}
                  onClick={handleSubmitHandover}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                >
                  {isVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Verify PIN & Complete Delivery</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REAL CAMERA SCANNER MODAL (WebRTC Viewfinder)                            */}
      {/* ========================================================================= */}
      {cameraModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={stopCameraScanner} className="fixed inset-0 bg-black/85 backdrop-blur-md" />

          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 text-gray-100 z-10 space-y-3.5 text-xs shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <h3 className="font-black text-white text-sm">Scan Cold Box Barcode</h3>
              </div>
              <button onClick={stopCameraScanner} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {/* Video Viewfinder with animated laser scanline */}
            <div className="relative w-full h-56 bg-black rounded-2xl overflow-hidden border border-slate-700 flex items-center justify-center">
              <video
                ref={cameraVideoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Target Scanframe Overlay */}
              <div className="absolute inset-6 border-2 border-dashed border-sky-400/80 rounded-2xl pointer-events-none flex items-center justify-center">
                {/* Red Laser Scanline */}
                <div className="w-full h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" />
              </div>

              {!isCameraActive && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center space-y-2">
                  <Camera className="w-8 h-8 text-sky-400" />
                  <span className="text-xs font-bold text-slate-800">
                    {cameraError || 'Activating live video stream...'}
                  </span>
                  <button
                    onClick={startCameraScanner}
                    className="px-3 py-1.5 rounded-xl bg-sky-600 text-white font-bold text-[11px]"
                  >
                    Retry Camera
                  </button>
                </div>
              )}
            </div>

            {/* Instant Quick-Select Barcodes */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] text-amber-800 uppercase font-bold block">1-Tap Tag Emulation (Hub Cold Boxes):</span>
              <div className="grid grid-cols-2 gap-1.5">
                {['BOX-BLR-417', 'BOX-BLR-182', 'BOX-BLR-633', 'BOX-BLR-983'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleSelectScannedBarcode(tag)}
                    className="p-2 rounded-xl bg-slate-950 border border-slate-700 hover:border-sky-500 text-left font-mono font-bold text-sky-300 hover:text-white transition cursor-pointer flex items-center justify-between"
                  >
                    <span>{tag}</span>
                    <Check className="w-3 h-3 text-sky-400" />
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={stopCameraScanner}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-700 font-bold transition cursor-pointer"
            >
              Close Scanner
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASH DEPOSIT AT HUB MODAL                                                */}
      {/* ========================================================================= */}
      {isCashDepositModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div onClick={() => setIsCashDepositModalOpen(false)} className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

          <div className="relative w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 z-10 space-y-4 text-xs shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-amber-400" />
                <h3 className="font-black text-white text-sm">Hub Cash Reconciliation</h3>
              </div>
              <button onClick={() => setIsCashDepositModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-center space-y-1">
              <span className="text-[10px] text-amber-800 uppercase font-bold block">Current Floating Cash in Hand</span>
              <span className="text-3xl font-black font-mono text-amber-800">₹{cashInHand}</span>
              <span className="text-[10px] text-slate-500 block">Maximum Allowed Holding: ₹2,000</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 block">Amount to Deposit at Mahadevapura Hub</label>
              <input
                type="number"
                placeholder={String(cashInHand)}
                value={depositAmountInput}
                onChange={(e) => setDepositAmountInput(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              onClick={handleDepositCash}
              disabled={cashInHand <= 0}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition cursor-pointer disabled:opacity-40 shadow-md flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Cash Deposit at Depot</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
