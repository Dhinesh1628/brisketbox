import argparse
import json
import math
from collections import Counter, defaultdict

from scan_common import IST, load_data, parse_time

# ---- Rules (change these numbers if the rule changes) ----
ORDERS_PER_RIDER_PER_HOUR = 1    # one rider can handle about this many orders in an hour
PEAK_HOURS_SHOWN = 3             # how many busiest hours to list
TOP_SLOTS_SHOWN = 5              # how many busiest area + hour combinations to list


def area_of(order):
    return (order.get("addressDetails") or {}).get("area") or order.get("area")


def hour_label(h):
    return f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}"


def get_demand(data=None):
    data = data or load_data()
    by_area, by_hour, by_slot = Counter(), Counter(), Counter()
    days, no_area, total = set(), 0, 0
    day_hour = defaultdict(set)

    for o in data.get("orders", []):
        if not o.get("createdAt"):
            continue
        t = parse_time(o["createdAt"]).astimezone(IST)
        total += 1
        days.add(t.date())
        by_hour[t.hour] += 1
        day_hour[t.hour].add(t.date())
        a = area_of(o)
        if a:
            by_area[a] += 1
            by_slot[(a, t.hour)] += 1
        else:
            no_area += 1

    n_days = len(days) or 1
    hours = []
    for h in sorted(by_hour):
        per_day = by_hour[h] / n_days
        hours.append({"hour": h, "label": hour_label(h), "orders": by_hour[h],
                      "perDay": round(per_day, 1),
                      "ridersNeeded": max(1, math.ceil(per_day / ORDERS_PER_RIDER_PER_HOUR))})
    peak = sorted(hours, key=lambda x: -x["orders"])[:PEAK_HOURS_SHOWN]
    return {
        "rule": {"ordersPerRiderPerHour": ORDERS_PER_RIDER_PER_HOUR},
        "summary": {"orders": total, "days": len(days), "ordersWithoutArea": no_area,
                    "ordersPerDay": round(total / n_days, 1),
                    "ridersNeededAtPeak": max((h["ridersNeeded"] for h in hours), default=0)},
        "areas": [{"area": a, "orders": n, "pct": round(n / sum(by_area.values()) * 100, 1)}
                  for a, n in by_area.most_common()],
        "hours": hours,
        "peakHours": peak,
        "busiestSlots": [{"area": a, "hour": hour_label(h), "orders": n}
                         for (a, h), n in by_slot.most_common(TOP_SLOTS_SHOWN)],
    }


def print_demand(r):
    s = r["summary"]
    print("\n" + "=" * 72)
    print("  DEMAND REPORT")
    print("=" * 72)
    if not s["orders"]:
        print("No orders yet.")
        print("=" * 72 + "\n")
        return
    print(f"Orders: {s['orders']}   |   Days: {s['days']}   |   Average per day: {s['ordersPerDay']}")
    if s["ordersWithoutArea"]:
        print(f"WARNING: {s['ordersWithoutArea']} orders have no area saved, so they are left out of the area figures.")

    print("\n" + "-" * 72)
    print("ORDERS BY AREA")
    print("-" * 72)
    biggest = max((a["orders"] for a in r["areas"]), default=1)
    for a in r["areas"]:
        print(f"{a['area']:<16} {a['orders']:>4}  {a['pct']:>5}%  {'#' * round(a['orders'] / biggest * 30)}")
    if not r["areas"]:
        print("No area data.")

    print("\n" + "-" * 72)
    print("ORDERS BY HOUR (average per day, riders needed at that hour)")
    print("-" * 72)
    biggest = max(h["orders"] for h in r["hours"])
    for h in r["hours"]:
        print(f"{h['label']:>6}  {h['perDay']:>5}/day  riders: {h['ridersNeeded']:<2} "
              f"{'#' * round(h['orders'] / biggest * 30)}")

    print("\n" + "-" * 72)
    print("BUSIEST HOURS: " + ", ".join(f"{h['label']} ({h['perDay']}/day)" for h in r["peakHours"]))
    print(f"RIDERS NEEDED AT PEAK: {s['ridersNeededAtPeak']} "
          f"(assuming one rider handles {ORDERS_PER_RIDER_PER_HOUR} order per hour)")
    if r["busiestSlots"]:
        print("\nBUSIEST AREA + HOUR:")
        for x in r["busiestSlots"]:
            print(f"  {x['area']} at {x['hour']}: {x['orders']} orders")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Demand report: orders by area and hour, riders needed")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    ap.add_argument("--data", help="path to data.json")
    a = ap.parse_args()
    report = get_demand(load_data(a.data))
    if a.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_demand(report)