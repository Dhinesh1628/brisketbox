# Continuous Integration & Automated Security Architecture (Phase 7)

BrisketBox uses a comprehensive GitHub Actions CI pipeline and local pre-flight test harness to guarantee that every push and pull request automatically verifies system integrity, security policies, data honesty, and bundle builds.

---

## 1. What Each Check Does

### A. Backend CI Job (`backend`)
* **Environment Setup**: Configures Node.js based strictly on the `.nvmrc` version specification.
* **Cached Monorepo Dependencies**: Runs clean installations (`npm ci` and `npm --prefix backend ci`) utilizing GitHub Actions npm dependency cache.
* **MongoDB Memory Server Cache**: Caches the MongoDB binary at `~/.cache/mongodb-binaries` across workflow runs, accelerating ephemeral replica set provisioning.
* **Backend File Syntax Validation (`scripts/check-backend-syntax.js`)**: Executes `node --check` across all backend JavaScript and module files to catch syntax and import errors prior to execution.
* **Dependency Vulnerability Audit**: Runs `npm --prefix backend audit --audit-level=high`, instantly failing if high or critical vulnerabilities are introduced.
* **Zero-Secret Test Environment**: Executes all backend test suites using isolated fake credentials (`JWT_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`).
* **Test Isolation & Independent Execution**:
  - `multi-process-hardening.test.js`: Proves dual-process synchronization, concurrency, idempotency, and atomic stock isolation on MongoDB replica set transactions.
  - `phase5-honest-data.test.js`: Validates telemetry honesty, banning fabricated temperatures, SLA guarantees, minute-based delivery promises, and unverified certification claims.
  - `security-audit-fixes.test.js`: Validates tamper-proof delivery PIN handover, role gates, and signature verification.
  - Phase 1–4 suites: Verify authentication, authorization, state transitions, and pricing.
  - **Data Safety Guard**: Tests never write to or modify `backend/data.json`.

### B. Frontend CI Job (`frontend`)
* **Environment Setup**: Configures Node.js from `.nvmrc` and installs clean dependencies (`npm --prefix frontend ci`).
* **Frontend Dependency Audit**: Executes `npm --prefix frontend audit --audit-level=high` to block front-end supply-chain vulnerabilities.
* **Code Linting (`oxlint`)**: Fast, multi-threaded lint validation across all frontend React, TypeScript, and styling files.
* **Typecheck & Production Build**: Runs `tsc -b` (strict TypeScript validation) and `vite build` to guarantee compilation and output bundle validity.

### C. Secret Scanning (`gitleaks`)
* **Gitleaks Action**: Scans git commit history and diffs on every push using `.gitleaks.toml`.
* **Strict Allowlist**: Permits only explicitly documented fake mock placeholders (e.g. `rzp_test_placeholder`, `ci_fake_jwt_secret`). Any real API keys, private certificates, or unapproved tokens fail the workflow.

### D. Automated Dependency Maintenance (`dependabot`)
* **Weekly Automated Updates (`.github/dependabot.yml`)**:
  - `npm` updates for `/backend`
  - `npm` updates for `/frontend`
  - `npm` updates for monorepo root `/`
  - `github-actions` updates for CI workflows

---

## 2. Running Verification Locally

You can run the exact same set of checks locally before committing or pushing changes:

```bash
# Run all checks locally (syntax, security audits, frontend lint/build, and all backend tests)
npm run check
```

You can also run individual components:

```bash
# 1. Check syntax on all backend files
npm run check:syntax

# 2. Run dependency audits (fails on high/critical)
npm run audit

# 3. Lint and build frontend
npm run test:frontend

# 4. Run all backend tests (multi-process hardening, honest data, security)
npm run test:backend
```

---

## 3. Required GitHub Repository Settings (Branch Protection)

Once this branch is merged to GitHub, enforce CI gating by enabling these branch protection rules in GitHub:

1. In your GitHub repository, navigate to **Settings** → **Branches**.
2. Under **Branch protection rules**, click **Add branch ruleset** or **Add rule**.
3. Set **Branch name pattern** to `main`.
4. Enable the following settings:
   - **Require a pull request before merging**
     - Require approvals (optional: 1 approval).
   - **Require status checks to pass before merging**:
     - Check **Require branches to be up to date before merging**.
     - In the status checks search bar, search and select each of the CI jobs:
       - `Backend CI (Syntax, Tests & Audit)`
       - `Frontend CI (Lint, Typecheck, Build & Audit)`
       - `Secret Scanning (Gitleaks)`
   - **Do not allow bypassing the above settings**: Blocks administrators and team members from pushing directly to `main` without passing CI.
5. Click **Create** or **Save changes**.
