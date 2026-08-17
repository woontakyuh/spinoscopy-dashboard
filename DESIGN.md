# Spinoscopy Dashboard Design System

## 1. Direction

An operational, dark-first clinical command surface. The interface uses warm charcoal
surfaces, compact information density, and restrained color accents so status and agent
identity remain legible without turning the dashboard into a decorative control panel.

## 2. Tokens

- Color: semantic Tailwind tokens from `app/globals.css` (`background`, `foreground`,
  `card`, `muted`, `border`, and agent-specific accent colors).
- Typography: Inter through `--font-geist-sans`; compact labels use the existing
  9–12px utility scale, while page titles use 14–16px.
- Spacing: Tailwind's 4px base scale. Shell and widget gaps use 4, 8, 12, 16, and 24px.
- Radius: `--radius: 0.625rem`, with existing semantic radius utilities.
- Depth: borders and tonal surface shifts are primary; shadows are reserved for hover
  feedback and overlays.

## 3. Responsive Layout

- Desktop (`md` and wider): a 64px agent sidebar remains visible for the full viewport
  while document content scrolls.
- Mobile (below `md`): the sidebar is replaced by a fixed bottom navigation. The main
  region reserves 4rem plus the device safe-area inset so content remains reachable.
- Full-height shell regions use dynamic viewport units so browser chrome changes do not
  move persistent navigation.

## 4. Accessibility

- Navigation remains keyboard accessible through semantic links and labels.
- Active routes retain text plus color, not color alone.
- Persistent navigation must not cover primary content at any supported breakpoint.
- Motion follows `prefers-reduced-motion`; this shell behavior adds no animation.

## 5. Primitives

### Fixed sidenav shell

- Desktop sidebar: `sticky` at the viewport block start, one dynamic viewport high.
- Main content: remains the document's vertical scroll content.
- Mobile bottom navigation: fixed to the viewport bottom and horizontally scrollable.

### Top bar

- Full-width page heading row with border separation and theme control.
- May scroll with page content unless a feature explicitly requires a sticky toolbar.

### Dashboard card

- Uses semantic `card`, `border`, and text tokens.
- Hover feedback may translate by 1px with a subtle tinted shadow.

## 6. Content Stress Rules

- Long labels truncate or wrap intentionally without widening the 64px sidebar.
- The desktop sidebar may scroll internally if its navigation exceeds viewport height.
- At 375px, primary content remains single-column with no horizontal overflow.

## 7. Accepted Debt

- Agent accent colors predate this document and are retained as product identity tokens.
- The project contains historical raw color values for specialist modules; this change
  does not expand or normalize those modules.
