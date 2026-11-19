import argparse
import json
from collections import defaultdict

from scan_common import load_data

# An order counts as cash on delivery if its payment method says so.
COD_WORDS = ("COD", "CASH ON DELIVERY", "CASH")


def is_cod(order):
    method = str(order.get("paymentMethod") or "").upper()
    return any(w in method for w in COD_WORDS)


def money(order):
    """Amount the customer pays in cash for this order."""
    return order.get("total") or 0


def get_cash_report(data=None):
    data = data or load_data()
    riders = {u["id"]: u for u in data.get("users", []) if u.get("role") == "rider"}
    rows = defaultdict(lambda: {"given": 0, "delivered": 0, "pending": 0,
                                "cashCollected": 0, "cashPending": 0, "list": []})
    cod_total, no_rider, missing_cash = 0, 0, 0

    for o in data.get("orders", []):
        if not is_cod(o):
            continue
        cod_total += 1
        rid = o.get("riderId")
        if not rid:
            no_rider += 1
            continue
        r = rows[rid]
        r["given"] += 1
        r["list"].append({"orderId": o.get("id"), "price": money(o),
                          "status": "Delivered" if str(o.get("orderStatus", "")).upper() == "DELIVERED" else "Not delivered yet"})
        if str(o.get("orderStatus", "")).upper() == "DELIVERED":
            r["delivered"] += 1
            collected = o.get("cashCollected")
            if not collected:
                missing_cash += 1          # delivered, but no cash amount saved
                collected = money(o)       # use the order total instead
            r["cashCollected"] += collected
        else:
            r["pending"] += 1
            r["cashPending"] += money(o)

    result = []
    for rid, r in rows.items():
        u = riders.get(rid, {})
        result.append({"riderId": rid, "name": u.get("name", rid), "codOrders": r["given"],
                       "delivered": r["delivered"], "notDeliveredYet": r["pending"],
                       "cashCollected": r["cashCollected"], "cashStillToCollect": r["cashPending"],
                       "cashInHandOnRecord": u.get("cashInHand"), "orders": r["list"]})
    result.sort(key=lambda x: -x["cashCollected"])
    return {
        "summary": {"codOrders": cod_total, "ridersWithCod": len(result),
                    "totalCashCollected": sum(x["cashCollected"] for x in result),
                    "ordersWithoutRider": no_rider, "deliveredWithoutCashAmount": missing_cash},
        "riders": result,
    }


def print_cash(r):
    s = r["summary"]
    delivered = sum(x["delivered"] for x in r["riders"])
    print("\n" + "=" * 72)
    print("  CASH ON DELIVERY REPORT")
    print("=" * 72)
    print(f"Cash on delivery orders: {s['codOrders']}")
    print(f"Delivered so far: {delivered}   |   Riders who took them: {s['ridersWithCod']}")
    warnings = []
    if s["ordersWithoutRider"]:
        warnings.append(f"{s['ordersWithoutRider']} cash on delivery orders have no rider yet.")
    if s["deliveredWithoutCashAmount"]:
        warnings.append(f"{s['deliveredWithoutCashAmount']} delivered cash orders have no cash amount saved, "
                        f"so the order total was used.")
    for w in warnings:
        print(f"WARNING: {w}")
    if not r["riders"]:
        print("\nNo rider has a cash on delivery order yet.")
    for x in r["riders"]:
        print("\n" + "-" * 72)
        print(f"{x['name']}")
        print("-" * 72)
        print(f"Cash on delivery orders taken:   {x['codOrders']}")
        print(f"Delivered:                       {x['delivered']}")
        print(f"Cash in his hand:                Rs {x['cashCollected']}")
        print(f"Left to deliver:                 {x['notDeliveredYet']} orders (Rs {x['cashStillToCollect']} still to collect)")
        print("Orders:")
        for o in x["orders"]:
            print(f"  {o['orderId']:<12} Rs {o['price']:<6} {o['status']}")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Cash on delivery: which riders hold how much cash")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    ap.add_argument("--data", help="path to data.json")
    a = ap.parse_args()
    report = get_cash_report(load_data(a.data))
    if a.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_cash(report)