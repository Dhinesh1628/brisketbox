import argparse
import json
from collections import defaultdict
from statistics import mean, median

from scan_common import IST, load_data, parse_time

# ---- Rules (change these numbers if the rule changes) ----
PROMISE_MIN = 90      # delivery promise: order placed -> delivered within 90 minutes
GOOD_AT = 90          # on-time % of 90 or more        -> GOOD
WATCH_AT = 75         # on-time % of 75 to 89          -> WATCH
                      # on-time % below 75             -> POOR


def stage_for(on_time_pct):
    if on_time_pct >= GOOD_AT:
        return "GOOD"
    if on_time_pct >= WATCH_AT:
        return "WATCH"
    return "POOR"


def stamp(order, key):
    """Read one stage time from the order (lifecycleTimestamps first, then the order itself)."""
    value = (order.get("lifecycleTimestamps") or {}).get(key) or order.get(key)
    return parse_time(value) if value else None


def minutes(a, b):
    if a is None or b is None:
        return None
    return (b - a).total_seconds() / 60


def get_rider_report(data=None):
    data = data or load_data()
    riders = {u["id"]: {"riderId": u["id"], "name": u.get("name"), "cashInHand": u.get("cashInHand", 0)}
              for u in data.get("users", []) if u.get("role") == "rider"}

    rows = defaultdict(lambda: {"total": [], "pickup_to_door": [], "pack_wait": [], "days": defaultdict(int),
                                "orders": 0, "no_delivery_time": 0, "no_pickup_time": 0})
    missing = {"delivered": 0, "noDeliveredAt": 0, "noPickedUpAt": 0}
    in_progress = 0

    for o in data.get("orders", []):
        rid = o.get("riderId")
        if not rid:
            continue
        if str(o.get("orderStatus", "")).upper() != "DELIVERED":
            in_progress += 1
            continue
        r = rows[rid]
        r["orders"] += 1
        missing["delivered"] += 1

        placed = parse_time(o["createdAt"]) if o.get("createdAt") else None
        packed, picked, delivered = stamp(o, "packedAt"), stamp(o, "pickedUpAt"), stamp(o, "deliveredAt")

        if delivered is None:
            r["no_delivery_time"] += 1
            missing["noDeliveredAt"] += 1
        else:
            r["days"][delivered.astimezone(IST).date()] += 1
            t = minutes(placed, delivered)
            if t is not None:
                r["total"].append(t)
        if picked is None:
            r["no_pickup_time"] += 1
            missing["noPickedUpAt"] += 1
        else:
            d = minutes(picked, delivered)
            if d is not None:
                r["pickup_to_door"].append(d)
            w = minutes(packed, picked)
            if w is not None:
                r["pack_wait"].append(w)

    total_orders = sum(r["orders"] for r in rows.values()) or 1
    result = []
    for rid, r in rows.items():
        info = riders.get(rid, {"riderId": rid, "name": rid, "cashInHand": None})
        on_time = sum(1 for t in r["total"] if t <= PROMISE_MIN)
        pct = on_time / len(r["total"]) * 100 if r["total"] else None
        result.append({
            "riderId": rid, "name": info["name"], "deliveries": r["orders"],
            "share": round(r["orders"] / total_orders * 100, 1),
            "activeDays": len(r["days"]),
            "perDay": round(r["orders"] / len(r["days"]), 1) if r["days"] else None,
            "avgDeliveryMin": round(mean(r["total"]), 1) if r["total"] else None,
            "medianDeliveryMin": round(median(r["total"]), 1) if r["total"] else None,
            "avgPickupToDoorMin": round(mean(r["pickup_to_door"]), 1) if r["pickup_to_door"] else None,
            "avgWaitAfterPackMin": round(mean(r["pack_wait"]), 1) if r["pack_wait"] else None,
            "onTimePct": round(pct, 1) if pct is not None else None,
            "lateCount": len(r["total"]) - on_time,
            "stage": stage_for(pct) if pct is not None else "NO DATA",
            "cashInHand": info["cashInHand"],
            "noDeliveryTime": r["no_delivery_time"], "noPickupTime": r["no_pickup_time"],
        })
    result.sort(key=lambda x: (x["onTimePct"] is None, -(x["onTimePct"] or 0)))
    return {
        "rule": {"promiseMinutes": PROMISE_MIN, "goodAt": GOOD_AT, "watchAt": WATCH_AT},
        "summary": {"ridersReported": len(result), "deliveredOrders": missing["delivered"],
                    "ordersNotDeliveredYet": in_progress},
        "missingData": missing,
        "riders": result,
    }


def _v(x, unit=""):
    return "n/a" if x is None else f"{x}{unit}"


def print_report(r):
    s, m = r["summary"], r["missingData"]
    print("\n" + "=" * 72)
    print("  RIDER REPORT")
    print("=" * 72)
    print(f"Riders: {s['ridersReported']}   |   Delivered orders: {s['deliveredOrders']}   "
          f"|   Not delivered yet: {s['ordersNotDeliveredYet']}")
    print(f"Promise: delivered within {PROMISE_MIN} minutes of the order.")

    warnings = []
    if m["noDeliveredAt"]:
        warnings.append(f"{m['noDeliveredAt']} delivered orders have no delivery time, so they are "
                        f"left out of every time figure.")
    if m["noPickedUpAt"]:
        warnings.append(f"{m['noPickedUpAt']} delivered orders have no pickup time, so they are "
                        f"left out of the pickup-to-door figure.")
    if warnings:
        print("\nWARNING: some data is missing, so these figures are not complete.")
        for w in warnings:
            print(f"  - {w}")

    if not r["riders"]:
        print("\nNo delivered orders with a rider yet.")
    for x in r["riders"]:
        print("\n" + "-" * 72)
        print(f"{x['name']} ({x['riderId']})   STAGE: {x['stage']}")
        print("-" * 72)
        print(f"Deliveries: {x['deliveries']} ({x['share']}% of all)   |   "
              f"Active days: {x['activeDays']}   |   Per day: {_v(x['perDay'])}")
        print(f"Order to door:       average {_v(x['avgDeliveryMin'], ' min')}, "
              f"median {_v(x['medianDeliveryMin'], ' min')}")
        print(f"Pickup to door:      average {_v(x['avgPickupToDoorMin'], ' min')}")
        print(f"Wait after packing:  average {_v(x['avgWaitAfterPackMin'], ' min')}")
        print(f"On time (within {PROMISE_MIN} min): {_v(x['onTimePct'], '%')}   "
              f"(late: {x['lateCount']})")
        print(f"Cash in hand: {_v(x['cashInHand'], '')}")
    print("\n" + "=" * 72)
    print(f"Stages: GOOD = {GOOD_AT}% or more on time, WATCH = {WATCH_AT}-{GOOD_AT - 1}%, "
          f"POOR = below {WATCH_AT}%.")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Rider report: delivery time, on-time %, deliveries per day")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    ap.add_argument("--data", help="path to data.json")
    a = ap.parse_args()
    report = get_rider_report(load_data(a.data))
    if a.json:
        print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    else:
        print_report(report)