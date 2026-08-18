# Spinoscopy Dashboard Design System

## 1. Atmosphere & Identity

Spinoscopy is a calm, warm command center: clinically precise without feeling sterile.
The signature is dense personal data presented on quiet tonal surfaces, with orange used
only to show focus, action, or meaningful activity. Lo's screens add a restrained
mat-map character through compact labels, connected nodes, and training-density marks.

The dashboard remains an operational, dark-first clinical surface. Compact information
density and restrained agent accents keep status legible without turning the product
into a decorative control panel.

## 2. Color

The implementation source of truth is `app/globals.css`.

| Role | Token | Usage |
|---|---|---|
| Page | `--background` | App canvas |
| Primary text | `--foreground` | Titles and values |
| Card | `--card` | Contained data surfaces |
| Muted surface | `--muted` | Controls and secondary regions |
| Secondary text | `--muted-foreground` | Metadata and guidance |
| Border | `--border` | Quiet separation |
| Focus | `--ring` | Keyboard focus |
| Activity accent | Tailwind orange scale | Lo activity, selection, progress |
| Success | Tailwind green scale | Positive or completed states |
| Information | Tailwind blue scale | Gi and informational states |
| Warning | Tailwind amber scale | Attention and coach interest |
| Error | `--destructive` / Tailwind red scale | Errors and destructive actions |

Rules:
- Preserve the existing warm cream and warm charcoal palettes.
- Prefer semantic CSS tokens over raw colors.
- Orange is the only general interaction accent on Lo screens.
- Category colors may distinguish map layers, but never compete with the selected state.
- Agent accent colors remain product identity tokens.

## 3. Typography

| Level | Size | Weight | Usage |
|---|---|---|---|
| Page title | 20-24px | 600 | Primary page identity |
| Section title | 14-16px | 600 | Data-section anchors |
| Body | 14px | 400 | Explanations and actions |
| Small | 12px | 400-500 | Metadata, controls, legends |
| Micro | 10-11px | 500 | Dense graph and heatmap labels |

- Primary: Geist Sans through `--font-geist-sans`.
- Mono: Geist Mono through `--font-geist-mono`.
- Numeric data uses the existing `.num` tabular-numeral utility.
- Dense labels may use 10px; actionable controls and body copy must remain at least 12px.

## 4. Spacing & Responsive Layout

The base unit is 4px. Existing Tailwind spacing steps are the implementation tokens.

- Page gutters: 12px mobile, 24px desktop.
- Card padding: 16px compact, 20-24px for primary surfaces.
- Section gap: 24px.
- Control gap: 4-8px within a group, 12-16px between groups.
- Radius: `--radius: 0.625rem`, through existing semantic radius utilities.
- Main content remains fluid and uses the full available width; only reading-focused
  prose surfaces may use a content limiter.
- Dense visualizations may use an internal max width when wider cells reduce information density.
- Desktop (`md` and wider) keeps a 64px agent sidebar visible for the full viewport.
- Mobile replaces the sidebar with fixed bottom navigation and reserves 4rem plus the
  device safe-area inset so content remains reachable.
- Full-height shell regions use dynamic viewport units so browser chrome changes do not
  move persistent navigation.
- Primary content must fit at 375px without horizontal page overflow.

## 5. Components & Primitives

### Fixed sidenav shell

- Desktop sidebar: sticky at the viewport block start and one dynamic viewport high.
- Main content remains the document's vertical scroll content.
- Mobile bottom navigation is fixed to the viewport bottom and horizontally scrollable.

### Top bar

- Full-width page heading row with border separation and theme control.
- May scroll with page content unless a feature explicitly requires a sticky toolbar.

### Dashboard card

- Uses semantic `card`, `border`, and text tokens.
- Hover feedback may translate by 1px with a subtle tinted shadow.

### Activity heatmap

- **Structure**: summary header, month rail, weekday rail, 53-column activity grid, intensity legend.
- **States**: empty, active levels 1-3, hovered, focused card.
- **Accessibility**: the card exposes a concise yearly summary; visual cells are hidden from
  screen readers; hover tooltips supplement rather than replace the summary.
- **Layout**: GitHub-style Sunday-to-Saturday columns, left aligned, responsive without page overflow.

### Segmented control

- **Structure**: labelled group of mutually exclusive buttons.
- **States**: default, hover, active, focus, disabled.
- **Accessibility**: group label plus `aria-pressed` on each option.
- **Layout**: wraps as a unit on narrow screens; does not mix unrelated controls.

### NavMap inspector

- **Structure**: orientation header, game-plan rail, display controls, graph canvas, selected-node inspector.
- **States**: loading, empty data, node hover, node selected, filtered, panning.
- **Accessibility**: graph nodes are keyboard-focusable buttons; Enter/Space selects; the inspector
  is available on both mobile and desktop.
- **Layout**: graph and inspector form a responsive sidebar primitive; inspector stacks below the
  graph on mobile and sits beside it on large screens.
- **Spatial model**: guard families and passing options share one exchange band; submissions form
  the finish rail directly beneath it, followed by control and leg-lock layers.

### Instant tooltip

- **Structure**: anchored label rendered above the hovered heatmap cell.
- **States**: hidden and visible.
- **Accessibility**: duplicates non-essential visual detail; no focus trap.
- **Motion**: opacity and slight translate only, with reduced-motion fallback.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---|---|---|
| Micro | 120ms | ease-out | Hover, focus, tooltip |
| Standard | 200ms | ease-in-out | Selection and panel emphasis |

- Animate only opacity and transform.
- Pressed controls may translate by one pixel; no decorative bounce.
- Tooltips appear immediately after pointer intent because the cells are very small.
- `prefers-reduced-motion` removes transform-based transitions.

## 7. Depth & Surface

Use mixed tonal shift and quiet borders:
- Page, card, and muted surfaces create the primary hierarchy.
- Borders define dense visualization boundaries.
- Tooltips and inspectors may use a restrained shadow for separation.
- Avoid decorative gradients, glass effects, and stacked card-within-card framing.

## 8. Accessibility & Content Stress Rules

- Target WCAG 2.2 AA.
- Navigation remains keyboard accessible through semantic links and labels.
- Active routes retain text plus color, not color alone.
- Visible focus is required on every interactive control and graph node.
- Persistent navigation must not cover primary content at any supported breakpoint.
- Touch controls target 44px where density permits; compact visualization cells are not touch controls.
- No primary content may depend on hover alone.
- Motion follows `prefers-reduced-motion`.
- Korean labels must not clip at 375px.
- Long labels truncate or wrap intentionally without widening the 64px sidebar.
- The desktop sidebar may scroll internally if navigation exceeds viewport height.
- Tabs and dense visualizations may own intentional horizontal scrolling; the page region must not.

## 9. Accepted Debt

| Item | Location | Why accepted | Exit |
|---|---|---|---|
| NavMap component is oversized | `components/sensei/SenseiNavMap.tsx` | Existing graph, data, and interaction logic are tightly coupled; this UI pass stays surgical | Split graph geometry, toolbar, and inspector during the next NavMap architecture pass |
| React visual diagnostics helpers are not wired | Project tooling | Adding shared runtime/dev instrumentation is outside this Lo-only UI change | Add in a dedicated tooling change after cross-agent review |
| Historical specialist colors remain raw | Specialist modules | Normalizing unrelated agent surfaces is outside this change | Migrate module-by-module when those surfaces are redesigned |
