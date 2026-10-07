# Shifa Medical Store — Pharmacy Management System

A complete production-quality **Medical Store / Pharmacy Management Web Application** built with Next.js 16, designed for Pakistani pharmacies.

## Features (20 modules)

1. **Authentication** — Login, logout, RBAC with Admin/Manager/Cashier roles, granular permissions
2. **Dashboard** — Real-time KPIs (today's sales, profit, purchases, expenses, cash, credit, payables), 7-day performance chart, payment-method pie chart, top-selling medicines, alerts panel
3. **POS / Billing** — Fast keyboard-friendly pharmacy checkout (F2 search, F9 checkout), FEFO expiry-aware batch selection, multiple payment methods (Cash/Bank/Easypaisa/JazzCash/Other), multi-payment support, partial/credit sales, printable invoice
4. **Medicine Inventory** — Full CRUD for medicines + categories + batches, batch-level stock & expiry tracking, stock movement history
5. **Smart Stock Management** — Auto-detected Out-of-stock / Low / Overstock states, fast-moving vs slow-moving analysis, reorder suggestions with editable quantity
6. **Expiry Management** — FEFO-aware expiry tracking with 5 categories (Expired / 30 / 60 / 90 / Safe), CSV export, estimated loss calculation
7. **Purchases** — Supplier purchase invoices with schemes (e.g. 10+1 free), effective cost calculation, automatic batch creation and stock update
8. **Suppliers** — Supplier CRUD with purchase history, payments, returns, outstanding payables
9. **Customers** — Customer CRUD with sales history, payments, printable statements
10. **Credit / Udhaar** — Outstanding credit tracking, record payments (full/partial), apply to specific invoice, print statement
11. **Sales Returns** — Find invoice, select items, restore stock, track reason
12. **Purchase Returns** — Return to supplier, restore stock, update supplier balance
13. **Expenses** — 7 categories (Rent/Electricity/Salaries/Internet/Transport/Maintenance/Misc), daily/monthly tracking, category breakdown
14. **Reports** — 7 report types (Sales/Profit/Inventory/Purchases/Customers/Suppliers/Expenses) with date ranges, CSV/PDF export, print, sortable tables, charts
15. **Smart Owner Report** — Business overview with health score (0-100), best/slow-moving medicines, auto-generated insights from real data
16. **Notifications / Alerts Center** — Aggregated alerts for low stock, expiry, expired, credit due, supplier payable
17. **Global Search** — Search across medicines, customers, suppliers, invoices, purchases, batches
18. **Audit Log** — Tracks login/logout, all CRUD actions with user, timestamp, IP
19. **Backup / Restore** — JSON backup download, restore settings, factory reset (with double confirmation)
20. **Settings** — Pharmacy info, invoice settings, stock thresholds, tax, backup — with Users and Roles management

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Database**: Prisma ORM + SQLite
- **UI**: Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons + Recharts
- **Auth**: Cookie-based session (HMAC-signed) with pbkdf2 password hashing
- **State**: React context (auth, nav) + React Query-style fetch in components

## Project Structure

```
prisma/
  schema.prisma       # 24 Prisma models
  seed.ts             # Demo data seeder
  fix-sequence.ts     # One-off helper to fix invoice sequence counters
src/
  app/
    api/              # 27+ API routes (auth, medicines, sales, purchases, reports, etc.)
      auth/
      auth/me/
      medicines/[id]/batches
      sales/[id]/return
      purchases/[id]/
      invoices/print/[id]
      ... (and many more)
    layout.tsx
    page.tsx           # The single user-visible route (SPA shell)
    globals.css
  components/
    ui/                # shadcn/ui components
    views/             # 20 view components (dashboard, pos, inventory, etc.)
    app-shell.tsx      # Sidebar + topbar + footer layout
    login.tsx
    ui-helpers.tsx     # PageHeader, StatCard, formatPKR, etc.
  lib/
    auth.ts            # session, password hashing, permissions
    auth-context.tsx   # client-side auth context
    nav-context.tsx    # client-side nav state (SPA view switching)
    audit.ts           # audit log + invoice number generation
    settings.ts        # settings cache + defaults
    db.ts              # Prisma client
mini-services/         # (reserved for websocket mini-services)
```

## Environment

`.env`:
```
DATABASE_URL=file:/home/z/my-project/db/custom.db
SESSION_SECRET=pharmacy-secret-key-change-in-prod  # (uses default if not set)
```

## Installation & Setup

```bash
# 1. Install dependencies
bun install

# 2. Initialize database & generate Prisma client
bun run db:push

# 3. Seed demo data
bun run db:seed

# 4. (optional) Fix invoice sequence counters after re-seeding
bun run prisma/fix-sequence.ts
```

## Demo Login Accounts

| Role     | Email                  | Password      |
|----------|------------------------|---------------|
| Admin    | admin@pharmacy.pk      | admin123      |
| Manager  | manager@pharmacy.pk    | manager123    |
| Cashier  | cashier@pharmacy.pk    | cashier123    |

## Development

```bash
bun run dev       # Start dev server on port 3000
bun run lint      # Run ESLint
bun run db:push   # Push schema changes to database
bun run db:seed   # Seed demo data
bun run db:reset  # Reset migrations
```

## Production Build

```bash
bun run build     # Build standalone production bundle
bun run start     # Start production server
```

> Note: This sandbox runs the dev server on port 3000. External access is via the Preview Panel — do not visit `localhost:3000` directly.

## Pharmacy Business Logic

### Stock Calculation (per batch)
```
Current stock = Initial + Purchases + Free Qty + Customer Returns − Sold − Supplier Returns
```

### FEFO (First Expiry First Out)
When a sale is made without specifying a batch, the system picks batches in order of earliest expiry first (skipping expired batches unless admin override setting `stock.allowNegative=true`).

### Effective Cost (Purchase Schemes)
For a scheme like "10+1 free" with qty=10 and freeQty=1:
```
effectiveCost = (qty * purchasePrice - discount) / (qty + freeQty)
```
This is what gets stored as `batch.purchasePrice` for accurate profit calculation.

### Invoice Number Generation
Auto-incrementing with collision detection — checks existing records and skips ahead if a number is already taken (useful after manual data import).

### Permission System
28 granular permissions (e.g., `pos.use`, `inventory.edit`, `inventory.delete`, `credit.payment`, `users.manage`). Roles have a JSON array of allowed permissions. The Admin role has all permissions and cannot be deleted.

### Audit Trail
Every meaningful action (login, sale, purchase, return, payment, expense, CRUD on entities, settings changes, backup/restore) is logged with user, timestamp, IP, and details.

## Security

- Passwords hashed with pbkdf2 (100,000 iterations, SHA-512, 16-byte salt)
- Sessions: HMAC-SHA256 signed tokens in httpOnly cookies (7-day expiry)
- Server-side permission checks on every API route
- No sensitive data exposed in client bundles
- Input validation on all API endpoints

## Limitations & Notes

- **Single route**: The app is SPA-style — only `/` is user-visible. All "navigation" is client-side view switching. (This is a project constraint, not a limitation of the design.)
- **Backup/Restore**: The "Restore" function restores settings only (full transaction restore is intentionally limited for safety). Use factory reset + re-seed for a clean slate.
- **WebSocket**: Not used in this version. The dashboard auto-refreshes via polling (every 30s for alerts, manual refresh elsewhere).
- **PDF export**: Implemented via print-to-PDF (opens a print-optimized window; user selects "Save as PDF" in the print dialog). True server-side PDF generation would require a library like PDFKit or Puppeteer (out of scope for the sandbox).
- **Currency**: All amounts are in PKR (Pakistani Rupee). The currency symbol "Rs" is used; the currency code is configurable in Settings.

## License

© 2026 Shifa Medical Store. Internal pharmacy management system.
