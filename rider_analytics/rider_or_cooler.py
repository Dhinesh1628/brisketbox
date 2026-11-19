import argparse
import json
from collections import defaultdict

from compliance_scan import HIGH, LOW, SENSOR_MAX, SENSOR_MIN   # same 0-4°C rule as the other scripts
from scan_common import load_data, parse_time

# ---- Rules (change these numbers if the rule changes) ----
MIN_DELIVERIES = 5      # a cooler or rider needs at least this many deliveries to be judged
COOLER_FAIL_PCT = 40    # a cooler failing this % of deliveries (or more) is suspect
RIDER_TIMES_AVG = 2     # a rider failing this many times the normal rate is suspect
RIDER_MIN_PCT = 15      # ...and at least this % of their deliveries
LONG_TRIP_MIN = 45      # a trip (pickup to door) longer than this is a "long trip"


def failed_delivery(order):
    """True if any reading of this delivery went below LOW or above HIGH (broken-sensor values ignored)."""
    logs = order.get("tempLog") or order.get("temperatureLog") or []
    for r in logs:
        t = r.get("temp")
        if isinstance(t, (int, float)) and SENSOR_MIN <= t <= SENSOR_MAX and (t < LOW or t > HIGH):
            return True
    return False


def trip_minutes(order):
    life = order.get("lifecycleTimestamps") or {}
    a, b = life.get("pickedUpAt"), life.get("deliveredAt")
    if not a or not b:
        return None
    return (parse_time(b) - parse_time(a)).total_seconds() / 60


def pct(part, whole):
    return round(part / whole * 100, 1) if whole else None


def get_diagnosis(data=None):
    data = data or load_data()
    names = {u["id"]: u.get("name", u["id"]) for u in data.get("users", []) if u.get("role") == "rider"}

    deliveries = []
    no_log = 0
    for o in data.get("orders", []):
        if str(o.get("orderStatus", "")).upper() != "DELIVERED" or not o.get("riderId") or not o.get("coolerId"):
            continue
        if not (o.get("tempLog") or o.get("temperatureLog")):
            no_log += 1
            continue
        deliveries.append({"rider": o["riderId"], "cooler": o["coolerId"],
                           "failed": failed_delivery(o), "trip": trip_minutes(o)})

    # ---- 1. coolers: does a cooler fail with many different riders? ----
    by_cooler = defaultdict(list)
    for d in deliveries:
        by_cooler[d["cooler"]].append(d)
    coolers, bad_coolers = [], set()
    for cid, ds in by_cooler.items():
        fails = [d for d in ds if d["failed"]]
        riders_failed = {d["rider"] for d in fails}
        rate = pct(len(fails), len(ds))
        suspect = len(ds) >= MIN_DELIVERIES and rate >= COOLER_FAIL_PCT
        if suspect:
            bad_coolers.add(cid)
        coolers.append({"coolerId": cid, "deliveries": len(ds), "failed": len(fails), "failPct": rate,
                        "ridersAffected": len(riders_failed), "suspect": suspect})
    coolers.sort(key=lambda c: (-c["failPct"], c["coolerId"]))

    # ---- 2. riders: judged only on deliveries with the suspect coolers taken out ----
    clean = [d for d in deliveries if d["cooler"] not in bad_coolers]
    normal = pct(sum(1 for d in clean if d["failed"]), len(clean)) or 0
    by_rider = defaultdict(list)
    for d in clean:
        by_rider[d["rider"]].append(d)
    riders = []
    for rid, ds in by_rider.items():
        fails = [d for d in ds if d["failed"]]
        rate = pct(len(fails), len(ds))
        coolers_failed = {d["cooler"] for d in fails}
        suspect = (len(ds) >= MIN_DELIVERIES and rate >= RIDER_MIN_PCT and rate >= normal * RIDER_TIMES_AVG
                   and len(coolers_failed) >= 3)
        riders.append({"riderId": rid, "name": names.get(rid, rid), "deliveries": len(ds), "failed": len(fails),
                       "failPct": rate, "coolersAffected": len(coolers_failed), "suspect": suspect})
    riders.sort(key=lambda r: (-r["failPct"], r["riderId"]))

    # ---- 3. long trips: does the box warm up just because the trip is long? ----
    timed = [d for d in clean if d["trip"] is not None]
    long_t = [d for d in timed if d["trip"] > LONG_TRIP_MIN]
    short_t = [d for d in timed if d["trip"] <= LONG_TRIP_MIN]
    long_rate, short_rate = pct(sum(d["failed"] for d in long_t), len(long_t)), \
        pct(sum(d["failed"] for d in short_t), len(short_t))
    long_matters = (len(long_t) >= MIN_DELIVERIES and long_rate is not None and short_rate is not None
                    and long_rate >= max(short_rate * 2, RIDER_MIN_PCT))

    # ---- verdict lines ----
    verdicts = []
    for c in coolers:
        if c["suspect"]:
            if c["ridersAffected"] >= 2:
                verdicts.append(f"COOLER: {c['coolerId']} failed {c['failed']} of {c['deliveries']} deliveries "
                                f"with {c['ridersAffected']} different riders. The cooler is the problem. Discard or repair it.")
            else:
                verdicts.append(f"CHECK: {c['coolerId']} failed {c['failed']} of {c['deliveries']} deliveries, "
                                f"but only with 1 rider. Check the cooler and that rider.")
    for r in riders:
        if r["suspect"]:
            verdicts.append(f"RIDER: {r['name']} failed {r['failed']} of {r['deliveries']} deliveries "
                            f"({r['failPct']}%) across {r['coolersAffected']} different coolers, "
                            f"while the normal rate is {normal}%. The rider is the problem.")
    if long_matters:
        verdicts.append(f"LONG TRIPS: {long_rate}% of trips over {LONG_TRIP_MIN} min failed, against "
                        f"{short_rate}% of shorter trips. Slow delivery is warming the box.")
    if not verdicts:
        verdicts.append("No clear pattern. Failures look random, not tied to one cooler, rider or trip length.")

    return {
        "rule": {"minDeliveries": MIN_DELIVERIES, "coolerFailPct": COOLER_FAIL_PCT,
                 "riderTimesAvg": RIDER_TIMES_AVG, "riderMinPct": RIDER_MIN_PCT, "longTripMin": LONG_TRIP_MIN},
        "summary": {"deliveriesChecked": len(deliveries), "withoutTemperatureLog": no_log,
                    "normalFailPctWithoutBadCoolers": normal,
                    "suspectCoolers": sorted(bad_coolers)},
        "verdicts": verdicts, "coolers": coolers, "riders": riders,
        "longTrips": {"longPct": long_rate, "shortPct": short_rate, "longCount": len(long_t), "shortCount": len(short_t)},
    }


def print_diagnosis(r):
    s = r["summary"]
    print("\n" + "=" * 72)
    print("  RIDER OR COOLER?")
    print("=" * 72)
    print(f"Deliveries checked: {s['deliveriesChecked']}   |   Suspect coolers: {len(s['suspectCoolers'])}")
    if s["withoutTemperatureLog"]:
        print(f"WARNING: {s['withoutTemperatureLog']} delivered orders have no temperature readings and were left out.")
    if not s["deliveriesChecked"]:
        print("\nNo delivered orders with a rider, a cooler and temperature readings yet.")
        print("=" * 72 + "\n")
        return

    print("\nVERDICT")
    print("-" * 72)
    for v in r["verdicts"]:
        print(f"* {v}")

    print("\n" + "-" * 72)
    print("COOLERS (worst first)   failed / deliveries, riders affected")
    print("-" * 72)
    for c in r["coolers"][:6]:
        flag = "   <-- suspect" if c["suspect"] else ""
        print(f"{c['coolerId']:<14} {c['failed']:>3} / {c['deliveries']:<3} ({c['failPct']}%)   "
              f"riders: {c['ridersAffected']}{flag}")

    print("\n" + "-" * 72)
    print(f"RIDERS (suspect coolers taken out; normal rate {s['normalFailPctWithoutBadCoolers']}%)")
    print("-" * 72)
    for x in r["riders"]:
        flag = "   <-- suspect" if x["suspect"] else ""
        print(f"{x['name']:<16} {x['failed']:>3} / {x['deliveries']:<3} ({x['failPct']}%)   "
              f"coolers: {x['coolersAffected']}{flag}")

    t = r["longTrips"]
    print("\n" + "-" * 72)
    print(f"TRIP LENGTH (pickup to door, over {LONG_TRIP_MIN} min = long)")
    print("-" * 72)
    print(f"Long trips:  {t['longPct']}% failed ({t['longCount']} trips)")
    print(f"Short trips: {t['shortPct']}% failed ({t['shortCount']} trips)")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="When a delivery goes out of 0-4°C: is it the rider or the cooler?")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    ap.add_argument("--data", help="path to data.json")
    a = ap.parse_args()
    report = get_diagnosis(load_data(a.data))
    if a.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_diagnosis(report)