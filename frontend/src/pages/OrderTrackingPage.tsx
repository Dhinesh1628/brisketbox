import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  MapPin, 
  CheckCircle2, 
  Thermometer, 
  ShieldCheck, 
  Phone, 
  MessageSquare, 
  Clock, 
  Package, 
  AlertCircle,
  Truck,
  FileText,
  Lock,
  Bike
} from 'lucide-react';
import type { Order } from '../types';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { generateAndPrintInvoice } from '../utils/invoiceGenerator';
import { getOrderDeliveryPin } from '../utils/pinHelper';

interface OrderTrackingPageProps {
  onNavigateToReturns: () => void;
}

export const OrderTrackingPage: React.FC<OrderTrackingPageProps> = ({ onNavigateToReturns }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Customer Profile
  const activeCustomerName = user?.name || '';
  const activeCustomerPhone = user?.phone || '';

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await api.getOrders();
      if (data && data.length > 0) {
        setOrders(data);
        setSelectedOrder(data[0]);
      } else {
        setOrders([]);
        setSelectedOrder(null);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setOrders([]);
      setSelectedOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(async () => {
      try {
        const data = await api.getOrders();
        if (data && data.length > 0) {
          setOrders(data);
          setSelectedOrder(prev => {
            if (!prev) return data[0];
            return data.find(o => o.id === prev.id) || data[0];
          });
        }
      } catch {
        // Quiet poll
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#d11243] animate-spin" />
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Loading your orders...</p>
      </div>
    );
  }

  if (orders.length === 0 || !selectedOrder) {
    return (
      <div className="space-y-6 pb-20 max-w-xl mx-auto pt-8">
        <div className="bg-white dark:bg-slate-900 p-8 sm:p-12 rounded-3xl border border-gray-200 dark:border-slate-800 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-[#d11243] flex items-center justify-center mx-auto">
            <Package className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-gray-900 dark:text-white">No Active Orders Found</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            You do not have any placed orders yet. Place an order to track transit and delivery status.
          </p>
          <button
            onClick={onNavigateToReturns}
            className="px-5 py-2.5 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold text-xs transition shadow-sm cursor-pointer"
          >
            Start shopping
          </button>
        </div>
      </div>
    );
  }

  const currentOrder = selectedOrder;
  const orderPin = getOrderDeliveryPin(currentOrder);

  // 6-stage delivery status
  const timelineStages = [
    { 
      key: 'CONFIRMED', 
      title: 'Order Confirmed', 
      desc: 'Your order is confirmed and sent to preparation.' 
    },
    { 
      key: 'PREPARING', 
      title: "Preparing Your Order", 
      desc: 'Fresh cuts are sliced and prepared for your order.' 
    },
    { 
      key: 'QUALITY_CHECK', 
      title: 'Quality Check Done', 
      desc: 'Checked for cut specifications and chilling compliance.' 
    },
    { 
      key: 'PACKED', 
      title: 'Packed and Ready', 
      desc: 'Packed in a cold box with ice gel packs.' 
    },
    { 
      key: 'OUT_FOR_DELIVERY', 
      title: 'Out for Delivery', 
      desc: 'Your delivery partner is on the way to your door.' 
    },
    { 
      key: 'DELIVERED', 
      title: 'Delivered', 
      desc: 'Handed over at your doorstep.' 
    }
  ];

  const getStageIndex = (order: Order): number => {
    const rawStatus = (order.orderStatus || order.status || '').toUpperCase().replace(/[\s-]/g, '_');
    if (rawStatus === 'DELIVERED') return 5;
    if (rawStatus === 'OUT_FOR_DELIVERY') return 4;
    if (rawStatus === 'PACKED' || rawStatus === 'PACKED_IN_COLD_BOX') return 3;
    if (rawStatus === 'QUALITY_CHECK') return 2;
    if (rawStatus === 'PREPARING' || rawStatus === 'PREPARING_YOUR_ORDER') return 1;
    return 0; // CONFIRMED or PENDING
  };

  const isCancelled = (currentOrder.orderStatus || currentOrder.status || '').toUpperCase() === 'CANCELLED';
  const currentStageIndex = isCancelled ? -1 : getStageIndex(currentOrder);

  // Status notification text
  const getStatusNotification = (order: Order) => {
    if (isCancelled) {
      return {
        badge: 'Order Cancelled',
        color: 'rose',
        message: 'This order was cancelled. Payment refunded or queued for refund per policy.'
      };
    }
    switch (currentStageIndex) {
      case 0:
        return {
          badge: 'Order Confirmed',
          color: 'blue',
          message: 'Your order is confirmed and scheduled for prep.'
        };
      case 1:
        return {
          badge: 'Preparing Your Order',
          color: 'amber',
          message: 'Your cuts are being prepared at the station.'
        };
      case 2:
        return {
          badge: 'Quality Check Done',
          color: 'amber',
          message: 'Passed cold-chain inspection.'
        };
      case 3:
        return {
          badge: 'Packed and Ready',
          color: 'emerald',
          message: 'Packed in an insulated cold box with gel packs.'
        };
      case 4:
        return {
          badge: 'Out for Delivery',
          color: 'emerald',
          message: 'Your delivery partner is on the way to your address.'
        };
      case 5:
        return {
          badge: 'Delivered',
          color: 'emerald',
          message: 'Delivered to your doorstep.'
        };
      default:
        return {
          badge: 'Processing',
          color: 'gray',
          message: 'Your order is being processed.'
        };
    }
  };

  const notification = getStatusNotification(currentOrder);

  // Freshness Passport, Part 1: Only real recorded events
  const freshnessEvents: Array<{ title: string; time: string; desc: string }> = [];

  if (currentOrder.createdAt) {
    freshnessEvents.push({
      title: 'Order Placed & Confirmed',
      time: new Date(currentOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      desc: 'Order confirmed and registered in production.'
    });
  }

  if (currentOrder.lifecycleTimestamps?.preparingAt) {
    freshnessEvents.push({
      title: 'Butcher Preparation',
      time: new Date(currentOrder.lifecycleTimestamps.preparingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      desc: 'Order prepped at partner station.'
    });
  }

  if (currentOrder.lifecycleTimestamps?.packedAt || currentOrder.packedAt) {
    const pTime = currentOrder.lifecycleTimestamps?.packedAt || currentOrder.packedAt;
    freshnessEvents.push({
      title: 'Cold-Box Packaging',
      time: new Date(pTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      desc: `Sealed in insulated box #${currentOrder.coolerId || 'vault'}.`
    });
  }

  if (currentOrder.lifecycleTimestamps?.outForDeliveryAt || currentOrder.outForDeliveryAt) {
    const dTime = currentOrder.lifecycleTimestamps?.outForDeliveryAt || currentOrder.outForDeliveryAt;
    freshnessEvents.push({
      title: 'Dispatched for Delivery',
      time: new Date(dTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      desc: 'Assigned to delivery partner for courier transit.'
    });
  }

  if (currentOrder.lifecycleTimestamps?.deliveredAt || currentOrder.deliveredAt) {
    const delTime = currentOrder.lifecycleTimestamps?.deliveredAt || currentOrder.deliveredAt;
    freshnessEvents.push({
      title: 'Delivered at Doorstep',
      time: new Date(delTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      desc: 'Customer PIN verified and package handed over.'
    });
  }

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto">
      
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-black text-gray-950 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#d11243] dark:text-rose-500" />
              <span>Track Your Order</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-black border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Chilled Packaging</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Follow your order status and cold box temperature readings
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="px-3.5 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Orders Selector & Detailed Tracking View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Orders List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              My Orders ({orders.length})
            </h3>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">Cold Chain</span>
          </div>

          <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
            {orders.map((ord) => {
              const isSelected = currentOrder.id === ord.id;
              const ordStatus = ord.orderStatus || ord.status || 'PENDING';
              return (
                <div
                  key={ord.id}
                  onClick={() => setSelectedOrder(ord)}
                  className={`p-4 rounded-2xl border text-xs cursor-pointer transition relative ${
                    isSelected
                      ? 'bg-rose-50/70 dark:bg-rose-950/40 border-[#d11243] ring-1 ring-[#d11243] shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 shadow-2xs'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-black text-sm text-gray-950 dark:text-white">
                        #{ord.orderNumber || ord.id}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">
                        {(ord.items || []).length} Cut(s) • ₹{ord.total}
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shadow-2xs ${
                      ordStatus === 'DELIVERED'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : ordStatus === 'CANCELLED'
                        ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-[#d11243] dark:text-rose-400 border-rose-200 dark:border-rose-900'
                    }`}>
                      {ordStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <span>Box:</span>
                      <strong className="text-gray-900 dark:text-gray-200 font-mono">{ord.coolerId || 'Pending'}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                        PIN: {getOrderDeliveryPin(ord)}
                      </span>
                      <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-black">
                        <Thermometer className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{ord.liveTemp !== null && ord.liveTemp !== undefined ? `${ord.liveTemp}°C` : 'Not recorded'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Visual Timeline & Full Order Details */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Delivery Status Notification Banner */}
          <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center text-[#d11243] shrink-0 mt-0.5">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-[#d11243] dark:text-rose-400 font-extrabold text-[10px] uppercase">
                    {notification.badge}
                  </span>
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    Order #{currentOrder.orderNumber || currentOrder.id}
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mt-1">
                  {notification.message}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-slate-800 px-3.5 py-2 rounded-2xl border border-gray-200 dark:border-slate-700 shrink-0 text-right">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Status</span>
              <span className="text-xs font-black text-gray-950 dark:text-white">
                {currentOrder.assignedRider?.estimatedArrival 
                  ? `ETA: ${currentOrder.assignedRider.estimatedArrival}` 
                  : (currentOrder.orderStatus || currentOrder.status || 'Active').replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* 6-Stage Visual Stepper */}
          <div className="bg-white dark:bg-slate-900 p-6 sm:p-7 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#d11243]" />
                  <span>Order Pipeline</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Follow each step as your cuts are prepared and delivered
                </p>
              </div>

              <button
                onClick={() => generateAndPrintInvoice(currentOrder)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:text-black hover:border-gray-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5 text-[#d11243]" />
                <span>Invoice</span>
              </button>
            </div>

            {/* Stepper Grid */}
            <div className="relative">
              <div className="hidden sm:block absolute top-5 left-8 right-8 h-1 bg-gray-200 dark:bg-slate-800 -z-0">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: isCancelled 
                      ? '0%' 
                      : `${Math.min(100, (currentStageIndex / (timelineStages.length - 1)) * 100)}%`
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 relative z-10">
                {timelineStages.map((st, idx) => {
                  const isPassed = !isCancelled && idx <= currentStageIndex;
                  const isCurrent = !isCancelled && idx === currentStageIndex;

                  return (
                    <div key={st.key} className="flex sm:flex-col items-start sm:items-center text-left sm:text-center gap-3 sm:gap-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs shrink-0 transition-all ${
                        isCurrent
                          ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-400/30 shadow-lg scale-110'
                          : isPassed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-slate-700'
                      }`}>
                        {isPassed && !isCurrent ? (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        ) : (
                          <span>{idx + 1}</span>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <div className={`text-xs font-black leading-snug ${
                          isCurrent 
                            ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' 
                            : isPassed 
                            ? 'text-gray-900 dark:text-white' 
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {st.title}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight hidden lg:block mt-1">
                          {st.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {isCancelled && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>This order was cancelled. Payment refund processed per policy.</span>
              </div>
            )}
          </div>

          {/* Freshness Passport, Part 1: Real Recorded Events Only */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-150 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-gray-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Freshness Passport</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Verified timestamps and custody log. Only actual recorded events are shown.
                </p>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                Recorded Log
              </span>
            </div>

            {freshnessEvents.length > 0 ? (
              <div className="space-y-2.5">
                {freshnessEvents.map((ev, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-150 dark:border-slate-800">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{ev.title}</span>
                        <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{ev.time}</span>
                      </div>
                      <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{ev.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic text-center py-2">
                Order pending confirmation. Event log will update as steps are completed.
              </p>
            )}
          </div>

          {/* Cold-Chain Telemetry Card */}
          <div className="bg-slate-950 text-white p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Cold Box #{currentOrder.coolerId || 'Pending'}
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-extrabold">
                Chilled Packaging
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Recorded Live Temperature</span>
                <div className="text-xl font-black text-emerald-400 mt-0.5">
                  {currentOrder.liveTemp !== null && currentOrder.liveTemp !== undefined ? `${currentOrder.liveTemp}°C` : 'Temperature not recorded'}
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-400">
                <span>Storage: </span>
                <strong className="text-slate-200">Chilled</strong>
              </div>
            </div>
          </div>

          {/* Handover PIN Card */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/70 dark:from-slate-850 dark:to-slate-800 border-2 border-amber-300 dark:border-amber-700/80 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 dark:bg-amber-600 text-white flex items-center justify-center shadow-md shrink-0">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider">
                    Handover PIN
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/80 text-amber-950 dark:text-amber-200 text-[10px] font-black">
                    Required on Arrival
                  </span>
                </div>
                <p className="text-[11px] text-amber-900/90 dark:text-amber-300/90 mt-0.5">
                  Share this 4-digit PIN with your delivery partner to verify handover.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto bg-white dark:bg-slate-900 px-4 py-2.5 rounded-2xl border-2 border-amber-400 dark:border-amber-500 shadow-sm">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">PIN:</span>
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-[#d11243] dark:text-rose-400">
                {orderPin}
              </span>
            </div>
          </div>

          {/* Delivery Partner Details (Only Real Assigned Data) */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                <Bike className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-wider">
                  Delivery Partner
                </span>
                <div className="font-black text-sm text-gray-950 dark:text-white mt-0.5">
                  {currentOrder.assignedRider?.fullName || currentOrder.riderFullName || 'Pending Assignment'}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {currentOrder.assignedRider?.vehicle || currentOrder.riderVehicle ? (
                    <span>Vehicle: <strong className="text-gray-800 dark:text-gray-200">{currentOrder.assignedRider?.vehicle || currentOrder.riderVehicle}</strong></span>
                  ) : (
                    <span>Assigned upon dispatch</span>
                  )}
                  {currentOrder.assignedRider?.maskedPhone && (
                    <span> • Contact: <strong className="font-mono text-gray-700 dark:text-gray-300">{currentOrder.assignedRider.maskedPhone}</strong></span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => alert('Support line available via Contact Us.')}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Support</span>
              </button>
            </div>
          </div>

          {/* Order Details & Summary */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-150 dark:border-slate-800 pb-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-950 dark:text-white flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-[#d11243] dark:text-rose-500" />
                <span>Your Items ({(currentOrder.items || []).length})</span>
              </h4>
              <span className="text-xs font-extrabold text-[#d11243] dark:text-rose-400">
                Total: ₹{currentOrder.total} ({currentOrder.paymentMethod || 'Online'})
              </span>
            </div>

            {/* Items List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(currentOrder.items || []).map((it, idx) => (
                <div key={idx} className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-2xl border border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-gray-950 dark:text-white">{it.name}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {it.quantity} x {it.unit} {it.netWeight ? `(Net: ${it.netWeight})` : ''}
                    </div>
                    {it.cutStyle && (
                      <span className="inline-block text-[10px] font-bold text-[#d11243] dark:text-rose-400">
                        Cut: {it.cutStyle}
                      </span>
                    )}
                  </div>
                  <span className="font-black text-sm text-gray-950 dark:text-white">₹{it.price * it.quantity}</span>
                </div>
              ))}
            </div>

            {/* Address & Payment Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-150 dark:border-slate-800 text-xs">
              <div className="p-3.5 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#d11243]" />
                  <span>Delivery Address</span>
                </span>
                <p className="font-bold text-gray-900 dark:text-white">{currentOrder.customerName || activeCustomerName}</p>
                <p className="text-gray-600 dark:text-gray-400 text-[11px] leading-relaxed">
                  {typeof currentOrder.deliveryAddress === 'object' && currentOrder.deliveryAddress !== null 
                    ? `${(currentOrder.deliveryAddress as any).flatNo || (currentOrder.deliveryAddress as any).line1 || ''} ${(currentOrder.deliveryAddress as any).street || ''}, ${(currentOrder.deliveryAddress as any).city || ''}` 
                    : String(currentOrder.deliveryAddress || '')}
                </p>
                <p className="text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                  Contact: <strong className="text-gray-700 dark:text-gray-300">{currentOrder.customerPhone || activeCustomerPhone}</strong>
                </p>
                {currentOrder.deliveryNotes && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 italic pt-1">
                    Note: "{currentOrder.deliveryNotes}"
                  </p>
                )}
              </div>

              <div className="p-3.5 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between text-gray-600 dark:text-gray-400 text-xs">
                  <span>Item Total:</span>
                  <span className="font-bold text-gray-900 dark:text-white">₹{currentOrder.subtotal}</span>
                </div>
                
                <div className="flex justify-between text-gray-600 dark:text-gray-400 text-xs">
                  <span>Delivery Fee:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {currentOrder.shippingFee === 0 ? 'FREE' : `₹${currentOrder.shippingFee}`}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex justify-between font-black text-sm">
                  <span className="text-gray-950 dark:text-white">Total Amount:</span>
                  <span className="text-[#d11243] dark:text-rose-400">₹{currentOrder.total}</span>
                </div>
                {currentOrder.razorpayPaymentId && (
                  <div className="text-[10px] text-gray-400 font-mono pt-1">
                    Payment ID: {currentOrder.razorpayPaymentId}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Temperature Log: Real Staff / Sensor Checks */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-950 dark:text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                <span>Recorded Temperature Checks</span>
              </h4>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">Audit Trail</span>
            </div>

            {currentOrder.tempLog && currentOrder.tempLog.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700 text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Reading</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3">Details / Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-[11px]">
                    {currentOrder.tempLog.map((l, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{l.time}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                          {l.temp !== null && l.temp !== undefined ? `${l.temp}°C` : 'Not recorded'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {l.source === 'STAFF_CHECK' ? 'Staff Check' : l.source === 'SENSOR' ? 'Sensor' : 'Recorded Check'}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-medium">
                          {l.event} {l.recordedBy ? `(by ${l.recordedBy})` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl text-center text-xs text-gray-500 dark:text-gray-400">
                Temperature not recorded yet. Staff checks are logged upon prep, packing, and dispatch.
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
