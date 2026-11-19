import argparse
import json
import re
from collections import Counter
from datetime import datetime

# ------------------------------------------------------------------
# What this script does:  checks that a rider's ID LOOKS valid and is not reused.
# What it CANNOT do:      prove the ID is real. That needs a government KYC check
#                         (a licensed provider or DigiLocker). Riders get
#                         "Government check: DONE" only if their record has govVerified = true.
# ------------------------------------------------------------------

# ---- Verhoeff checksum (the check built into every real Aadhaar number) ----
_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]
_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def verhoeff_valid(number):
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def verhoeff_check_digit(number):
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return str(_INV[c])


# ---- Each check returns (status, reasons). status: OK, WARN or FAIL ----
PAN_TYPES = {"P": "individual", "C": "company", "H": "Hindu undivided family", "F": "firm",
             "A": "association", "T": "trust", "B": "body of individuals",
             "L": "local authority", "J": "artificial person", "G": "government"}


def check_pan(num, name):
    if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", num):
        return "FAIL", ["Not a valid PAN format (should be 5 letters, 4 digits, 1 letter, like ABCPK1234F)."]
    if num[3] not in PAN_TYPES:
        return "FAIL", [f"4th character '{num[3]}' is not a valid PAN holder type."]
    if num[3] != "P":
        return "FAIL", [f"This PAN belongs to a {PAN_TYPES[num[3]]}, not an individual rider."]
    words = [w for w in re.split(r"\s+", (name or "").strip()) if w]
    if words and num[4] not in {words[-1][0].upper(), words[0][0].upper()}:
        return "WARN", [f"5th character '{num[4]}' does not match the rider's name initial. "
                        f"Check the name on the PAN card."]
    return "OK", []


def check_aadhaar(num, name):
    if not re.fullmatch(r"[2-9][0-9]{11}", num):
        return "FAIL", ["Not a valid Aadhaar format (12 digits, not starting with 0 or 1)."]
    if not verhoeff_valid(num):
        return "FAIL", ["Aadhaar number fails its built-in checksum, so it is mistyped or fake."]
    return "OK", []


def check_dl(num, name):
    m = re.fullmatch(r"[A-Z]{2}[0-9]{2}((?:19|20)[0-9]{2})[0-9]{7}", num)
    if not m:
        return "WARN", ["Does not match the standard 15-character licence format "
                        "(state, RTO, year, number). Older licences can differ, so review it."]
    if int(m.group(1)) > datetime.now().year:
        return "FAIL", [f"Licence year {m.group(1)} is in the future."]
    return "OK", []


def check_voter(num, name):
    if not re.fullmatch(r"[A-Z]{3}[0-9]{7}", num):
        return "FAIL", ["Not a valid Voter ID format (3 letters followed by 7 digits)."]
    return "OK", []


CHECKS = {"PAN": check_pan, "AADHAAR": check_aadhaar, "DL": check_dl, "VOTER": check_voter}


def normalize_type(text):
    """Turn what the app saved (e.g. 'Driving License (Smart Card)', 'Aadhaar + DL') into PAN/AADHAAR/DL/VOTER."""
    t = str(text or "").upper()
    if re.search(r"\bDL\b|DRIVING|LICEN[CS]E", t):
        return "DL"            # a licence number is what the app stores, so it is checked as a licence
    if re.search(r"AADHA|\bUID\b", t):
        return "AADHAAR"
    if re.search(r"\bPAN\b", t):
        return "PAN"
    if re.search(r"VOTER|EPIC", t):
        return "VOTER"
    return None


def clean(num):
    return re.sub(r"[\s\-]", "", str(num or "")).upper()


def is_masked(num):
    return bool(re.search(r"[X*•]{4,}", num))


def show_masked(num):
    return "X" * max(len(num) - 4, 0) + num[-4:] if num else "(none)"


def check_riders(riders):
    prepared = []
    for r in riders:
        itype = normalize_type(r.get("idType") or r.get("idDocType"))
        num = clean(r.get("idNumber") or r.get("licenseNumber"))
        prepared.append((r, itype, num))

    # same ID number used by more than one rider
    counts = Counter(n for _, t, n in prepared if n and not is_masked(n))

    out = []
    for r, itype, num in prepared:
        reasons, status = [], "OK"

        def add(s, msgs):
            nonlocal status
            reasons.extend(msgs)
            if s == "FAIL" or (s == "WARN" and status == "OK"):
                status = s

        if not num:
            add("FAIL", ["No ID number was given."])
        elif itype is None:
            add("FAIL", [f"Unknown ID type '{r.get('idType') or r.get('idDocType')}'. "
                         f"Use PAN, Aadhaar, DL or Voter."])
        elif is_masked(num):
            add("WARN", ["ID number is stored masked, so it cannot be checked here. "
                         "It must be checked at registration."])
        else:
            s, msgs = CHECKS[itype](num, r.get("name"))
            add(s, msgs)
            if counts[num] > 1:
                others = [x.get("id") for x, _, n in prepared if n == num and x is not r]
                add("FAIL", [f"The same ID number is used by rider(s) {', '.join(map(str, others))}."])

        out.append({
            "riderId": r.get("id"), "name": r.get("name"),
            "idType": itype or r.get("idType") or r.get("idDocType"),
            "idNumber": show_masked(num), "approval": r.get("approvalStatus") or "n/a",
            "result": {"OK": "PASSED", "WARN": "REVIEW", "FAIL": "FAILED"}[status],
            "reasons": reasons,
            "governmentCheck": "DONE" if r.get("govVerified") is True else "NOT DONE",
        })
    return out


def summary(results):
    c = Counter(x["result"] for x in results)
    return {"ridersChecked": len(results), "PASSED": c["PASSED"], "REVIEW": c["REVIEW"], "FAILED": c["FAILED"],
            "governmentCheckDone": sum(1 for x in results if x["governmentCheck"] == "DONE")}


def print_report(results):
    s = summary(results)
    print("\n" + "=" * 72)
    print("  RIDER ID CHECK")
    print("=" * 72)
    print(f"Riders checked: {s['ridersChecked']}   |   FAILED: {s['FAILED']}   "
          f"REVIEW: {s['REVIEW']}   PASSED: {s['PASSED']}")
    print(f"Government verification done: {s['governmentCheckDone']} of {s['ridersChecked']}")
    print("Note: PASSED means the ID looks valid and is not reused. It does not prove the ID is real.")
    for label in ("FAILED", "REVIEW", "PASSED"):
        group = [x for x in results if x["result"] == label]
        if not group:
            continue
        print("\n" + "-" * 72)
        print(f"{label} ({len(group)})")
        print("-" * 72)
        for x in group:
            print(f"{x['riderId']}  {x['name']}  |  {x['idType']} {x['idNumber']}  |  "
                  f"Approval: {x['approval']}  |  Government check: {x['governmentCheck']}")
            for reason in x["reasons"]:
                print(f"    Why: {reason}")
    print("=" * 72 + "\n")


def demo_riders():
    aadhaar = "23456789012" + verhoeff_check_digit("23456789012")
    return [
        {"id": "R1", "name": "Ravi Kumar", "idType": "PAN", "idNumber": "ABCPK1234F"},
        {"id": "R2", "name": "Meena Iyer", "idType": "PAN", "idNumber": "ABCPS1234F"},
        {"id": "R3", "name": "Arjun Rao", "idType": "PAN", "idNumber": "ABCDE12345"},
        {"id": "R4", "name": "Sunil Gowda", "idType": "PAN", "idNumber": "ABCCG1234F"},
        {"id": "R5", "name": "Karthik S", "idType": "Aadhaar", "idNumber": aadhaar},
        {"id": "R6", "name": "Manjunath K", "idType": "Aadhaar", "idNumber": "123456789012"},
        {"id": "R7", "name": "Lakshmi N", "idType": "DL", "idNumber": "KA01 2011 0012345"},
        {"id": "R8", "name": "Pooja S", "idType": "DL", "idNumber": "KA01-2011"},
        {"id": "R9", "name": "Imran Khan", "idType": "Aadhaar", "idNumber": aadhaar},
        {"id": "R10", "name": "Deepa M", "idType": "Voter ID", "idNumber": "ABC1234567", "govVerified": True},
        {"id": "R11", "name": "Naveen R", "idType": "Aadhaar", "idNumber": "XXXX XXXX 3456"},
    ]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Check rider government IDs for valid format and reuse")
    ap.add_argument("--data", help="path to data.json (reads its riders)")
    ap.add_argument("--demo", action="store_true", help="use made-up sample riders")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    a = ap.parse_args()

    if a.demo:
        riders = demo_riders()
    else:
        from scan_common import load_data
        data = load_data(a.data)
        # riders are stored inside "users" with role = "rider"
        riders = data.get("riders") or [u for u in data.get("users", []) if u.get("role") == "rider"]
        if not riders:
            raise SystemExit("No riders found in data.json yet. Try:  python rider_id_check.py --demo")

    res = check_riders(riders)
    if a.json:
        print(json.dumps({"summary": summary(res), "riders": res}, indent=2, ensure_ascii=False))
    else:
        print_report(res)