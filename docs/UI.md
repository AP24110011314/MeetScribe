# UI Specification — MeetScribe (frontend only)

Uses only endpoints in `docs/API.md`. If a UI idea needs a new endpoint or field, add it to `docs/UI_BACKLOG.md` under "Needs backend" and do not build it. Vite proxies `/api` to `http://127.0.0.1:8000`.

## Design system (U01)
- Tokens as CSS variables plus Tailwind theme: one brand accent (indigo/violet), neutral grays, semantic success/warning/danger, radii, shadows, motion durations.
- Font: Inter, self-hosted via `@fontsource/inter`.
- Light and dark themes; toggle in top bar; follows system preference; saved in localStorage.
- Primitives in `src/components/ui`: Button (variants, sizes, loading), Card, Badge, Input, Select, Dialog, Tooltip, Tabs, Skeleton, Toast, EmptyState, Spinner, ProgressBar, Avatar. Built on Radix UI; animation with framer-motion; icons from lucide-react.
- Respect `prefers-reduced-motion`.

## App shell and navigation (U02)
- Desktop: collapsible sidebar (Dashboard, Meetings, Action Items, Settings), top bar with search, theme toggle, user menu.
- Mobile: bottom tab bar or slide-over menu.
- Breadcrumbs on detail pages, page transitions, consistent page headers.
- Command palette `Cmd/Ctrl+K`: navigate, open a meeting (from list endpoint), new upload, toggle theme.
- Shortcuts: `g d` dashboard, `g m` meetings, `g a` action items, `n` new upload, `/` focus search, `?` shortcuts dialog.

## Pages
**Landing and auth (U03):** hero with 3-step explainer (Upload, Transcribe, Get action items), split-screen login and register, inline validation, password visibility toggle.

**Dashboard (U04):** greeting; stat cards (total meetings, hours transcribed, open action items, completed this week) computed client-side from list endpoints; recent meetings; "due soon" action items; Recharts bar chart of meetings per week (lazy loaded); skeletons and empty state.

**Upload (U05, U06):** large drag-and-drop zone with type and size checks; multi-file queue; per-file card (name, size, progress ring, speed, time left, cancel); after upload, a step tracker (Uploaded, Preparing, Transcribing, Analyzing, Done) driven by `/status` polling every 2.5 s; failed state shows readable error and Retry.

**Meetings list (U07):** grid and table toggle; debounced search; filters (status); sort; pagination; status badges; hover actions (open, rename, export, delete with confirm dialog).

**Meeting detail (U08 to U10):** tabs Overview, Transcript, Action Items.
- Overview: inline-editable title, chips (duration, language, date), summary card, key points, decisions card, copy buttons per section, "Copy all as Markdown", export buttons (md, pdf).
- Sticky audio player (U09): play/pause, seek, speed 0.75x to 2x, skip 10 s, wavesurfer waveform; fallback to a plain styled player if waveform or CORS fails.
- Transcript (U10): timestamped segments, click to seek, active segment highlighted and auto-scrolled with a "follow along" toggle, in-transcript search with next/previous.
- Action items (U11): grouped Open and Done with completion progress bar, checkbox animation, priority badges, owner chips with colored initials, due dates with overdue highlight, inline edit, add item, jump-to-timestamp link, optional kanban board (Open and Done columns, drag and drop).

**My action items (U12):** filters (status, owner, priority, meeting), group by meeting or due date, overdue and due-today sections, quick complete.

**Settings (U13):** theme, density (comfortable or compact), default list view, shortcuts reference; stored in localStorage.

## Polish (U14)
Toasts for every action, undo for delete and complete, subtle celebration when all action items are done, favicon and logo, document titles, custom 404, skeleton/empty/error states on every data view.

## Quality bar
- Responsive from 360 px; no horizontal scroll.
- WCAG AA contrast in both themes, visible focus rings, full keyboard support, ARIA labels, dialog focus trapping.
- Route-level code splitting; lazy-load Recharts and wavesurfer.
- Strict TypeScript, no `any`.

## Required `data-testid` names (used by Playwright)
`login-form`, `register-form`, `upload-dropzone`, `upload-file-input`, `upload-queue-item`, `step-tracker`, `step-{uploaded|preparing|transcribing|analyzing|done}`, `retry-button`, `meeting-card`, `meeting-row`, `view-toggle`, `search-input`, `status-badge`, `meeting-title`, `tab-overview`, `tab-transcript`, `tab-actions`, `summary-card`, `decisions-card`, `transcript-segment`, `transcript-search`, `audio-player`, `speed-select`, `action-item-row`, `action-checkbox`, `action-add`, `board-view-toggle`, `export-md`, `export-pdf`, `delete-meeting`, `confirm-delete`, `command-palette`, `theme-toggle`, `toast`, `not-found`.
