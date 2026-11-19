import argparse
import json
import random
from collections import Counter
from datetime import datetime, timedelta, timezone

# Makes FAKE data in the same structure as backend/data.json (and the BrisketBox spec),
# so the rider reports can be built and tested before real deliveries exist.
# It writes a NEW file. Your real data.json is never touched.

IST = timezone(timedelta(hours=5, minutes=30))
random.seed(7)


def z(dt):
    """datetime -> '2026-11-01T04:30:00.000Z' (UTC, as the app saves times)"""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


# ---------------- riders (the 4 from the spec; contact details are made up) ----------------
# slow = how much slower the rider tends to be, late_p = chance of a late delivery
RIDERS = [
    {"id": "usr_rider_pending", "name": "Mahesh Kumar", "vehicle": "EV 2-Wheeler (Ola S1 Pro)", "plate": "KA-03-HA-4412",
     "hub": "Mahadevapura Dark Hub", "rating": 4.85, "licence": "KA0320180004412", "slow": 1.25, "late_p": 0.28},
    {"id": "usr_rider_3", "name": "Ramesh Gowda", "vehicle": "EV 2-Wheeler (TVS iQube)", "plate": "KA-05-EJ-1920",
     "hub": "Indiranagar Regional Hub", "rating": 4.88, "licence": "KA0520190001920", "slow": 1.0, "late_p": 0.12},
    {"id": "usr_rider_1", "name": "Suresh Patil", "vehicle": "EV 2-Wheeler (Ather 450X)", "plate": "KA-04-EV-819",
     "hub": "Bengaluru Central Hub", "rating": 4.92, "licence": "KA0420170000819", "slow": 0.95, "late_p": 0.08},
    {"id": "usr_rider_4", "name": "Imran Pasha", "vehicle": "EV 2-Wheeler (Bajaj Chetak EV)", "plate": "KA-01-MJ-7744",
     "hub": "Koramangala Cold Hub", "rating": 4.95, "licence": "KA0120210007744", "slow": 0.9, "late_p": 0.07},
]
ROTATION = ["usr_rider_pending", "usr_rider_3", "usr_rider_1", "usr_rider_4"]   # round-robin order from the spec
RIDER_BY_ID = {r["id"]: r for r in RIDERS}
SUNDAY_OFF = {"usr_rider_1"}     # this rider does not work Sundays, so he gets fewer orders

# area -> travel distance factor
AREAS = {"Marathahalli": 1.0, "Indiranagar": 0.8, "Koramangala": 0.9, "Whitefield": 1.5,
         "HSR Layout": 1.1, "Mahadevapura": 1.0, "Jayanagar": 1.2, "Bellandur": 1.3}

# ---------------- coolers ----------------
COOLER_IDS = [f"BOX-BLR-{n}" for n in range(101, 113)]
FAULTY_COOLER = "BOX-BLR-109"      # this one warms up on most deliveries, with every rider
HUBS = ["Bengaluru Regional Hub Depot", "Mahadevapura Dark Hub"]


def temperature_series(n, kind):
    base = random.uniform(0.5, 1.6)
    if kind == "above":
        final = random.uniform(4.4, 7.8)
    elif kind == "below":
        base, final = 0.8, random.uniform(-2.0, -0.4)
    else:
        final = random.uniform(base + 0.3, 3.5)
    out = []
    for i in range(n):
        t = base + (final - base) * (i / max(n - 1, 1)) + random.gauss(0, 0.1)
        if kind == "ok":
            t = min(max(t, 0.1), 3.9)
        out.append(round(t, 1))
    if kind == "above":
        out[-1] = max(out[-1], 4.3)
    if kind == "below":
        out[-1] = min(out[-1], -0.3)
    return out


def build(days, start_date, out_path):
    users = []
    for i, r in enumerate(RIDERS, 1):
        users.append({
            "id": r["id"], "name": r["name"], "role": "rider", "approvalStatus": "approved",
            "phone": f"+91 90000 0000{i}", "vehicleType": r["vehicle"], "vehicleNumber": r["plate"],
            "upiId": f"test{i}@testbank", "assignedHub": r["hub"], "rating": r["rating"],
            "isOnline": True, "idDocType": "Driving License", "licenseNumber": r["licence"],
            "govVerified": False, "cashInHand": 0,
        })

    coolers = [{"id": c, "qrCode": f"GOMEAT-{c}", "model": "ThermalVault 18L - Reusable EPP Cold-Gel Box",
                "status": "available", "assignedHub": HUBS[i % 2], "cyclesUsed": 0}
               for i, c in enumerate(COOLER_IDS)]
    cooler_by_id = {c["id"]: c for c in coolers}

    hour_weights = dict(zip(range(8, 22), [2, 3, 5, 8, 10, 9, 6, 4, 4, 6, 9, 10, 7, 3]))
    hours, weights = list(hour_weights), list(hour_weights.values())

    # ---- create the order times first, then process in time order ----
    stamps = []
    for d in range(days):
        day = start_date + timedelta(days=d)
        for _ in range(random.randint(8, 13)):
            h = random.choices(hours, weights)[0]
            stamps.append(datetime(day.year, day.month, day.day, h, random.randint(0, 59),
                                   random.randint(0, 59), tzinfo=IST))
    stamps.sort()

    orders, rot = [], 0
    n_total = len(stamps)
    for idx, created in enumerate(stamps):
        # ---- round-robin rider (skip riders who are off that day) ----
        for _ in range(len(ROTATION)):
            rid = ROTATION[rot % len(ROTATION)]
            rot += 1
            if not (created.weekday() == 6 and rid in SUNDAY_OFF):
                break
        rider = RIDER_BY_ID[rid]
        area = random.choices(list(AREAS), [3, 3, 3, 2, 3, 2, 2, 2])[0]
        cooler = random.choice(COOLER_IDS)
        rush = 1.25 if created.hour in (12, 13, 19, 20) else 1.0

        # ---- stage times ----
        confirmed = created + timedelta(seconds=random.randint(5, 40))
        assigned = confirmed + timedelta(minutes=random.uniform(0.5, 4))
        packed = confirmed + timedelta(minutes=random.uniform(12, 24))
        picked = packed + timedelta(minutes=random.uniform(3, 10) * rider["slow"])
        out_for = picked + timedelta(minutes=random.uniform(1, 3))
        travel = random.uniform(10, 26) * AREAS[area] * rider["slow"] * rush
        is_late = random.random() < rider["late_p"]
        if is_late:
            travel += random.uniform(35, 65)
        delivered = out_for + timedelta(minutes=travel)

        # ---- temperature pattern (planted so reports can find it) ----
        p_above = 0.02
        if cooler == FAULTY_COOLER:
            p_above = 0.75
        elif travel > 45:
            p_above = 0.30
        roll = random.random()
        kind = "above" if roll < p_above else ("below" if roll < p_above + 0.01 else "ok")

        order_num = 5001 + idx
        in_progress = idx >= n_total - 5
        stage = random.choice(["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "OUT_FOR_DELIVERY"]) \
            if in_progress else "DELIVERED"

        life = {"confirmedAt": z(confirmed), "assignedAt": z(assigned)}
        order_of = ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]
        reached = order_of.index(stage)
        if reached >= 2:
            life["packedAt"] = z(packed)
        if reached >= 3:
            life["pickedUpAt"] = z(picked)
        if reached >= 4:
            life["outForDeliveryAt"] = z(out_for)
        if reached >= 5:
            life["deliveredAt"] = z(delivered)

        # ---- temperature log: a reading every 5 minutes from packing to delivery ----
        temp_log = []
        if reached >= 2:
            end = delivered if reached >= 5 else packed + timedelta(minutes=10)
            times, t = [], packed
            while t < end:
                times.append(t)
                t += timedelta(minutes=5)
            times.append(end)
            values = temperature_series(len(times), kind if reached >= 5 else "ok")
            picked_logged = False
            for k, (tm, val) in enumerate(zip(times, values)):
                if k == 0:
                    ev = f"Packed in sanitized box {cooler}"
                elif k == len(times) - 1 and reached >= 5:
                    ev = "Delivered & verified via 4-digit PIN"
                elif not picked_logged and reached >= 3 and tm >= picked:
                    ev, picked_logged = "Rider picked up the box", True
                else:
                    ev = "Cold-vault probe reading"
                temp_log.append({"recordedAt": z(tm), "time": tm.astimezone(IST).strftime("%H:%M"),
                                 "temp": val, "event": ev})

        subtotal = random.choice([289, 389, 549, 599, 689, 799, 1099, 1799])
        method = random.choices(["UPI (Google Pay)", "razorpay", "COD"], [4, 4, 2])[0]
        orders.append({
            "id": f"ORD-{order_num}", "orderNumber": f"ORD-{order_num}",
            "orderStatus": "DELIVERED" if reached >= 5 else "CONFIRMED",
            "lifecycleStatus": stage, "status": "Delivered" if reached >= 5 else stage.replace("_", " ").title(),
            "createdAt": z(created), "updatedAt": z(delivered if reached >= 5 else created),
            "city": "Bengaluru",
            "deliveryAddress": f"Flat {random.randint(101, 909)}, {area}, Bengaluru",
            "addressDetails": {"city": "Bengaluru", "state": "Karnataka", "area": area},
            "subtotal": subtotal, "deliveryFee": 0, "total": subtotal, "paymentMethod": method,
            "cashCollected": subtotal if (method == "COD" and reached >= 5) else 0,
            "riderId": rid, "riderFullName": rider["name"], "riderVehicle": f"{rider['vehicle']} ({rider['plate']})",
            "coolerId": cooler, "coolerModel": cooler_by_id[cooler]["model"],
            "lifecycleTimestamps": life, "tempLog": temp_log,
        })
        cooler_by_id[cooler]["cyclesUsed"] += 1 if reached >= 5 else 0

    # ---- plant a few data gaps, like real data has (so the missing-data warning can be tested) ----
    delivered_orders = [o for o in orders if o["orderStatus"] == "DELIVERED"]
    for o in random.sample(delivered_orders[:80], 6):
        o["lifecycleTimestamps"].pop("pickedUpAt", None)

    # cash each rider holds = cash-on-delivery collected on the last day
    last_day = max(o["createdAt"][:10] for o in orders)
    for u in users:
        u["cashInHand"] = sum(o["cashCollected"] for o in orders
                              if o["riderId"] == u["id"] and o["createdAt"][:10] == last_day)

    data = {"_note": "FAKE TEST DATA made by make_rider_test_data.py. Not real.",
            "users": users, "coolers": coolers, "orders": orders}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)

    # ---- summary ----
    done = [o for o in orders if o["orderStatus"] == "DELIVERED"]
    late = sum(1 for o in done if (datetime.fromisoformat(o["lifecycleTimestamps"]["deliveredAt"].replace("Z", "+00:00"))
                                   - datetime.fromisoformat(o["lifecycleTimestamps"]["confirmedAt"].replace("Z", "+00:00"))
                                   ).total_seconds() > 90 * 60)
    fail = sum(1 for o in done if any(r["temp"] < 0 or r["temp"] > 4 for r in o["tempLog"]))
    print(f"Created {out_path}")
    print(f"  Orders: {len(orders)} ({len(done)} delivered, {len(orders) - len(done)} still in progress)")
    print(f"  Orders per rider: {dict(Counter(o['riderFullName'] for o in orders))}")
    print(f"  Delivered later than 90 min: {late} ({late / len(done) * 100:.0f}%)")
    print(f"  Deliveries with a temperature failure: {fail} ({fail / len(done) * 100:.0f}%)")
    print("  Planted patterns: Mahesh Kumar is slower and late more often; "
          f"cooler {FAULTY_COOLER} fails on most deliveries; long trips fail more often.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Make fake rider and order data for testing the reports")
    ap.add_argument("--days", type=int, default=28, help="how many days of orders (default 28)")
    ap.add_argument("--out", default="rider_test_data.json", help="file to create")
    a = ap.parse_args()
    build(a.days, datetime(2026, 10, 19, tzinfo=IST), a.out)