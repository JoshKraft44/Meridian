# Meridian – Internal Profit Dashboard
Antler Addiction

---

## Project Goal

Build a standalone internal financial dashboard to summarize:

- Gross profit
- Net profit
- Fees
- Shipping charged vs shipping cost
- Refunds
- Shopify payouts (best effort)
- Manual expense events (sourcing + packaging)

Shopify-first.
Etsy integration later via OAuth/API.

Currency: CAD only.
Timezone: America/Edmonton.

---

## Engineering Principles

This project must look like it was written by a human developer, not auto-generated.
Comments should never use words like "we" or "your ____". Always write in my style, brief, but concise. Dont comment on small / useless details. 

### Code Style Requirements

- Do NOT over-abstract prematurely.
- Avoid unnecessary design patterns.
- Keep logic readable and direct.
- Prefer clarity over cleverness.
- Some small duplication is acceptable if it improves readability.
- Variable names should feel human and practical (e.g., `totalFeesCents`, not `aggregateFeeAccumulatorValue`).
- Avoid excessive comments explaining obvious things.
- Avoid AI-style verbose docstrings.
- Avoid large generic utility layers unless truly needed.
- No “enterprise boilerplate”.

### Version Control Behavior

Assume this project will be pushed to GitHub frequently.

When generating features:
- Suggest logical commit boundaries.
- Avoid massive 20-file dumps unless requested.
- Build incrementally.
- Structure features in stages (sync → DB → UI → polish).
- Code should look like it evolved naturally.

---

## Non-Negotiables

- SvelteKit monolith.
- No database queries in client-side code.
- All Prisma access in server files only.
- All money stored as integer cents.
- Idempotent sync (upsert only).
- Secrets only in environment variables.
- Payout logic must degrade gracefully if scopes unavailable.
- Shipping cost may be nullable.
- Missing shipping cost must be surfaced in UI.

---

## Stack

- SvelteKit + TypeScript
- Postgres
- Prisma
- TailwindCSS
- DM Sans (primary font)
- Accent color via CSS variable (default muted red)

---

## Folder Conventions

src/
  lib/
    db/           → Prisma client
    server/       → Shopify sync logic
    components/   → UI components
    styles/       → theme tokens
  routes/
    (app)/        → authenticated pages
    api/          → server endpoints

---

## Data Model Overview

Core tables:

Platform
Order
  - platform
  - platformOrderId
  - orderDate
  - gross_revenue_cents
  - shipping_charged_cents
  - shipping_cost_cents (nullable)
  - taxes_cents
  - status

FeeLine
Refund
Payout
ExpenseEvent
sync_runs

Money stored in cents only.

---

## Profit Definitions

Gross Profit:
Sum of gross revenue (tax inclusion controlled via setting).
Default: taxes excluded.

Net Profit:
Gross
- platform fees
- shipping cost
+ shipping charged (if not already included)
- refunds
- ExpenseEvents (sourcing + packaging)

---

## UI Design Rules

Design characteristics must follow:

1. Smooth intentional motion (150–250ms ease)
2. Soft charcoal background (not pure black)
3. Subtle borders and layered cards
4. Rounded UI elements
5. Calm typography hierarchy
6. Accent color controlled centrally

UI should feel premium but understated.
No flashy animation.

---

## Integration Notes

Shopify:
- Uses Admin API token.
- Pull orders.
- Pull refunds.
- Pull payouts if available.
- Track sync runs.
- Handle rate limiting gracefully.

Etsy:
- Module stubbed for future OAuth integration.
- Clean boundary for later expansion.

---

## Output Expectations

When generating code:

- Output file-by-file.
- Avoid giant unexplained dumps.
- Keep explanations minimal.
- Implement sensible defaults.
- Document assumptions briefly if needed.
- Prioritize runnable code.

If uncertain about Shopify endpoints:
- Implement best effort.
- Clearly mark fallback behavior.
- Do not fabricate undocumented fields.

---

## Human Feel Reminder

This project is for learning and growth.
It should reflect real understanding.

Prefer:
- Thoughtful structure
- Realistic naming
- Incremental building
- Practical tradeoffs
- No non-human comments or comments addressing the user 

