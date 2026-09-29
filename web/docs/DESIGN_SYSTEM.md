# Design System — Triage Agent Lab (PoC)

**Status:** v1.0 (2026-09-30)
**Owner:** product (Vahid + Claude chat). The frontend coder implements it and does not change it without a recorded `W-xxx` decision.
**Source:** `Design_System_FA.docx` (product design document, Persian) condensed into an implementable English spec, plus `design/mockup-reference.png`.

## 0. Precedence and scope

1. `UI_SPEC.md` decides **what** exists: features, fields, routes, Persian copy, behavior.
2. This document decides **how it looks**: tokens, components, layout, states.
3. `design/mockup-reference.png` is a mood reference only. It contains several things that are out of scope or break blind evaluation. They are listed in §8 and must **not** be built.

The design adds no product features. If a visual idea needs a field, an endpoint, or copy that `UI_SPEC.md` does not define, do not build it; record the idea in the phase report.

Design principles, in priority order: blind evaluation (nothing hints at model or architecture) · clinical safety is visually unmistakable (emergency never looks like a normal state) · calm, not alarmist (red is reserved for emergency, safety alerts, serious errors, destructive actions) · Persian-first readability · evaluator efficiency · consistency (every value comes from a token).

## 1. Tokens

Define every token once as a CSS custom property in `src/index.css` and map it into Tailwind (§3). No hex value may appear anywhere else in `src/`.

### 1.1 Colors

| Token | CSS variable | Hex | Use |
|---|---|---|---|
| Primary / Navy | `--color-primary-900` | `#123B66` | Sidebar background, brand text, page titles |
| Primary / Strong | `--color-primary-700` | `#1B55A6` | Text on primary-soft backgrounds (ROUTINE badge) |
| Primary / Blue | `--color-primary-600` | `#246BCE` | Primary buttons, links, focus ring |
| Primary / Soft | `--color-primary-100` | `#EAF3FF` | Selected/interactive backgrounds, patient bubbles |
| Accent / Cyan | `--color-accent-500` | `#4DB7D8` | Logo and minimal decoration only; never for meaning |
| Text / Strong | `--color-text-900` | `#152536` | Main text |
| Text / Body | `--color-text-700` | `#334155` | Body text |
| Text / Muted | `--color-text-500` | `#5F6F82` | Metadata, helper text, captions |
| Text / Placeholder | `--color-text-400` | `#6B7C93` | Placeholders, icons in inputs |
| Border | `--color-border` | `#D9E3EE` | Cards, fields, table rows |
| Surface | `--color-surface` | `#FFFFFF` | Cards |
| Canvas | `--color-canvas` | `#F7FAFC` | Page background |
| Disabled bg | `--color-disabled-bg` | `#E8EEF5` | Disabled controls |
| Disabled text | `--color-disabled-text` | `#8A98A8` | Disabled controls |
| Neutral / Strong | `--color-neutral-700` | `#475569` | Text on neutral-soft (INSUFFICIENT badge) |
| Neutral / Soft | `--color-neutral-100` | `#F1F5F9` | Neutral badge background |
| Success | `--color-success-600` | `#1F9D67` | Icons, bars, borders |
| Success / Strong | `--color-success-700` | `#13704A` | Text on success-soft |
| Success / Soft | `--color-success-100` | `#EAF8F1` | Success backgrounds |
| Warning | `--color-warning-600` | `#C98A1A` | Icons, bars, borders (never small text) |
| Warning / Strong | `--color-warning-700` | `#8A5A0B` | Text on warning-soft |
| Warning / Soft | `--color-warning-100` | `#FFF7E6` | Warning backgrounds, test banner |
| Danger | `--color-danger-600` | `#D64545` | Icons, bars, borders, error helper text |
| Danger / Strong | `--color-danger-700` | `#B42318` | Text on danger-soft, danger button background |
| Danger / Soft | `--color-danger-100` | `#FFF0F0` | Emergency and error backgrounds |
| Info | `--color-info-600` | `#3478C7` | Info icons |
| Info / Soft | `--color-info-100` | `#EEF6FF` | Info backgrounds |

The `-700` "strong" tokens, `text-400`, and the darker `text-500` are additions to the source document: its `-600` colors fail WCAG AA as small text on their soft backgrounds (e.g. `#C98A1A` on `#FFF7E6` is 2.8:1). The rule is **`-600` for icons, bars, and borders; `-700` for text on a soft background**. All text pairs used below are ≥ 4.5:1.

### 1.2 Triage and status colors

| Level | Text | Background | Border / icon / bar |
|---|---|---|---|
| `EMERGENCY_NOW` | danger-700 | danger-100 | danger-600 |
| `URGENT_24H` | warning-700 | warning-100 | warning-600 |
| `ROUTINE_DAYS` | primary-700 | primary-100 | primary-600 |
| `SELF_CARE` | success-700 | success-100 | success-600 |
| `INSUFFICIENT_INFO` | neutral-700 | neutral-100 | text-400 |

Can't-miss status chips: `suspected` = danger · `not_excluded` = warning · `ruled_out` = success · `not_yet_assessed` = neutral. Guard-flag chips: warning. Color never carries meaning alone: every badge and chip has its Persian label, and the emergency state also has an icon.

### 1.3 Typography

Font: Vazirmatn (already self-hosted, weights 400/500/700; add 600 if the package provides it, otherwise use 700 wherever 600 is listed). Fallback: `Tahoma, sans-serif`.

| Style | Size | Weight | Line height | Use |
|---|---|---|---|---|
| display | 30px | 700 | 1.25 | Login brand title |
| h1 | 24px | 700 | 1.35 | Page title |
| h2 | 18px | 700 | 1.4 | Section / card title |
| h3 | 15px | 600 | 1.45 | Sub-section, doctor name |
| body-l | 16px | 400 | 1.75 | Chat messages, patient-facing text |
| body | 14px | 400 | 1.75 | Default text |
| body-strong | 14px | 600 | 1.7 | Labels, emphasis |
| caption | 12px | 400 | 1.6 | Metadata (never smaller than 12px) |
| button | 14px | 600 | 1.4 | Buttons |
| code | 12px | 400 | 1.55 | Clinical-state keys, model slug, config (LTR, monospace) |

Rules: right-aligned by default; no letter-spacing tricks or ALL CAPS; numbers keep Persian digits (UI_SPEC §1); technical values (model slug, config keys, `name_en`) are rendered `dir="ltr"`.

### 1.4 Spacing, radius, elevation

- Spacing scale (px): 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 (`--space-1` … `--space-16`, as in Tailwind's default 4 px scale, so Tailwind's `1, 2, 3, 4, 5, 6, 8, 10, 12, 16` classes are the tokens).
- Radius: `sm` 8px (inputs' inner elements, chips) · `md` 12px (buttons, inputs, small cards) · `lg` 16px (cards, result card) · `xl` 20px (main panels, modals) · `pill` 999px (badges, status chips).
- Elevation: `shadow-1` `0 1px 3px rgba(21,37,54,.08)` (cards) · `shadow-2` `0 6px 18px rgba(21,37,54,.10)` (dropdowns, drawer, toasts) · `shadow-3` `0 14px 36px rgba(21,37,54,.14)` (modals). No glassmorphism, blur, or heavy shadows.
- Border: `1px solid var(--color-border)`.
- Focus: every focusable element shows `outline: 2px solid var(--color-primary-600); outline-offset: 2px` on `:focus-visible`. Never remove focus styles.

### 1.5 Breakpoints and containers

| Name | Width | Behavior |
|---|---|---|
| mobile | < 768 px | One column. Top bar + drawer navigation. Page padding 16px. |
| tablet | 768–1023 px | Top bar + drawer. Two-column grids where useful. Padding 24px. |
| desktop | ≥ 1024 px | Sidebar + content. Padding 32px. |
| wide | ≥ 1440 px | Content max-width 1280px, centered in the content area. |

Content max widths: general pages 1280px · session page 880px · login form column 400px. Chat bubbles: max 85% of the chat column on mobile, max 620px on desktop.

## 2. CSS variables (`src/index.css`)

```css
:root {
  --color-primary-900:#123B66; --color-primary-700:#1B55A6; --color-primary-600:#246BCE; --color-primary-100:#EAF3FF;
  --color-accent-500:#4DB7D8;
  --color-text-900:#152536; --color-text-700:#334155; --color-text-500:#5F6F82; --color-text-400:#6B7C93;
  --color-border:#D9E3EE; --color-surface:#FFFFFF; --color-canvas:#F7FAFC;
  --color-disabled-bg:#E8EEF5; --color-disabled-text:#8A98A8;
  --color-neutral-700:#475569; --color-neutral-100:#F1F5F9;
  --color-success-700:#13704A; --color-success-600:#1F9D67; --color-success-100:#EAF8F1;
  --color-warning-700:#8A5A0B; --color-warning-600:#C98A1A; --color-warning-100:#FFF7E6;
  --color-danger-700:#B42318;  --color-danger-600:#D64545;  --color-danger-100:#FFF0F0;
  --color-info-600:#3478C7; --color-info-100:#EEF6FF;
  --radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-xl:20px; --radius-pill:999px;
  --shadow-1:0 1px 3px rgba(21,37,54,.08); --shadow-2:0 6px 18px rgba(21,37,54,.10); --shadow-3:0 14px 36px rgba(21,37,54,.14);
}
body { font-family: "Vazirmatn", Tahoma, sans-serif; background: var(--color-canvas); color: var(--color-text-900); }
```

Use logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) instead of `left`/`right`. Directional icons (chevrons, arrows, the send icon) are mirrored in RTL with one utility class (e.g. `.icon-dir { transform: scaleX(-1); }` under `[dir="rtl"]`). Medical and semantic icons are never mirrored.

## 3. Tailwind mapping

In `tailwind.config`, `theme.extend`:

- `colors`: `primary: {900,700,600,100}`, `accent: {500}`, `ink: {900,700,500,400}` (text colors), `line` (border), `surface`, `canvas`, `disabled: {bg, text}`, `neutral: {700,100}`, `success: {700,600,100}`, `warning: {700,600,100}`, `danger: {700,600,100}`, `info: {600,100}` — every value `var(--color-…)`.
- `borderRadius`: `sm, md, lg, xl, pill` → the radius variables.
- `boxShadow`: `1, 2, 3` → the shadow variables.
- `fontSize`: `display, h1, h2, h3, body-l, body, body-strong, caption, button, code` with the line heights and weights of §1.3.
- `fontFamily.sans`: `["Vazirmatn", "Tahoma", "sans-serif"]`.

Replace existing ad-hoc Tailwind colors (`gray-*`, `red-*`, `yellow-*`, …) in components with these names. A check at the end of the phase: `grep -rnE "#[0-9A-Fa-f]{3,8}\b" src --include=*.tsx --include=*.ts` returns nothing, and no default Tailwind palette color class (`(bg|text|border)-(gray|slate|red|orange|yellow|amber|green|blue|sky)-[0-9]`) remains.

## 4. App shell

### 4.1 Desktop (≥ 1024 px)

- **Sidebar** on the inline-start side (right in RTL), width 248px, full height, `bg-primary-900`, white text.
  - Top: logo mark (§4.4) + «آزمایشگاه پزشک مجازی» (h3, white).
  - Items (44px tall, radius-md, padding-inline 12px, icon 20px + label): `پزشک‌ها` (Stethoscope) · `سوابق من` (History) · admin only: `داشبورد` (LayoutDashboard) · `همه جلسات` (ListChecks). Labels and routes exactly as UI_SPEC §2; nothing else.
  - Idle text `rgba(255,255,255,.78)`; hover background `rgba(255,255,255,.08)`; active: background `rgba(255,255,255,.14)`, white text, `aria-current="page"`.
  - Bottom: the user's display name (caption, 78% white) and a `خروج` item (LogOut icon).
- **Content column:** canvas background. At its top, the test banner (§4.3), then the page (padding per §1.5).

### 4.2 Mobile and tablet (< 1024 px)

- Top bar, 56px, surface background, bottom border: menu button (Menu icon, `aria-label="منو"`, 44×44 target) at inline-start, then the logo mark and app name.
- The menu button opens a **drawer** from the inline-start edge with the same content as the sidebar, on a `rgba(21,37,54,.4)` overlay. It traps focus, closes on Escape, on overlay click, and on navigation, and returns focus to the menu button.
- The test banner sits directly under the top bar.

### 4.3 Test banner (every page, including login)

Full width, `bg-warning-100`, bottom border warning-600 at 40% opacity, padding 8px 16px, caption/body text in `ink-900`, an `AlertTriangle` icon in warning-600 at inline-start. Text exactly as UI_SPEC §1. It cannot be closed. It is `position: sticky; top: 0` inside the content column (under the mobile top bar), so it stays visible in long pages and in the chat.

### 4.4 Logo mark

An inline SVG, 32×32: a heart outline with a pulse line, stroke primary-600 with the pulse in accent-500, `aria-hidden="true"` (the app name next to it is the accessible text). No raster images anywhere in the app.

## 5. Components

Build these in `src/components/ui/` and use them everywhere. Keep existing component names and props where they already exist; restyle rather than rewrite.

### 5.1 Button

| Variant | Style |
|---|---|
| primary | `bg-primary-600`, white text; hover 8% darker (use `filter: brightness(.92)` or a dedicated token-derived class) |
| secondary | surface background, 1px border, `text-primary-900`; hover `bg-primary-100` |
| ghost | transparent, `text-primary-600`; hover `bg-primary-100` |
| danger | `bg-danger-700`, white text. Reserved for destructive actions; v1 has none, so the variant exists but is unused |

Height 40px (48px for the main CTA on mobile: `ورود`, `ارسال`, `ثبت ارزیابی`), padding-inline 16px, radius-md, button text style. States: hover, pressed (slightly darker), focus-visible ring, disabled (`bg-disabled-bg`, `text-disabled-text`, no opacity fade), loading (spinner at inline-start, label kept, `aria-busy="true"`, click ignored). At most one primary button per view region.

### 5.2 Text field / password field / textarea / select

Label above the control (body-strong), never a placeholder instead of a label. Height 44px (48px on mobile), radius-md, 1px border, surface background, placeholder `ink-400`. Focus: border primary-600 + ring. Error: border danger-600, helper text below in danger-700 caption, `aria-invalid="true"`, `aria-describedby` to the helper. Password field has a show/hide toggle button (Eye/EyeOff, `aria-label` «نمایش رمز» / «پنهان کردن رمز») — this is the only extra affordance allowed on login. Textareas: min height 96px, vertical resize.

### 5.3 Card

Surface, 1px border, radius-lg, shadow-1, padding 20px (16px on mobile). Card title: h2. A selectable card changes border/background on hover without moving the layout.

### 5.4 Badge and chip

Pill radius, padding 2px 10px, caption or body-strong text. Triage badge (`TriageBadge`): size `lg` is 36px tall with body-strong text and an icon (EMERGENCY: `Siren` or `AlertTriangle`; URGENT: `Clock`; ROUTINE: `CalendarClock`; SELF_CARE: `Home`; INSUFFICIENT: `HelpCircle`); size `sm` (tables) has no icon. Colors per §1.2.

### 5.5 Alert

Soft background of its tone, 4px border on the inline-start side in the tone's `-600`, radius-md, icon + title (body-strong) + text. Tones: danger, warning, info, success. Safety alerts are never dismissible.

### 5.6 Modal (confirm dialog)

Surface, radius-xl, shadow-3, max-width 440px, overlay as the drawer. `role="dialog"`, `aria-modal="true"`, labelled by its title, focus trap, Escape closes, focus returns to the trigger. Buttons at the bottom: primary (confirm) and secondary (cancel).

### 5.7 Toast

Bottom-center on mobile, bottom inline-end on desktop, shadow-2, radius-md, tone per message (error = danger, info = info). `role="status"` (errors: `role="alert"`). Auto-hides after 5 s; has a close button.

### 5.8 Table

Surface card container; header row `bg-canvas`, body-strong caption text; rows 48px min, bottom border; clickable rows get hover `bg-primary-100` and remain keyboard-activatable. Numeric cells use tabular figures. The key column is the first (inline-start) column. Wide tables scroll horizontally inside their own container (keep the phase-1 behavior); the page never scrolls sideways.

### 5.9 Skeleton

`bg-neutral-100` blocks with a gentle opacity pulse (1.5 s). Respect `prefers-reduced-motion` (no animation).

### 5.10 Segmented rating (evaluation KPIs)

A `fieldset` with a `legend` (the KPI label). Five **native radio inputs**, visually hidden but focusable, each with a visible 40×40px box (44×44 on mobile) showing the Persian digit. Idle: surface + border; hover: primary-100; checked: `bg-primary-600` white text; focus-visible ring on the box. Arrow keys move the selection (native radio behavior). The anchor texts (UI_SPEC §5) are shown as captions under boxes 1, 3, and 5. Error state: the fieldset gets the danger border and the helper text. Stars are not used.

### 5.11 Chat bubble

- Agent (right in RTL, as UI_SPEC §3.3): surface, 1px border, radius-lg with the top inline-start corner at radius-sm, a small neutral avatar (the same Stethoscope icon for every agent) and the label `display_name` above.
- Patient (left): `bg-primary-100`, no border, the top inline-end corner at radius-sm, label «شما (بیمار)».
- Text: body-l, `white-space: pre-wrap`. Time under the text in caption `ink-500` (time only, Persian digits).
- `error` kind: `bg-neutral-100`, `ink-700` text, with the `ارسال دوباره` secondary button inside the bubble.
- Typing bubble: agent style with three dots animating (static text «پزشک در حال بررسی…» remains for screen readers and tests).
- Feedback row under agent `question`/`result` bubbles: two 32px icon toggle buttons (ThumbsUp/ThumbsDown, `aria-pressed`) and a ghost «یادداشت» link; the note editor is an inline textarea + small primary «ذخیره» — keep the phase-1 behavior and labels.

### 5.12 Metric card (admin)

Card with padding 16px: label (caption `ink-500`) on top, value (h1, tabular figures) below. No delta, no trend, no ranking.

### 5.13 Chart (admin)

`recharts` grouped `BarChart` inside a card, 280px tall. Series colors (not status colors): primary-600, accent-500, primary-900. Persian legend and tooltip; values as Persian percentages; the category axis shows each row's `label`. The chart's SVG is wrapped in `dir="ltr"` so the axes render correctly, while all texts stay Persian. Title (h2) and caption per UI_SPEC §3.5. `null` values draw no bar. Provide a visually-hidden summary table or `aria-label` describing the chart.

## 6. Pages

### 6.1 Login (`/login`)

Desktop: two columns inside the viewport. Brand panel (inline-end side, 50%): `bg-primary-100` with the logo mark (64px), the display title and the line from UI_SPEC §3.1 in `ink-700`. Form column (inline-start side): a card, max 400px wide, with the h1 «ورود به سامانه» (UI_SPEC §3.1), the fields, the primary full-width `ورود` button, and the error as a danger Alert above the button; on error, focus moves to the username field. Mobile: one column, brand panel collapses to the logo + app name above the form. No forgot-password, registration, or social login.

### 6.2 Doctors list (`/`)

Page title (h1) = the UI_SPEC §3.2 title. Grid: 1 column (mobile), 2 (tablet), 3 (desktop), 4 (wide), gap 16–24px. Card: the neutral avatar (56px circle, `bg-primary-100`, Stethoscope in primary-600 — **identical for every agent**), `display_name` (h3), `description` (caption) when present, and a full-width secondary `شروع گفتگو` button (loading state while `POST /sessions` runs; the other cards' buttons are disabled meanwhile). The hint from UI_SPEC §3.2 sits below the grid in an info Alert.

### 6.3 Session page (`/sessions/:id`)

Max width 880px.

- **Session header** (card, sticky under the banner on desktop): back link to `/` (ChevronRight, mirrored rules apply), the agent avatar + `display_name` (h2), a status chip (active = success soft «در جریان»; completed = neutral «تمام‌شده», labels from `labels.ts`), the question counter «تعداد سؤال‌ها: X» (caption), and the secondary button `پایان گفتگو و دریافت نتیجه` (only while active).
- **Messages column:** bubbles per §5.11, 12px gap, auto-scroll as in phase 1.
- **Composer** (active only): sticky at the bottom of the viewport, surface background, top border, padding with `env(safe-area-inset-bottom)`. An auto-growing textarea (1 to 5 lines) with the UI_SPEC placeholder and the primary `ارسال` button (icon + visible text on ≥ 768px, icon-only with `aria-label="ارسال"` below). No attachment button.
- **Completed state**, below the transcript, in order: Result card (§6.4), Backstage (§6.5), Evaluation form or its read-only summary + reveal (§6.6). The composer disappears.

### 6.4 Result card

Card titled «نتیجه ارزیابی پزشک مجازی».

1. **Triage block** at the top. For `EMERGENCY_NOW`: a danger Alert with the `lg` triage badge and, if present, the safety-floor note inside it. For other levels: the `lg` triage badge alone; the safety-floor note (if any) as a warning Alert under it.
2. **Emergency probability:** label + Persian percentage + an 8px horizontal bar (track neutral-100, fill: danger-600 if ≥ 0.20, warning-600 if ≥ 0.10, primary-600 otherwise — purely visual, the number is the meaning).
3. **Key facts:** a two-column key/value grid (one column on mobile): specialty (+ secondary), confidence, and the stats of UI_SPEC §3.3 (questions, duration, mean latency, cost).
4. **Differential** and **can't-miss** tables (§5.8), status chips per §1.2.
5. **Missing information** list; **clinical summary** as titled blocks (h3 + body) in a 2-column grid on desktop.
6. Guard-flag chips (warning) and the pediatric note (info Alert) where applicable.

### 6.5 Backstage panel

Card titled «پشت صحنه: استدلال پزشک مجازی», collapsible via a header button (`aria-expanded`), open by default. A vertical timeline: a 2px `line`-colored rail at inline-start, a dot per turn, and per turn a sub-card titled with the related agent message text (truncated to two lines, full text on expand). Fields render generically as in phase 1 (W-017); structured values use the same chips/tables as the result card; «پرونده بالینی» is a nested collapsible with keys in `code` style, LTR. Nothing about model, architecture, or config appears here.

### 6.6 Evaluation form, summary, reveal

- Form card titled «ارزیابی شما», split into sub-sections with h3 headings: KPI ratings (§5.10, one per row on mobile, two per row ≥ 1024px), unnecessary-questions number field (max-width 160px), safety flags (checkboxes in a warning-soft box with the UI_SPEC title), verdict (selects), comments (textareas, 2 per row on desktop), comparison (checkbox, then the select and the winner radios as a segmented control of 3).
- Validation: phase-1 behavior; the first invalid field scrolls into view and receives focus.
- Submit: primary `ثبت ارزیابی`, full width on mobile, with loading state.
- After submit: the read-only summary card (same layout, values as text), then the **reveal** card «پشت این پزشک مجازی چه بود؟» with a success-soft header strip, architecture label, model slug (`code`, LTR), and the config as a key/value list; then the primary `گفتگو با پزشک دیگر` button.

### 6.7 My sessions (`/history`)

Page title, the `همه` / `ارزیابی‌نشده` tabs as a segmented control (radius-pill, `role="tablist"`), and the §5.8 table with the UI_SPEC columns; the triage column uses the `sm` badge; evaluated = success chip «ثبت شده», not evaluated = neutral chip «ثبت نشده».

### 6.8 Admin dashboard (`/admin`)

Top row: the group-by segmented control and, at inline-end, the secondary button `بارگذاری مجدد تنظیمات ایجنت‌ها`. Then the 4 metric cards (§5.12) in a 2×2 grid on mobile and 4 columns on desktop, the chart card (§5.13), the recent-sessions card (UI_SPEC §3.5), the full metrics table (§5.8, phase-1 columns and sorting, under-triage > 0 in danger-700 text), and a card «خروجی CSV» with the 6 export buttons (secondary, Download icon). Labels for the new elements are in UI_SPEC §3.5.

### 6.9 Admin sessions and detail

Filters in a card (selects inline on desktop, stacked on mobile), then the table. The detail page is the session page layout in read-only mode (no composer, no feedback controls, reveal always shown), as W-022.

## 7. States

| State | Rule |
|---|---|
| Loading | Skeletons shaped like the final layout; buttons use their loading state; no layout shift |
| Empty | Short Persian text from UI_SPEC in a neutral card; no illustrations |
| Error | Danger Alert (page level) or toast (action level) with the UI_SPEC text |
| Disabled | Readable (§5.1); never opacity below 60% on text |
| Agent waiting | Typing bubble only; never simulate streaming |
| Completed | Composer removed, result card appears |

## 8. Mockup reference: do not copy

`design/mockup-reference.png` was produced before the UI_SPEC was final. Adopt its visual language (navy sidebar, white cards, blue CTAs, soft backgrounds, spacing), but not these elements:

| In the mockup | Decision |
|---|---|
| Specialty subtitles under doctor names (عمومی، داخلی، کودکان …) | **Remove.** Agents are not specialists; the text would bias evaluators. Show `description` only. |
| A different, gendered avatar per doctor | **One neutral avatar for all** (UI_SPEC §3.2). |
| App name «تریاژ هوشمند» and the marketing tagline | Use «آزمایشگاه پزشک مجازی» and the UI_SPEC §3.1 line. |
| Raster illustration on the login page | Not used. Logo mark + text only. |
| «فراموشی رمز عبور؟» | **Remove** (no such feature). |
| Sidebar items خانه، جلسات من، ارزیابی‌ها، گزارش‌ها، تنظیمات | Only the UI_SPEC §2 items and labels. |
| Paperclip / attachment button in the chat | **Remove** (text-only chat). |
| Patient bubbles on the right, agent on the left | Keep UI_SPEC: agent right, patient left. |
| Backstage tabs «تاریخچه گفتگو» / «تراکنش‌های مدل» and a model-parameters code block (e.g. `model: gpt-4o`, `temperature`) | **Forbidden before evaluation** (D-007, D-008). The backstage shows only `BackstageTurn` fields. Model and config appear only in the reveal card after submission. Evaluators never see LLM traces. |
| Result card items «ارجاع به پزشک متخصص»، «تصمیم نهایی»، «خلاصه وضعیت» with «احتمال تشخیص / سطح خطر / نیاز به مراجعه حضوری» | Use the UI_SPEC §3.3 elements only; adopt the visual pattern (alert block at the top, key/value rows). |
| Star ratings for items such as دقت تریاژ، ایمنی، هزینه، تاخیر | Use the 9 UI_SPEC KPIs with the segmented rating (§5.10). Cost and latency are measured, not rated. |
| Dashboard date-range filter «بازه زمانی: امروز» | **Remove** (no API support). |
| Dashboard cards «میانگین امتیاز»، «هزینه کل (تقریبی)»، «میانگین تاخیر» | Replaced by the exact-sum cards of UI_SPEC §3.5; no client-side averages. |
| Triage wording that differs from UI_SPEC §7.1, and the Persian microcopy table in the source document (e.g. «انتخاب»، «جلسات من») | UI_SPEC copy wins everywhere. |
| Banner text without the ۱۱۵ sentence | Use the full UI_SPEC §1 banner text. |

## 9. QA checklist (end of the design phase)

- [ ] Every page RTL; no horizontal page scroll at 375, 768, 1024, 1280, 1440 px.
- [ ] Banner visible and sticky on every page, including login and the chat.
- [ ] No model slug, architecture word, agent id, or config value in the DOM before evaluation (reuse the phase-1 probe).
- [ ] Sidebar/drawer items match UI_SPEC §2 per role; drawer traps focus and closes on Escape.
- [ ] Every interactive element: visible focus ring, ≥ 44×44 px touch target on mobile.
- [ ] Emergency result is recognizable without color (icon + label + alert title).
- [ ] All text/background pairs ≥ 4.5:1 (checked with a script over the token pairs actually used).
- [ ] No hex values or default Tailwind palette classes outside `index.css` / `tailwind.config` (§3 grep).
- [ ] `prefers-reduced-motion` disables skeleton and typing animations.
- [ ] Composer stays above the mobile keyboard and the safe area.
