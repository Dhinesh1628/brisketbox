import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runDailyAudit() {
  console.log('========================================================================');
  console.log('  DAILY FLEET & COLD-CHAIN INTEGRITY AUDIT');
  console.log('  ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST');
  console.log('========================================================================\n');

  // Load orders and users
  const orders = db.get('orders') || [];
  const users = db.get('users') || [];
  const coolers = db.get('coolers') || [];

  const riders = users.filter(u => u.role === 'rider');
  console.log(`[Fleet Audit] Active registered riders: ${riders.length}`);
  console.log(`[Order Audit] Total orders in system: ${orders.length}`);
  console.log(`[Cooler Audit] Total cold-chain boxes registered: ${coolers.length}\n`);

  // 1. Identify any coolers breaching 0-4°C
  const coolerBreaches = {};
  for (const o of orders) {
    if (!o.coolerId) continue;
    const logs = o.tempLog || o.temperatureLog || [];
    for (const l of logs) {
      if (typeof l.temp === 'number' && (l.temp < 0 || l.temp > 4)) {
        coolerBreaches[o.coolerId] = (coolerBreaches[o.coolerId] || 0) + 1;
      }
    }
  }

  const badCoolers = Object.entries(coolerBreaches).filter(([_, count]) => count >= 2);
  if (badCoolers.length > 0) {
    console.log('⚠️  COMPROMISED COOLERS REQUIRING ATTENTION:');
    badCoolers.forEach(([cid, count]) => {
      console.log(`   - Cooler ${cid}: ${count} temperature breaches detected`);
    });
  } else {
    console.log('✅  COLD-CHAIN HEALTH: All coolers complying with 0°C to 4°C window.');
  }

  // 2. Audit Cash in Hand
  console.log('\n💵  CASH ON DELIVERY (COD) FLEET BALANCES:');
  riders.forEach(r => {
    console.log(`   - ${r.name || r.id}: ₹${r.cashInHand || 0} cash in hand`);
  });

  // Save audit report
  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(reportsDir, `fleet-audit-${dateStr}.json`);
  const reportData = {
    date: dateStr,
    timestamp: new Date().toISOString(),
    totalOrders: orders.length,
    activeRiders: riders.length,
    compromisedCoolers: badCoolers.map(([cid, count]) => ({ coolerId: cid, breachCount: count })),
    ridersCashSummary: riders.map(r => ({ id: r.id, name: r.name, cashInHand: r.cashInHand || 0 }))
  };

  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📁  Audit snapshot saved to: ${reportPath}`);
  console.log('========================================================================\n');
}

runDailyAudit().catch(console.error);
