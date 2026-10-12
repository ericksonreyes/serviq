# Layout Conventions

This document records layout decisions for ServIQ portals — the rules that keep
screens consistent as new pages are added.

## Lists are the default view; forms swap in via a CTA

When a page combines a create form with a data table or card list, the **list
renders by default**. A call-to-action on the list (e.g. "New user" in the
`Card` `actions` slot) opens the form, which **replaces** the list — the table
is hidden while the form is open, not shown above or beside it.

```text
Default view                    After CTA ("New …")
┌──────────────────────────┐    ┌──────────────────────────┐
│ List            [New …]  │    │ Form (full width)        │
│ ───────────              │    │   [Submit]  [Cancel]     │
│  rows…                   │    │                          │
└──────────────────────────┘    └──────────────────────────┘
```

- The form renders **full width** in the list's place — never in a right-hand
  rail, never above a still-visible table.
- Every form exposes a **Cancel** affordance; submit and cancel both restore
  the list view (submit also reloads the list so the new row appears).
- Modules with several entry points use a small view-state (`'create' |
  'invite' | null`) so only one surface shows at a time — e.g. Customers has
  "Add customer" and "Invite by email" CTAs on the one list.
- Edit flows may stay inline (row → detail pane) or reuse the same swap —
  what matters is that create forms are not permanently mounted.

Rationale: the list is what the user came to see; a permanently-mounted form
spends the page's best real estate on an action taken once per visit at most.
CTA-gating also keeps the form discoverable without training — the action
lives on the list it feeds.

This applies to every portal — tenant console admin pages (users, customers,
agents, services, areas, cases) and platform admin surfaces (providers, plans,
platform users/roles). Two-column `xl:` splits remain appropriate for
**list ↔ detail** pairings (e.g. jobs list + job detail), where the right pane
is a viewer, not a form.

## Empty detail panes don't render

A list ↔ detail split only exists once a row is selected. Before that, the
list takes the full width — never render an empty "Select a …" placeholder
card to fill the second column. The grid activates with the selection
(`${sel ? 'xl:grid-cols-2' : ''}`), so selecting a row splits the view and the
viewer appears beside the list it came from.

## Row actions are links

Per-record actions inside a table row or list-row card render as **text
links** — the shared `link` (violet) / `linkDanger` (red) constants, never
`btn`-family buttons. Real buttons stay for detail-pane action clusters,
form footers, and card-level CTAs. The split is semantic: a link acts on a
record in a list; a button acts on a page-level workflow or form.

## Dates read as "October 14, 2026"

Displayed dates always use the **long month** — `MMMM D, YYYY` for dates,
plus a 12-hour time for timestamps. Never render raw ISO (`2026-10-14`) or
numeric `10/14/2026` strings: the day/month order is ambiguous and reads as
debug output. Recurring year-less values (stored `MM-DD`) render as
`October 13`. Use the shared helpers — `fmtDay`, `fmtMonthDay`, `fmtDate`
(tenant console `ui.jsx`) and `fmtDay`, `fmtDateTime` (agent/customer portal
`format.js`) — which parse date-only strings locally (no timezone shift) and
pass through unparseable values like free-text preferred schedules rather
than crashing. Date *inputs* stay `type="date"` — the policy covers display.

## Density over chrome

- Reuse the shared primitives (`Card`, `input`, `btn*`, `label`) rather than
  bespoke containers.
- Pagination controls render at the **top and bottom** of lists — never make a
  user scroll through a full page to reach Next.
- The 16px font floor applies to all portals; distinguish secondary text with
  color/weight (`text-slate-500`), not size.
