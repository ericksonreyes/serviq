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
**list ↔ detail** pairings where the right pane is a viewer, not a form —
but see the next rule: dense detail views graduate to their own route.

## Dense detail views get their own page

When a detail view carries a heavy action set — lifecycle transitions,
assignment, status changes, threaded replies, multi-form editors — it
graduates from a side pane or row expansion to a **dedicated route**, so
the list stays a fast-scanning directory and the detail page gets full
width. This is the standard across every portal:

- Tenant console: `/dispatch/jobs/:jobId`, `/dispatch/requests/:requestId`,
  `/support/cases/:caseId`, `/admin/services/:serviceId`
- Tenant console task pages: `/dispatch/remittances/{turn-in,digital,
  deposit-batch}` — the index is the records ledger plus entry cards; the
  same convention applies to multi-task desks (one money task per page,
  not stacked forms)
- Platform admin: `/providers/:id`
- Customer portal: `/requests/:id` · Service-agent app: `/jobs/:id`

Rows navigate rather than select; deep links (`?job=<id>`-style params from
older surfaces) redirect to the canonical route. Inside the page, group
read-only detail and actions into separate cards side by side on wide
screens, and offer a `← Back to …` link to the parent list.

What stays inline: **quick row actions** (a checkbox set, a 3-field edit,
an accept/reject decision — Users' role panel, Evidence's review panel) and
**form-over-list create/edit swaps** (Plans, Areas). The dividing line is
whether the surface is a single focused action or a multi-surface detail
view the user dwells in.

References: `dispatch/Jobs.jsx` → `JobDetail.jsx`, `dispatch/Requests.jsx`
→ `RequestDetail.jsx`, `support/Cases.jsx` → `CaseDetail.jsx`,
`admin/Services.jsx` → `admin/ServiceDetail.jsx`.

## No phantom columns

A row holds exactly what it needs — a single card spans the full row;
it is never capped (`max-w-*`) into a narrow column beside dead
whitespace, which reads as a broken two-column layout. Grids earn their
columns: `sm:grid-cols-2` inside a form for related field pairs (Areas'
name/description), `xl:grid-cols-2` between cards when two surfaces
genuinely work side by side (JobDetail's detail/actions split). The
same applies vertically — a page of stacked single-purpose cards uses
`space-y-4` rows, not a grid that squeezes unrelated forms side by side.

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

## Progress reads without color

Steppers, timelines, and status sequences must convey position through
**shape and iconography, not hue alone** — roughly 1 in 12 men have some
form of color-vision deficiency, so a green-vs-grey pill distinction can
carry no information for them.

- Completed steps: filled background **plus a check glyph** (`✓`).
- Current step: filled background plus a **non-color emphasis** — ring,
  font weight, or a marker glyph.
- Upcoming steps: **bordered and unfilled** (outline treatment), muted
  text — the absence of fill is itself the "not yet" signal.
- Connectors (`→`, chevrons, lines) may tint with progress as a secondary
  cue, but never as the only one.

Reference implementation: the dispatch Jobs workflow stepper
(`tenant-console …/dispatch/Jobs.jsx`). The same rule applies to
`StatusBadge`-style status chips when several sit side by side — consider
a glyph or shape difference whenever color is the only thing separating
"good" from "bad" states.

## Density over chrome

- Reuse the shared primitives (`Card`, `input`, `btn*`, `label`) rather than
  bespoke containers.
- Pagination controls render at the **top and bottom** of lists — never make a
  user scroll through a full page to reach Next.
- The 16px font floor applies to all portals; distinguish secondary text with
  color/weight (`text-slate-500`), not size.
