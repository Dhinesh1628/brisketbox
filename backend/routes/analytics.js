import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ==========================================
// 1. HELPERS & TIMEZONE
// ==========================================
const IST_OFFSET = 5.5 * 60 * 60 * 1000;

const toIST = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + IST_OFFSET);
};

const minutesBetween = (startStr, endStr) => {
  if (!startStr || !endStr) return null;
  const a = new Date(startStr);
  const b = new Date(endStr);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 60000);
};

// ==========================================
// 2. VERHOEFF CHECKSUM (Aadhaar & PAN Logic)
// ==========================================
const _D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const _P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

const verhoeffValid = (numStr) => {
  let c = 0;
  const rev = String(numStr).split('').reverse();
  for (let i = 0; i < rev.length; i++) {
    const digit = parseInt(rev[i], 10);
    if (isNaN(digit)) return false;
    c = _D[c][_P[i % 8][digit]];
  }
  return c === 0;
};

const checkPan = (num, name = '') => {
  const pan = (num || '').trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    return { status: 'FAIL', reasons: ['Not a valid PAN format (5 letters, 4 digits, 1 letter)'] };
  }
  if (pan[3] !== 'P') {
    return { status: 'FAIL', reasons: [`4th letter '${pan[3]}' indicates non-individual or company entity`] };
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 0) {
    const firstInit = parts[0][0].toUpperCase();
    const lastInit = parts[parts.length - 1][0].toUpperCase();
    if (pan[4] !== firstInit && pan[4] !== lastInit) {
      return { status: 'WARN', reasons: [`5th character '${pan[4]}' does not match rider surname initial`] };
    }
  }
  return { status: 'OK', reasons: [] };
};

const checkAadhaar = (num) => {
  const clean = (num || '').replace(/\s+/g, '');
  if (!/^[2-9][0-9]{11}$/.test(clean)) {
    return { status: 'FAIL', reasons: ['Not a valid Aadhaar format (12 digits, cannot start with 0 or 1)'] };
  }
  if (!verhoeffValid(clean)) {
    return { status: 'FAIL', reasons: ['Aadhaar number fails Verhoeff cryptographic checksum validation'] };
  }
  return { status: 'OK', reasons: [] };
};

const checkDL = (num) => {
  const clean = (num || '').replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}(?:19|20)[0-9]{2}[0-9]{7}$/.test(clean)) {
    return { status: 'WARN', reasons: ['Does not match standard 15-character license structure (State + RTO + Year + Number)'] };
  }
  return { status: 'OK', reasons: [] };
};

// ==========================================
// 3. LOAD DATASET (LIVE vs BENCHMARK TEST DATA)
// ==========================================
const getSourceData = (req) => {
  const source = req.query.source || 'live';
  if (source === 'benchmark' || source === 'test') {
    const candidatePaths = [
      path.join(__dirname, '../../rider_analytics/rider_test_data.json'),
      path.join(__dirname, '../rider_analytics/rider_test_data.json'),
      path.join(process.cwd(), 'rider_analytics/rider_test_data.json')
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          return { data: JSON.parse(fs.readFileSync(p, 'utf-8')), source: 'benchmark' };
        } catch (e) {
          console.warn('[Analytics] Failed to read benchmark JSON:', e.message);
        }
      }
    }
  }

  // Fallback to Live In-Memory / MongoDB database
  return {
    data: {
      orders: db.get('orders') || [],
      users: db.get('users') || [],
      coolers: db.get('coolers') || []
    },
    source: 'live'
  };
};

// ==========================================
// 4. ANALYTICS ENGINES
// ==========================================

// Engine A: Rider Delivery & SLA Performance
const computeRiderReport = (data) => {
  const riders = (data.users || []).filter(u => u.role === 'rider');
  const riderMap = {};
  for (const r of riders) {
    riderMap[r.id] = {
      id: r.id,
      name: r.name || r.id,
      phone: r.phone || '',
      vehicle: r.vehicleType || r.vehicleNumber || 'EV 2-Wheeler',
      deliveries: 0,
      deliveredOnTime: 0,
      lateOrders: 0,
      totalMinutes: [],
      pickupToDoorMinutes: [],
      postPackWaitMinutes: [],
      activeDays: new Set(),
      cashInHand: r.cashInHand || 0
    };
  }

  let totalDelivered = 0;
  let inProgress = 0;

  for (const order of data.orders || []) {
    const isDelivered = String(order.orderStatus || '').toUpperCase() === 'DELIVERED';
    if (!isDelivered) {
      inProgress++;
      continue;
    }
    const rid = order.riderId;
    if (!rid) continue;

    if (!riderMap[rid]) {
      riderMap[rid] = {
        id: rid,
        name: order.riderFullName || order.riderName || rid,
        phone: order.riderPhone || '',
        vehicle: order.riderVehicle || 'EV 2-Wheeler',
        deliveries: 0,
        deliveredOnTime: 0,
        lateOrders: 0,
        totalMinutes: [],
        pickupToDoorMinutes: [],
        postPackWaitMinutes: [],
        activeDays: new Set(),
        cashInHand: 0
      };
    }

    const stat = riderMap[rid];
    stat.deliveries++;
    totalDelivered++;

    const placed = order.createdAt;
    const timestamps = order.lifecycleTimestamps || {};
    const packed = timestamps.packedAt || order.packedAt;
    const picked = timestamps.pickedUpAt || order.pickedUpAt;
    const delivered = timestamps.deliveredAt || order.deliveredAt;

    if (delivered) {
      stat.activeDays.add(new Date(delivered).toISOString().slice(0, 10));
      const totalTime = minutesBetween(placed, delivered);
      if (totalTime !== null && totalTime >= 0) {
        stat.totalMinutes.push(totalTime);
        if (totalTime <= 90) {
          stat.deliveredOnTime++;
        } else {
          stat.lateOrders++;
        }
      }
    }

    if (picked && delivered) {
      const transit = minutesBetween(picked, delivered);
      if (transit !== null && transit >= 0) stat.pickupToDoorMinutes.push(transit);
    }

    if (packed && picked) {
      const wait = minutesBetween(packed, picked);
      if (wait !== null && wait >= 0) stat.postPackWaitMinutes.push(wait);
    }
  }

  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
  };

  const rows = Object.values(riderMap).map(r => {
    const onTimePct = r.deliveries > 0 ? Math.round((r.deliveredOnTime / r.deliveries) * 1000) / 10 : 100;
    let stage = 'GOOD';
    if (onTimePct < 75) stage = 'POOR';
    else if (onTimePct < 90) stage = 'WATCH';

    return {
      riderId: r.id,
      name: r.name,
      phone: r.phone,
      vehicle: r.vehicle,
      deliveries: r.deliveries,
      onTimeDeliveries: r.deliveredOnTime,
      lateDeliveries: r.lateOrders,
      onTimePct,
      stage,
      activeDaysCount: r.activeDays.size,
      avgOrderToDoorMin: avg(r.totalMinutes),
      medianOrderToDoorMin: median(r.totalMinutes),
      avgPickupToDoorMin: avg(r.pickupToDoorMinutes),
      avgWaitAfterPackMin: avg(r.postPackWaitMinutes),
      cashInHand: r.cashInHand
    };
  }).sort((a, b) => b.onTimePct - a.onTimePct);

  return {
    summary: {
      totalRiders: rows.length,
      deliveredOrders: totalDelivered,
      inProgressOrders: inProgress,
      fleetOnTimeAverage: rows.length ? Math.round(rows.reduce((acc, r) => acc + r.onTimePct, 0) / rows.length * 10) / 10 : 100
    },
    riders: rows
  };
};

// Engine B: Cooler Defect vs Rider Delay Diagnosis
const computeRiderOrCooler = (data) => {
  const LOW = 0;
  const HIGH = 4;
  const SENSOR_MIN = -30;
  const SENSOR_MAX = 60;
  const MIN_DELIVERIES = 3;

  const deliveries = [];
  for (const o of data.orders || []) {
    if (String(o.orderStatus || '').toUpperCase() !== 'DELIVERED') continue;
    if (!o.riderId || !o.coolerId) continue;

    const logs = o.tempLog || o.temperatureLog || [];
    let hasBreach = false;
    for (const l of logs) {
      const t = l.temp;
      if (typeof t === 'number' && t >= SENSOR_MIN && t <= SENSOR_MAX) {
        if (t < LOW || t > HIGH) {
          hasBreach = true;
          break;
        }
      }
    }

    const life = o.lifecycleTimestamps || {};
    const trip = minutesBetween(life.pickedUpAt || o.pickedUpAt, life.deliveredAt || o.deliveredAt);

    deliveries.push({
      orderId: o.id,
      riderId: o.riderId,
      coolerId: o.coolerId,
      failed: hasBreach,
      tripMin: trip
    });
  }

  // Group by cooler
  const coolerMap = {};
  for (const d of deliveries) {
    if (!coolerMap[d.coolerId]) coolerMap[d.coolerId] = { id: d.coolerId, total: 0, failed: 0, riders: new Set() };
    coolerMap[d.coolerId].total++;
    coolerMap[d.coolerId].riders.add(d.riderId);
    if (d.failed) coolerMap[d.coolerId].failed++;
  }

  const badCoolers = new Set();
  const coolers = Object.values(coolerMap).map(c => {
    const failPct = c.total > 0 ? Math.round((c.failed / c.total) * 1000) / 10 : 0;
    const suspect = c.total >= MIN_DELIVERIES && failPct >= 40;
    if (suspect) badCoolers.add(c.id);
    return {
      coolerId: c.id,
      deliveries: c.total,
      failed: c.failed,
      failPct,
      ridersAffected: c.riders.size,
      suspect
    };
  }).sort((a, b) => b.failPct - a.failPct);

  // Group by rider (excluding bad coolers)
  const cleanDeliveries = deliveries.filter(d => !badCoolers.has(d.coolerId));
  const riderMap = {};
  for (const d of cleanDeliveries) {
    if (!riderMap[d.riderId]) riderMap[d.riderId] = { id: d.riderId, total: 0, failed: 0, coolers: new Set() };
    riderMap[d.riderId].total++;
    riderMap[d.riderId].coolers.add(d.coolerId);
    if (d.failed) riderMap[d.riderId].failed++;
  }

  const fleetCleanFailures = cleanDeliveries.filter(d => d.failed).length;
  const normalRate = cleanDeliveries.length ? Math.round((fleetCleanFailures / cleanDeliveries.length) * 1000) / 10 : 0;

  const userDict = {};
  for (const u of data.users || []) userDict[u.id] = u.name || u.id;

  const riders = Object.values(riderMap).map(r => {
    const failPct = r.total > 0 ? Math.round((r.failed / r.total) * 1000) / 10 : 0;
    const suspect = r.total >= MIN_DELIVERIES && failPct >= 15 && failPct > normalRate * 1.5;
    return {
      riderId: r.id,
      name: userDict[r.id] || r.id,
      deliveries: r.total,
      failed: r.failed,
      failPct,
      coolersUsed: r.coolers.size,
      suspect
    };
  }).sort((a, b) => b.failPct - a.failPct);

  // Long trips impact (>45 min)
  const longTrips = deliveries.filter(d => d.tripMin !== null && d.tripMin > 45);
  const shortTrips = deliveries.filter(d => d.tripMin !== null && d.tripMin <= 45);
  const longFailed = longTrips.filter(d => d.failed).length;
  const shortFailed = shortTrips.filter(d => d.failed).length;

  return {
    deliveriesChecked: deliveries.length,
    suspectCoolersCount: badCoolers.size,
    fleetNormalBreachRate: normalRate,
    coolers,
    riders,
    tripImpact: {
      longTripsCount: longTrips.length,
      longTripsBreachPct: longTrips.length ? Math.round((longFailed / longTrips.length) * 1000) / 10 : 0,
      shortTripsCount: shortTrips.length,
      shortTripsBreachPct: shortTrips.length ? Math.round((shortFailed / shortTrips.length) * 1000) / 10 : 0
    }
  };
};

// Engine C: Geographic Demand & Hourly Sizing
const computeDemand = (data) => {
  const byArea = {};
  const byHour = {};
  const bySlot = {};
  const days = new Set();
  let total = 0;

  for (const o of data.orders || []) {
    if (!o.createdAt) continue;
    const ist = toIST(o.createdAt);
    if (!ist) continue;
    total++;
    days.add(ist.toISOString().slice(0, 10));

    const h = ist.getHours();
    byHour[h] = (byHour[h] || 0) + 1;

    const area = (o.addressDetails && o.addressDetails.area) || o.area || o.city || 'Bengaluru Core';
    byArea[area] = (byArea[area] || 0) + 1;

    const slotKey = `${area} • ${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
    bySlot[slotKey] = (bySlot[slotKey] || 0) + 1;
  }

  const nDays = days.size || 1;
  const hours = [];
  for (let h = 7; h <= 22; h++) {
    const count = byHour[h] || 0;
    const perDay = Math.round((count / nDays) * 10) / 10;
    const ridersNeeded = Math.max(1, Math.ceil(perDay));
    const label = `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
    hours.push({ hour: h, label, totalOrders: count, perDay, ridersNeeded });
  }

  const areas = Object.entries(byArea).map(([area, count]) => ({
    area,
    orders: count,
    pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
  })).sort((a, b) => b.orders - a.orders);

  const busiestSlots = Object.entries(bySlot).map(([slot, count]) => ({
    slot,
    orders: count
  })).sort((a, b) => b.orders - a.orders).slice(0, 5);

  const peakHours = [...hours].sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 3);

  return {
    summary: {
      totalOrders: total,
      daysTracked: nDays,
      ordersPerDay: Math.round((total / nDays) * 10) / 10,
      ridersNeededAtPeak: Math.max(...hours.map(h => h.ridersNeeded), 1)
    },
    areas,
    hours,
    peakHours,
    busiestSlots
  };
};

// Engine D: Cash on Delivery Audit
const computeCash = (data) => {
  const COD_TERMS = ['COD', 'CASH ON DELIVERY', 'CASH'];
  const userDict = {};
  for (const u of data.users || []) userDict[u.id] = u;

  const riderRows = {};
  let totalCod = 0;
  let totalDelivered = 0;
  let totalCashCollected = 0;
  let totalCashPending = 0;

  for (const o of data.orders || []) {
    const pm = String(o.paymentMethod || '').toUpperCase();
    const isCod = COD_TERMS.some(t => pm.includes(t));
    if (!isCod) continue;

    totalCod++;
    const rid = o.riderId;
    if (!rid) continue;

    if (!riderRows[rid]) {
      const u = userDict[rid] || {};
      riderRows[rid] = {
        riderId: rid,
        name: u.name || rid,
        phone: u.phone || '',
        codOrdersAssigned: 0,
        delivered: 0,
        pending: 0,
        cashCollected: 0,
        cashPending: 0,
        recordedCashInHand: u.cashInHand || 0,
        orders: []
      };
    }

    const r = riderRows[rid];
    r.codOrdersAssigned++;
    const price = Number(o.total || o.totalAmount || 0);
    const isDelivered = String(o.orderStatus || '').toUpperCase() === 'DELIVERED';

    if (isDelivered) {
      r.delivered++;
      totalDelivered++;
      const collected = Number(o.cashCollected !== undefined ? o.cashCollected : price);
      r.cashCollected += collected;
      totalCashCollected += collected;
      r.orders.push({ orderId: o.id, amount: price, status: 'DELIVERED' });
    } else {
      r.pending++;
      r.cashPending += price;
      totalCashPending += price;
      r.orders.push({ orderId: o.id, amount: price, status: 'IN_TRANSIT' });
    }
  }

  const riders = Object.values(riderRows).sort((a, b) => b.cashCollected - a.cashCollected);

  return {
    summary: {
      totalCodOrders: totalCod,
      deliveredCodOrders: totalDelivered,
      pendingCodOrders: totalCod - totalDelivered,
      totalCashCollected,
      totalCashPending
    },
    riders
  };
};

// Engine E: Rider Identity & Verification
const computeRiderIdCheck = (data) => {
  const riders = (data.users || []).filter(u => u.role === 'rider');
  const seenIds = {};

  // First pass: identify duplicates
  for (const r of riders) {
    const idVal = r.licenseNumber || r.aadhaarNumber || r.panNumber;
    if (idVal) {
      const clean = idVal.replace(/[\s-]+/g, '').toUpperCase();
      if (!seenIds[clean]) seenIds[clean] = [];
      seenIds[clean].push(r.name || r.id);
    }
  }

  const results = riders.map(r => {
    const idType = r.idDocType || (r.licenseNumber ? 'Driving License' : 'PAN');
    const idNum = r.licenseNumber || r.aadhaarNumber || r.panNumber || '';
    let status = 'PASSED';
    const reasons = [];

    // Check duplicate
    const clean = idNum.replace(/[\s-]+/g, '').toUpperCase();
    if (clean && seenIds[clean] && seenIds[clean].length > 1) {
      status = 'FAILED';
      reasons.push(`Identity number is shared across riders: ${seenIds[clean].join(', ')}`);
    }

    if (idType.toLowerCase().includes('pan')) {
      const res = checkPan(idNum, r.name);
      if (res.status === 'FAIL') status = 'FAILED';
      else if (res.status === 'WARN' && status !== 'FAILED') status = 'REVIEW';
      reasons.push(...res.reasons);
    } else if (idType.toLowerCase().includes('aadhaar')) {
      const res = checkAadhaar(idNum);
      if (res.status === 'FAIL') status = 'FAILED';
      reasons.push(...res.reasons);
    } else if (idType.toLowerCase().includes('license') || idType.toLowerCase().includes('dl')) {
      const res = checkDL(idNum);
      if (res.status === 'WARN' && status !== 'FAILED') status = 'REVIEW';
      reasons.push(...res.reasons);
    }

    return {
      riderId: r.id,
      name: r.name,
      idDocType: idType,
      idNumberMasked: idNum.length > 4 ? `••••••••${idNum.slice(-4)}` : idNum,
      approvalStatus: r.approvalStatus || 'pending_approval',
      governmentVerified: Boolean(r.emailVerified || r.govVerified),
      status,
      reasons
    };
  });

  return {
    summary: {
      totalChecked: results.length,
      passed: results.filter(r => r.status === 'PASSED').length,
      review: results.filter(r => r.status === 'REVIEW').length,
      failed: results.filter(r => r.status === 'FAILED').length
    },
    results
  };
};

// ==========================================
// 5. API ROUTES
// ==========================================

// GET /api/analytics/overview (All KPI cards & comprehensive dashboard snapshot)
router.get('/overview', (req, res) => {
  try {
    const { data, source } = getSourceData(req);
    const riderReport = computeRiderReport(data);
    const diagnosis = computeRiderOrCooler(data);
    const demand = computeDemand(data);
    const cash = computeCash(data);
    const idCheck = computeRiderIdCheck(data);

    res.json({
      success: true,
      source,
      timestamp: new Date().toISOString(),
      overview: {
        fleetOnTimePct: riderReport.summary.fleetOnTimeAverage,
        goodRidersCount: riderReport.riders.filter(r => r.stage === 'GOOD').length,
        poorRidersCount: riderReport.riders.filter(r => r.stage === 'POOR').length,
        suspectCoolersCount: diagnosis.suspectCoolersCount,
        defectiveCoolers: diagnosis.coolers.filter(c => c.suspect).map(c => c.coolerId),
        totalCodCashInHand: cash.summary.totalCashCollected,
        peakHoursText: demand.peakHours.map(h => `${h.label} (${h.perDay}/day)`).join(', '),
        topArea: demand.areas[0]?.area || 'Bengaluru',
        compliancePassedRiders: idCheck.summary.passed
      },
      riderReport,
      diagnosis,
      demand,
      cash,
      idCheck
    });
  } catch (err) {
    console.error('[Analytics] Overview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/rider-report
router.get('/rider-report', (req, res) => {
  try {
    const { data, source } = getSourceData(req);
    res.json({ success: true, source, ...computeRiderReport(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/rider-or-cooler
router.get('/rider-or-cooler', (req, res) => {
  try {
    const { data, source } = getSourceData(req);
    res.json({ success: true, source, ...computeRiderOrCooler(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/demand-check
router.get('/demand-check', (req, res) => {
  try {
    const { data, source } = getSourceData(req);
    res.json({ success: true, source, ...computeDemand(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/cash-check
router.get('/cash-check', (req, res) => {
  try {
    const { data, source } = getSourceData(req);
    res.json({ success: true, source, ...computeCash(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/rider-id-check
router.get('/rider-id-check', (req, res) => {
  try {
    const { data, source } = getSourceData(req);
    res.json({ success: true, source, ...computeRiderIdCheck(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
