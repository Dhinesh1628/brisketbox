# Customer-Facing Claims and Data Pending Business & Legal Confirmation

This document catalogs every marketing, legal, technical, and operational claim identified and removed from customer-facing interfaces during Phase 5 (Honest Data). In accordance with the project ground rules (*"Never invent certifications, reviews, ratings, sensor data, farm claims, or business facts"*), all unproven claims have been removed from the application and replaced with truthful defaults or withheld until verified.

---

## Banned Phrases Catalog

The following exact phrases are pending confirmation and are banned from all customer-facing UI, printed documents, meta tags, and the WhatsApp chatbot until verified:

- `24/7 Live`
- `24/7`
- `[Pending Verification`
- `GSTIN: 29AAECS4912J1Z8`
- `29AAECS4912J1Z8`
- `11224333000491`
- `11224330000491`
- `FSSAI-112243300`
- `FSSAI Certified`
- `FSSC 22000`
- `90-minute`
- `90-Minute`
- `90-min`
- `90 Mins`
- `90 mins`
- `in 90 minutes`
- `within 90 minutes`
- `15-Min Response Time`
- `100% Freshness Guarantee`
- `Freshness Guarantee`
- `Fresh Cut Guarantee`
- `Cold-Chain SLA`
- `Harbor Catch 4 AM`
- `Coastal Harbor Fresh Catch`
- `Farm Fresh`
- `IoT Monitored`
- `BLE Sensor Active`
- `IoT telemetry`
- `Hand-trimmed`
- `vacuum-sealed`
- `Artisanal`
- `Always Chilled`
- `certified`
- `Bio-Secured`
- `0°C to 4°C`
- `0°C - 4°C`
- `0°C–4°C`
- `0°C-4°C`
- `0-4°C`
- `between 0°C and 4°C`
- `1.8°C`
- `5.8°C`
- `0.6°C`
- `Thermal Breach Anomaly`
- `2 of 4 readings were above 4°C`
- `Suresh Patil`
- `Road No. 36, Jubilee Hills`
- `GoMeat`
- `Certified Supply`
- `images.unsplash.com`
- `Mangalore Deep Harbor`
- `Dindigul Certified Farms`
- `Hosur Semi-Intensive Bio-Farms`
- `Malnad Organic Grazing Highlands`
- `Coimbatore Bio-Secured Poultry Farm`
- `Telangana Farm Verified Batch`
- `zero preservatives`
- `farm-fresh`
- `live GPS`
- `temperature telemetry`
- `Today in 90 mins`
- `Save ₹`
- `vs market`

---

## 1. Food Safety & Regulatory Certifications

| File | Original Line | Removed Claim / Quote | Required Confirmation Before Reinstating |
|---|---|---|---|
| `frontend/src/App.tsx` | 337 | `"[Pending Verification - See CLAIMS_TO_CONFIRM.md]"` / `"GSTIN: 29AAECS4912J1Z8"` | Verified FSSAI license copy and registered GSTIN registration certificate for the legal entity. |
| `frontend/src/pages/AdminDashboardPage.tsx` | 1485 | `"FSSAI: 11224333000491 \| GSTIN: 29AAECS4912J1Z8"` | Verified FSSAI central license certificate and active GSTIN registration. |
| `frontend/src/utils/invoiceGenerator.ts` | 61 | `"FSSAI Central Lic: 11224333000491 \| GSTIN: 29AAECS4912J1Z8"` | Verified FSSAI license copy and registered GSTIN certificate. |
| `frontend/src/pages/ButcherStationPage.tsx` | 989 | `"FSSAI Certified"` | Verified FSSAI partner license documentation. |
| `frontend/src/pages/ButcherStationPage.tsx` | 2361 | `"11224330000491"` / `"FSSAI-112243300"` | Authenticated FSSAI license certificate from shop owner. |
| `frontend/src/components/LegalModals.tsx` | 35 | `"...under our FSSAI food safety compliance."` | Clarify exact statutory food safety dispute policy and license jurisdiction. |
| `frontend/src/components/ColdBoxScannerModal.tsx` | 67 | `"...within FSSC-22000 safe limits."` | ISO 22000 / FSSC 22000 cold-chain thermal audit verification. |

---

## 2. Delivery Promises, SLAs & Guarantees

| File | Original Line | Removed Claim / Quote | Required Confirmation Before Reinstating |
|---|---|---|---|
| `frontend/index.html` | 13, 22, 29 | `"Doorstep delivery in 90 minutes across Bengaluru & Hyderabad."` | Audit real dark store radius and fleet traffic dispatch SLAs. |
| `frontend/src/components/CheckoutModal.tsx` | 148 | `"90 Mins Doorstep Delivery"` / `"Express in 90 Mins"` | Dynamic routing engine ETA integration instead of fixed promises. |
| `frontend/src/components/WhatsAppChatbotModal.tsx` | 34 | `"90-Min Dispatch"` | Fleet operational commitment for instant chat bookings. |
| `frontend/src/components/RiderAnalyticsDashboard.tsx` | 86, 285 | `"90-minute delivery promise"` / `"(90-Minute Commitment)"` | Historical SLA delivery statistics from production fleet logs. |
| `frontend/src/pages/ButcherStationPage.tsx` | 993 | `"• 90 Mins Dispatch"` | Station fulfillment turnaround SLA proof. |
| `backend/services/aiChatbot.js` | 61, 79, 161, 326, 371 | `"90-minute express doorstep delivery"`, `"about 90 minutes"`, `"within 90 minutes"` | Confirmed fleet dispatch capability across all operating cities. |
| `frontend/src/components/LocationSelectorModal.tsx` | 540 | `"express 90-min chilled delivery"` | Real-time dispatch ETA rather than static promise. |
| `frontend/src/components/ContactModal.tsx` | 94 | `"15-Min Response Time"` | Support desk staffing and verified SLA for ticket turnarounds. |
| `frontend/src/components/ContactModal.tsx` | 129 | `"100% Freshness Guarantee"` | Policy legal wording alignment. |
| `frontend/src/App.tsx` | 347 | `"Freshness Guarantee"` | Clarified customer quality terms. |
| `frontend/src/components/HeroSection.tsx` | 578 | `"Fresh Cut Guarantee"` | Quality inspection checklist documentation. |
| `frontend/src/components/LegalModals.tsx` | 35 | `"Freshness & Cold-Chain SLA"`, `"freshness guarantee"` | Legal terms agreement on carrier cold-chain conditions. |

---

## 3. Cold Chain "0°C to 4°C", IoT & Telemetry Claims

| File | Original Line | Removed Claim / Quote | Required Confirmation Before Reinstating |
|---|---|---|---|
| `frontend/src/components/HeroSection.tsx` | 70, 101, 310, 442, 460, 568 | `"0°C to 4°C Packaging"`, `"Chilled at 0°C to 4°C"`, `"0°C Sealed"` | Real-time sensor verification and calibrated logger documentation. |
| `frontend/src/components/CategorySection.tsx` | 82 | `"chilled strictly at 0°C to 4°C"` | Temperature data from cold hub staging. |
| `frontend/src/components/ProductDetailModal.tsx` | 254, 290, 421 | `"0°C Raw Cut"`, `"0°C - 4°C FreshChilled™"`, `"0°C to 4°C"` | Continuous cold room telemetry proof. |
| `frontend/src/pages/CatalogPage.tsx` | 259, 474, 634, 732 | `"0°C Raw Cut"`, `"Always Chilled at 0°C to 4°C"`, `"0°C to 4°C chilled"` | Temperature logger certificate for courier deliveries. |
| `frontend/src/pages/CoolerReturnsPage.tsx` | 87 | `"0°C–4°C IoT Monitored"` | Physical IoT hardware deployment and active cellular/BLE connection. |
| `frontend/src/pages/CustomerDashboardPage.tsx` | 193, 815 | `"0°C to 4°C FreshSeal"`, `"keeping cuts at 0°C to 4°C"` | Customer box passive insulation testing report. |
| `frontend/src/pages/OrderTrackingPage.tsx` | 274, 531, 544, 703 | `"0°C - 4°C Standard"`, `"0°C to 4°C"` | Calibrated sensor audit logs. |
| `frontend/src/pages/RiderDeliveryPage.tsx` | 583, 1377 | `"0°C to 4°C ThermalVault"`, `"Audit Cold-Chain (0°C - 4°C Rule)"` | Field audit guidelines for courier bag handovers. |
| `frontend/src/pages/ButcherStationPage.tsx` | 276, 1799, 2080, 2365, 2681, 3006 | `"0°C to 4°C Fresh"`, `"0°C to 4°C Blast Chilled"`, `"(0°C to 4°C Chilled)"` | Commercial walk-in chiller data logger logs. |
| `frontend/src/components/Navbar.tsx` | 139, 434, 813 | `"0°C to 4°C Chilled Cuts"`, `"0°C - 4°C Fresh"`, `"Chilled fresh at 0°C to 4°C"` | Laboratory chilling profile validation. |
| `backend/services/aiChatbot.js` | 61, 85, 161, 313, 339, 371 | `"0°C to 4°C"`, `"blast-chilled to 0°C"`, `"delivered at 0°C"` | Third-party cold-chain certification. |
| `frontend/src/components/LegalModals.tsx` | 29, 35 | `"between 0°C and 4°C"` | Customer contract terms confirmation. |
| `frontend/src/components/ColdBoxScannerModal.tsx` | 63, 73, 83, 93 | Hardcoded `"1.8°C"`, `"5.8°C"`, `"0.6°C"`, `"Thermal Breach Anomaly"` | Real telemetry sensors / staff recorded temperature checks only. |

---

## 4. Product Buzzwords, Sourcing & Origin Claims

| File | Original Line | Removed Claim / Quote | Required Confirmation Before Reinstating |
|---|---|---|---|
| `frontend/src/components/CategorySection.tsx` | 19 | `"Farm Fresh"` | Certified farm supplier documentation. |
| `frontend/src/pages/CatalogPage.tsx` | 800 | `"Harbor Catch 4 AM"` | Harbor procurement receipts and landing logs. |
| `frontend/src/components/Navbar.tsx` | 106 | `"Coastal Harbor Fresh Catch"` | Daily harbor lot documentation. |
| `frontend/src/components/HeroSection.tsx` | 78, 275, 393, 579 | `"Artisanal Batch • Hand Trimmed"`, `"vacuum-sealed"` | Verified artisan butcher accreditation and vacuum packaging specification. |
| `frontend/src/components/CategorySection.tsx` | 82 | `"Hand-trimmed, vacuum-sealed cuts"` | Specification sheets from cutting stations. |
| `frontend/src/pages/ButcherStationPage.tsx` | 79, 705, 3005, 3132 | `"Artisanal"`, `"Hand-trimmed"` | Certified artisan butcher trade registration. |
| `backend/services/aiChatbot.js` | 195, 215, 339, 355, 371 | `"Mangalore & Malabar Coast"`, `"Pasture-Raised"`, `"Bio-Secured"`, `"Antibiotic-free"` | Traceable livestock sourcing bills and organic grazing verification. |

---

## 5. Fake Fallbacks & Synthetic Identities

| File | Original Line | Removed Synthetic Data | Required Confirmation Before Reinstating |
|---|---|---|---|
| `frontend/src/pages/RiderDeliveryPage.tsx` | 666 | Placeholder `"Suresh Patil"` | Use neutral `"Full Name"` placeholder. |
| `frontend/src/pages/ButcherStationPage.tsx` | 2655 | Fallback courier name `"Suresh Patil"` | Real assigned courier partner identity from database. |
| `frontend/src/pages/ButcherStationPage.tsx` | 76, 849, 993, 1189 | `"Road No. 36, Jubilee Hills, Hyderabad"` | Partner's actual registered business location. |
| `frontend/src/components/LocationSelectorModal.tsx` | 30, 315, 767 | `"Jubilee Hills, Road No. 36"` | Allow user to choose their actual area / city. |
| `frontend/src/components/Navbar.tsx` | 573 | `"Jubilee Hills, 500033"` | Neutral city locality data. |
| `frontend/src/pages/ButcherStationPage.tsx` | 787, 825, 923, 3005 | `"GoMeat"`, `"shop@gomeat.in"` | Authorized brand partner identification. |
| `frontend/src/pages/CustomerDashboardPage.tsx` | 194 | `"Certified Supply"` | Real supplier lot ID and batch tracking. |
| `frontend/src/pages/AdminDashboardPage.tsx` | 114 | `images.unsplash.com` external image URL | Locally hosted product assets (`/images/products/...`). |
