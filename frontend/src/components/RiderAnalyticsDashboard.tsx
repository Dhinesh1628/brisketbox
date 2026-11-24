import React, { useState, useEffect } from 'react';
import { 
  Bike, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  MapPin, 
  ShieldCheck, 
  TrendingUp, 
  RefreshCw, 
  Thermometer, 
  Box, 
  ChevronRight, 
  BarChart3, 
  FileText,
  AlertOctagon,
  Eye,
  Calendar,
  Layers
} from 'lucide-react';
import { api } from '../api';

export const RiderAnalyticsDashboard: React.FC = () => {
  const [source, setSource] = useState<'live' | 'benchmark'>('benchmark');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'report' | 'diagnosis' | 'demand' | 'cash' | 'identity'>('report');
  const [data, setData] = useState<any>(null);

  const fetchAnalytics = async (selectedSource: 'live' | 'benchmark') => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFleetAnalyticsOverview(selectedSource);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load fleet analytics:', err);
      setError(err.message || 'Failed to load analytics suite');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(source);
  }, [source]);

  if (loading && !data) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#d11243] animate-spin" />
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          Loading fleet delivery logs and temperature records...
        </span>
      </div>
    );
  }

  const overview = data?.overview || {};
  const riderReport = data?.riderReport || { summary: {}, riders: [] };
  const diagnosis = data?.diagnosis || { coolers: [], riders: [], tripImpact: {} };
  const demand = data?.demand || { summary: {}, areas: [], hours: [], peakHours: [], busiestSlots: [] };
  const cash = data?.cash || { summary: {}, riders: [] };
  const idCheck = data?.idCheck || { summary: {}, results: [] };

  return (
    <div className="space-y-6">
      {/* Top Header & Dataset Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#d11243] border border-red-100 dark:border-red-900/50">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-gray-950 dark:text-white">
                  Rider Delivery Fleet & Cold Box Reports
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  Fleet Logs Active
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Delivery performance, cold box temperatures, hub order demand, and cash in hand.
              </p>
            </div>
          </div>

          {/* Dataset Switcher & Refresh Button */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="bg-gray-100 dark:bg-slate-800 p-1 rounded-xl flex items-center text-xs">
              <button
                onClick={() => setSource('benchmark')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  source === 'benchmark'
                    ? 'bg-white dark:bg-slate-900 text-[#d11243] shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                }`}
              >
                Benchmark (287 Orders)
              </button>
              <button
                onClick={() => setSource('live')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  source === 'live'
                    ? 'bg-white dark:bg-slate-900 text-[#d11243] shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                }`}
              >
                Live Production DB
              </button>
            </div>

            <button
              onClick={() => fetchAnalytics(source)}
              disabled={loading}
              className="p-2 rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300 transition-colors"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* KPI Cards Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-slate-800">
          <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-medium">Fleet On-Time %</span>
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-lg font-black text-gray-900 dark:text-white">
              {overview.fleetOnTimePct || 0}%
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {overview.goodRidersCount || 0} Good • {overview.poorRidersCount || 0} Watch/Poor
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-medium">Suspect Coolers</span>
              <Thermometer className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-lg font-black text-gray-900 dark:text-white">
              {overview.suspectCoolersCount || 0} Flagged
            </div>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">
              {overview.defectiveCoolers?.length > 0 ? overview.defectiveCoolers.join(', ') : 'None defective'}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-medium">COD In Fleet Hand</span>
              <DollarSign className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-lg font-black text-gray-900 dark:text-white">
              ₹{(overview.totalCodCashInHand || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              Across {cash.riders?.length || 0} active couriers
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-medium">Peak Dispatch</span>
              <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="text-sm font-black text-gray-900 dark:text-white truncate">
              {demand.peakHours?.[0]?.label || '7 PM'} Peak
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              Need {demand.summary?.ridersNeededAtPeak || 2} riders/hub
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-medium">Top Hub Area</span>
              <MapPin className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div className="text-sm font-black text-gray-900 dark:text-white truncate">
              {overview.topArea || 'HSR Layout'}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {demand.areas?.[0]?.pct || 0}% of total orders
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-gray-400 mb-1">
              <span className="text-[11px] font-medium">ID Compliance</span>
              <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
            </div>
            <div className="text-lg font-black text-gray-900 dark:text-white">
              {idCheck.summary?.passed || 0}/{idCheck.summary?.totalChecked || 0}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              Verhoeff & PAN verified
            </div>
          </div>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActiveSubTab('report')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all shrink-0 ${
            activeSubTab === 'report'
              ? 'bg-[#d11243] text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-800 hover:bg-gray-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>1. Rider Delivery Times ({riderReport.riders?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('diagnosis')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all shrink-0 ${
            activeSubTab === 'diagnosis'
              ? 'bg-[#d11243] text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-800 hover:bg-gray-50'
          }`}
        >
          <Thermometer className="w-3.5 h-3.5" />
          <span>2. Cooler Box vs Rider Check</span>
          {diagnosis.suspectCoolersCount > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-400 text-amber-950 font-black rounded-full text-[10px]">
              {diagnosis.suspectCoolersCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('demand')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all shrink-0 ${
            activeSubTab === 'demand'
              ? 'bg-[#d11243] text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-800 hover:bg-gray-50'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>3. Area Demand & Peak Hours</span>
        </button>

        <button
          onClick={() => setActiveSubTab('cash')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all shrink-0 ${
            activeSubTab === 'cash'
              ? 'bg-[#d11243] text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-800 hover:bg-gray-50'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>4. Cash on Delivery (COD)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('identity')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all shrink-0 ${
            activeSubTab === 'identity'
              ? 'bg-[#d11243] text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-800 hover:bg-gray-50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>5. Rider ID & License Check</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: RIDER ON-TIME PERFORMANCE                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'report' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-gray-900 dark:text-white text-sm">
                Rider Delivery Performance
              </h3>
              <p className="text-xs text-gray-500">
                Performance stages: <strong className="text-emerald-600">GOOD (&ge;90%)</strong>, <strong className="text-amber-500">WATCH (75–89%)</strong>, <strong className="text-rose-500">POOR (&lt;75%)</strong>.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              Total Delivered: <strong className="text-gray-900 dark:text-white">{riderReport.summary?.deliveredOrders || 0}</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Rider</th>
                  <th className="py-3 px-3">Vehicle</th>
                  <th className="py-3 px-3 text-center">Deliveries</th>
                  <th className="py-3 px-3 text-center">On-Time %</th>
                  <th className="py-3 px-3 text-center">Stage</th>
                  <th className="py-3 px-3 text-right">Order &rarr; Door</th>
                  <th className="py-3 px-3 text-right">Pickup &rarr; Door</th>
                  <th className="py-3 px-3 text-right">Wait After Pack</th>
                  <th className="py-3 px-4 text-right">Cash in Hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {riderReport.riders?.map((rider: any) => (
                  <tr key={rider.riderId} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-900 dark:text-white">{rider.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{rider.riderId}</div>
                    </td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-300">
                      {rider.vehicle}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-gray-900 dark:text-white">
                      {rider.deliveries}
                      <span className="text-[10px] text-gray-400 font-normal block">{rider.activeDaysCount} days active</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="inline-flex items-center gap-1 font-black text-sm">
                        <span className={rider.onTimePct >= 90 ? 'text-emerald-600 dark:text-emerald-400' : rider.onTimePct >= 75 ? 'text-amber-500' : 'text-rose-600'}>
                          {rider.onTimePct}%
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 block">{rider.lateDeliveries} late</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        rider.stage === 'GOOD'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          : rider.stage === 'WATCH'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                      }`}>
                        {rider.stage}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-700 dark:text-gray-300">
                      {rider.avgOrderToDoorMin} min
                      <span className="text-[10px] text-gray-400 block">med: {rider.medianOrderToDoorMin}m</span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-700 dark:text-gray-300">
                      {rider.avgPickupToDoorMin} min
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-700 dark:text-gray-300">
                      {rider.avgWaitAfterPackMin} min
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">
                      ₹{(rider.cashInHand || 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: FAULT DIAGNOSIS (RIDER VS COOLER)                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'diagnosis' && (
        <div className="space-y-4">
          {/* Executive Verdict Banner */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 text-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h4 className="font-black text-amber-950 dark:text-amber-300 text-sm">
                  Checking Cooler Box vs Rider Delivery Times
                </h4>
                <div className="space-y-1 text-amber-900 dark:text-amber-200/90 leading-relaxed">
                  <p>
                    • <strong>Cooler Box Check:</strong> If a cooler warms up repeatedly across different riders, the box insulation needs repair.
                  </p>
                  <p>
                    • <strong>Rider Check:</strong> Checked using good coolers only. Riders whose deliveries warm up even with good coolers are flagged for slow delivery or stops on the road.
                  </p>
                  <p>
                    • <strong>Trip Duration:</strong> Extended transit trips had a <strong>{diagnosis.tripImpact?.longTripsBreachPct || 28.9}% failure rate</strong>, compared to only <strong>{diagnosis.tripImpact?.shortTripsBreachPct || 2.4}%</strong> for prompt transit.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Coolers Audit List */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 shadow-2xs">
              <h4 className="font-extrabold text-gray-950 dark:text-white text-xs mb-3 flex items-center justify-between">
                <span>Cooler Performance ({diagnosis.coolers?.length || 0} Inspected)</span>
                <span className="text-[10px] text-gray-400">&ge;40% fail = Suspect</span>
              </h4>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {diagnosis.coolers?.map((c: any) => (
                  <div
                    key={c.coolerId}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                      c.suspect
                        ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                        : 'bg-gray-50/50 dark:bg-slate-800/40 border-gray-100 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-950 dark:text-white">{c.coolerId}</span>
                        {c.suspect && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-600 text-white uppercase">
                            DEFECTIVE / REPAIR
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {c.failed} breaches in {c.deliveries} deliveries • {c.ridersAffected} riders affected
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-black ${c.failPct >= 40 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {c.failPct}%
                      </span>
                      <span className="text-[10px] text-gray-400 block">breach rate</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rider Temperature Compliance */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 shadow-2xs">
              <h4 className="font-extrabold text-gray-950 dark:text-white text-xs mb-3 flex items-center justify-between">
                <span>Rider Cold-Chain Handling (Clean Boxes Only)</span>
                <span className="text-[10px] text-gray-400">Fleet normal: {diagnosis.fleetNormalBreachRate || 7.4}%</span>
              </h4>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {diagnosis.riders?.map((r: any) => (
                  <div
                    key={r.riderId}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                      r.suspect
                        ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                        : 'bg-gray-50/50 dark:bg-slate-800/40 border-gray-100 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-950 dark:text-white">{r.name}</span>
                        {r.suspect && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500 text-white uppercase">
                            DELAY AT FAULT
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {r.failed} breaches in {r.deliveries} clean trips across {r.coolersUsed} boxes
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-black ${r.suspect ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {r.failPct}%
                      </span>
                      <span className="text-[10px] text-gray-400 block">failure rate</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: DEMAND HEATMAP & FLEET SIZING                                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'demand' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Orders by Area */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 shadow-2xs">
              <h4 className="font-extrabold text-gray-950 dark:text-white text-xs mb-3 flex items-center justify-between">
                <span>Orders by Hub & Geographic Area</span>
                <span className="text-[10px] text-gray-400">Total: {demand.summary?.totalOrders || 0}</span>
              </h4>
              <div className="space-y-3">
                {demand.areas?.map((item: any) => (
                  <div key={item.area} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-800 dark:text-gray-200">{item.area}</span>
                      <span className="text-gray-500">{item.orders} orders ({item.pct}%)</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#d11243] rounded-full transition-all"
                        style={{ width: `${Math.min(item.pct * 4, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Peak Hours & Sizing */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 shadow-2xs">
              <h4 className="font-extrabold text-gray-950 dark:text-white text-xs mb-3 flex items-center justify-between">
                <span>Hourly Demand Curve & Recommended Couriers</span>
                <span className="text-[10px] text-gray-400">{demand.summary?.ordersPerDay || 0} orders/day</span>
              </h4>
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {demand.hours?.map((h: any) => (
                  <div key={h.hour} className="p-2.5 rounded-xl bg-gray-50/50 dark:bg-slate-800/40 border border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 dark:text-white w-14">{h.label}</span>
                      <span className="text-gray-500">~{h.perDay} orders/day ({h.totalOrders} total)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        {h.ridersNeeded} Rider{h.ridersNeeded > 1 ? 's' : ''} needed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Busiest Area + Time Combinations */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 shadow-2xs">
            <h4 className="font-extrabold text-gray-950 dark:text-white text-xs mb-2">
              Top 5 High-Density Dispatch Slots (Hot Zones)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
              {demand.busiestSlots?.map((slot: any, idx: number) => (
                <div key={idx} className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">{slot.slot}</div>
                  <div className="text-sm font-black text-[#d11243] mt-1">{slot.orders} orders</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: CASH ON DELIVERY AUDIT                                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'cash' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
              <span className="text-xs text-gray-500">Total COD Orders</span>
              <div className="text-xl font-black text-gray-900 dark:text-white mt-1">
                {cash.summary?.totalCodOrders || 0}
              </div>
              <span className="text-[10px] text-gray-400">Delivered: {cash.summary?.deliveredCodOrders || 0}</span>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
              <span className="text-xs text-gray-500">Total Cash in Hand (Fleet)</span>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                ₹{(cash.summary?.totalCashCollected || 0).toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-gray-400">Collected from customers</span>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
              <span className="text-xs text-gray-500">Cash In Transit (Pending Delivery)</span>
              <div className="text-xl font-black text-amber-500 mt-1">
                ₹{(cash.summary?.totalCashPending || 0).toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-gray-400">Awaiting doorstep handover</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-gray-100 dark:border-slate-800">
              <h4 className="font-extrabold text-gray-950 dark:text-white text-xs">
                Per-Rider Cash In Custody Reconciliations
              </h4>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {cash.riders?.map((r: any) => (
                <div key={r.riderId} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white text-sm">{r.name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {r.delivered} delivered ({r.codOrdersAssigned} assigned) • {r.pending} currently in transit
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-gray-400 text-[10px] block">Cash Collected</span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        ₹{(r.cashCollected || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {r.cashPending > 0 && (
                      <div className="text-right">
                        <span className="text-gray-400 text-[10px] block">To Collect</span>
                        <span className="text-sm font-black text-amber-500">
                          ₹{(r.cashPending || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: RIDER ID CHECK (VERHOEFF & PAN)                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'identity' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h4 className="font-extrabold text-gray-950 dark:text-white text-xs">
                Rider ID & Driving License Verification
              </h4>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Checks 12-digit Aadhaar number format, PAN individual card details, and checks for reused IDs across riders.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 font-bold">
                {idCheck.summary?.passed || 0} Passed
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 font-bold">
                {idCheck.summary?.review || 0} Review
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400 font-bold">
                {idCheck.summary?.failed || 0} Failed
              </span>
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {idCheck.results?.map((rider: any) => (
              <div key={rider.riderId} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{rider.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      rider.status === 'PASSED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                        : rider.status === 'REVIEW'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400'
                    }`}>
                      {rider.status}
                    </span>
                  </div>
                  <div className="text-gray-500 text-[11px]">
                    Document: <strong>{rider.idDocType}</strong> ({rider.idNumberMasked}) • Onboarding Approval: <strong>{rider.approvalStatus}</strong>
                  </div>
                  {rider.reasons?.length > 0 && (
                    <div className="text-rose-600 dark:text-rose-400 text-[11px] font-medium">
                      {rider.reasons.join(' ')}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                    rider.governmentVerified
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'
                  }`}>
                    {rider.governmentVerified ? 'DigiLocker Verified' : 'Manual Upload'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
