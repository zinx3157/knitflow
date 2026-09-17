# KnitFlow OS — Full Unified Manufacturing SaaS for a Knitwear Company

**Every department. One roof. One flow.**

KnitFlow OS is a self-contained SaaS ERP built for a knitwear manufacturer with its own
**Merchandising, Sampling, Purchase, Dye House, Production, Quality Control, Shipping,
Inventory, Finance, HR and Management** — all working the same live data under one login.

## Run it

```bash
cd knitflow
npm start        # or: node server.js
```

Open the app on the served port (default **3000**). Zero dependencies — plain Node.js.

## Demo logins (password for all: `knit123`)

| Department | Email | What they do in the app |
|---|---|---|
| Management | `admin@knitflow.io` | Full access to every console + settings & users |
| Merchandising | `merch@knitflow.io` | Orders, buyers, auto requisitions, sample requests |
| Purchase | `purchase@knitflow.io` | Approve requisitions, raise/receive POs, adjust stock |
| Dye House | `dye@knitflow.io` | Batch kanban, recipes, machine load, shade QC |
| Production | `production@knitflow.io` | Floors WIP (knit → cut → sew → finish), machine registry, daily output logs |
| Quality Control | `qc@knitflow.io` | Inline & final AQL inspections — pass/fail gates |
| Shipping | `shipping@knitflow.io` | Bookings, status flow, printable export docs |
| Finance | `finance@knitflow.io` | Costing sheets & margins, invoices, payments, expenses |
| HR | `hr@knitflow.io` | Employees, daily attendance, monthly payroll |

## The automated thread ("one roof" workflow)

1. **Merchandising** creates an order → yarn (qty × kg/pc + 10% waste) and trims are
   **auto-requisitioned** to Purchase. Sample requests (proto/fit/PP/TOP) track buyer approvals.
2. **Purchase** approves → POs → receives goods → stock updates live → when all materials are in,
   the order auto-advances to *Ready for Dyeing*.
3. **Dye House** schedules batches → yarn auto-issues from the store → QC pass moves the order to
   *Fabric Ready* (failures go to rework).
4. **Production** opens a production order → daily output logged per floor (knitting, cutting,
   sewing, finishing) with live progress bars → completion hands the order to *Packing*.
5. **Quality Control** runs inline & final AQL inspections with defect counts (critical/major/minor).
6. **Shipping** opens the shipment, books the vessel, sails it (*Shipped*), closes it (*Delivered*)
   — printing packing lists & commercial invoices that use the company profile from Settings.
7. **Finance** issues invoices against shipments, records TT/LC payments, tracks receivables &
   overdue, maintains costing sheets with live margin calculation, and books expenses.
8. **HR** manages employees, daily attendance (P/A/L) and monthly payroll by department.
9. Every action lands in the shared **Activity Thread**; the dashboard, KPIs and alerts update live.

## Modules (14)

- **Dashboard** — 7 live KPIs, pipeline chart, cross-department "needs attention" queue, alerts
- **Merchandising** — orders, colorways, 9-stage tracker, per-order history
- **Sampling & Development** — proto/fit/PP/TOP sample register with buyer approval flow
- **Purchase** — requisitions → POs → receiving, supplier directory
- **Dye House** — kanban (Queued → Dyeing → Drying → QC → Passed/Rework), machine load, recipes
- **Production Floors** — WIP per order, 4-floor progress, daily output logging, machine registry
- **Quality Control** — inspection register, defect analytics, pass/fail actions
- **Shipping** — shipment cards, status flow, printable packing lists & commercial invoices
- **Inventory & Store** — yarn/dyes/chemicals/trims, reorder alerts, adjustments
- **Finance & Costing** — invoices, payments, receivables, costing sheets with margins, expenses
- **HR & Payroll** — employees, attendance editor, payroll summary by department
- **Reports Center** — 8 printable live reports (order book, shipments, WIP, dye, spend, stock,
  receivables, payroll)
- **Team & Partners** — internal directory, buyers, suppliers
- **Settings** — company profile (drives export documents), users & role management

## Tech

- Backend: plain Node.js `http` server, REST API, JSON persistence (`data/db.json`) with
  automatic schema migration on upgrade
- Frontend: dependency-free vanilla JS SPA, custom CSS design system, SVG charts
- Auth: token sessions + role-based permissions per department

## Put it on GitHub / host it

See **GITHUB-SETUP.md** for click-by-click instructions. Quick version:

```bash
git init && git add . && git commit -m "KnitFlow OS"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/knitflow.git
git push -u origin main
```

**Free hosting:** the `github-pages/index.html` file is the whole app in one page — enable
GitHub Pages (Settings → Pages) and your ERP gets a public URL like
`https://YOUR-USERNAME.github.io/knitflow/github-pages/index.html`.

To rebuild the portable file after changing the code: `python3 build_standalone.py`.
