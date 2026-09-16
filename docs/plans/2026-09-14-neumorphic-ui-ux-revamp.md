# Calm Neumorphic UI/UX Revamp Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan in small verified chunks. Keep each task's behavior checks passing before moving on.

**Goal:** Replace the app's inconsistent gray-and-indigo utility styling with a cohesive, calm, accessible soft-neumorphic experience across every existing learning flow.

**Architecture:** Keep the current React/Vite/Tailwind frontend, routes, API calls, local persistence model, and learning state machine. Establish semantic CSS tokens and a small set of reusable React UI primitives, then apply them screen by screen while keeping learning-focused routes visually quiet and distraction-free.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, CSS custom properties, Vitest, React Testing Library.

---

## Scope and decisions

This is a frontend presentation, appearance-preference, and interaction-clarity project. It adds a client-side theme preference, but no accounts, cloud sync, learner profiles, curriculum-generation behavior, database fields, or backend endpoints. Existing topic switching, lesson state transitions, quizzes, artifacts, exams, reviews, JSON backup/restore, and LLM configuration continue to behave as they do today. Save the chosen theme in `localStorage` for this browser profile; keep it separate from the learning-data JSON export because it is cosmetic and does not affect roadmap portability.

The selected direction is **restrained soft Neumorphism**. The page canvas and a limited set of grouped surfaces use gentle raised/inset depth. Text, controls, and status remain crisp. Primary actions use a saturated accessible accent, not a low-contrast embossed label. Focus indicators and meaningful borders remain visible even where shadows are subtle. Do not apply a raised-card treatment to every nested element; that would flatten hierarchy and create a busy field of shadows.

Three visual directions were considered:

1. **Strict monochrome Neumorphism:** nearly every surface and control is sculpted from one pale background. It is cohesive, but weak affordances, low contrast, and shadow-heavy nesting make it a poor fit for assessments and dense graph data.
2. **Restrained soft Neumorphism (recommended):** calm neutral canvas, shallow dual shadows for major surfaces, inset treatment for selected inputs/pressed states, and clear semantic color for actions/status. This honors the requested look without making interaction states ambiguous.
3. **Flat interface with Neumorphic accents:** strong boundaries and flatter cards with soft depth only on a few hero areas. It is easiest to read, but the Neumorphic character would be too faint to define the requested redesign.

Ship **16 selectable presets** in the first release, split into eight light and eight dark themes. The default is Morning Mist. Every theme uses the same semantic token contract so screens and interactive states remain consistent. Apply the selected theme immediately, persist it in `localStorage`, restore it on reload, and fall back to Morning Mist if storage is missing, invalid, or unavailable. Catch storage read/write exceptions: if a write fails, keep the selected theme active for the current session and show “Applied for this session; browser storage is unavailable” instead of claiming it was saved. Show “Saved in this browser” only after a successful write. Do not add cross-device sync or a theme switch in the backup/restore format.

## Product and UX principles

- A learner should see what to do next within a few seconds of opening the dashboard.
- The visual hierarchy follows a stable pattern: page title/context, primary action, learning content, supporting status.
- The interface feels calm through whitespace, restrained color, readable line lengths, and a small number of surfaces—not through faint text or vague controls.
- Raised surfaces indicate grouped content; inset surfaces indicate editable/pressed areas; solid buttons indicate important actions. Use elevation consistently.
- Color never carries status by itself. Pair it with a text label, icon, or shape, including graph states and success/failure feedback.
- The lesson and review routes remain focus modes: low-distraction header, readable conversation/question width, persistent progress context, and an obvious way back.
- Mobile layouts preserve task order, tap-target size, and readable graph labels instead of shrinking desktop layouts until they fit.
- Keep current copy and user-facing behavior unless a small copy/layout change materially clarifies an existing action. Do not invent new capabilities.
- Honor keyboard use, visible focus, reduced-motion preferences, long content, loading/error/empty states, and browser zoom.

## Visual system

Define semantic custom properties in `client/src/index.css`, then provide theme values from a small static registry in `client/src/theme/themes.js` and apply them with a `ThemeProvider`. Use the tokens through shared primitives and screen components. Keep Tailwind for page layout and responsive composition, but remove hard-coded Tailwind color utilities anywhere they encode theme-dependent surfaces, text, borders, actions, status, or graph state. Otherwise the picker would change the page canvas while leaving most of the app gray/indigo. Avoid replacing Tailwind with a new CSS framework or adding an icon package.

Token groups:

- **Canvas and surfaces:** app canvas, raised surface, inset surface, border, and divider.
- **Text:** primary, secondary, muted, inverse, and disabled.
- **Actions:** primary accent, hover/pressed accent, secondary action, and focus ring.
- **Status:** success, in-progress, warning, danger, and neutral, each with foreground/background/border pairings.
- **Depth:** one subtle raised shadow and one restrained inset shadow, with a stronger/high-contrast border fallback.
- **Shape and spacing:** a consistent compact/standard/large radius scale and a spacing rhythm for cards, section gaps, and page gutters.
- **Motion:** short feedback transitions for hover/press/selection; no gratuitous movement. Existing `prefers-reduced-motion` handling remains authoritative.

Each theme supplies the same required semantic roles: canvas, raised/inset surfaces, primary/secondary/muted text, border/divider, primary action and action text, focus ring, user/tutor message surfaces, and success/in-progress/warning/danger/neutral foreground/background/border colors. It also supplies the subtle light/dark shadow pair used by soft Neumorphism. Choose palettes with quiet saturation; keep statuses legible and consistent across both modes. Do not create 16 unrelated component styles or let a theme redefine the meaning of passed, practicing, overdue, or error.

The 16 initial presets are:

| Mode | Theme | Palette character |
|---|---|---|
| Light | Morning Mist | Default; cool mist gray with a gentle blue accent. |
| Light | Quiet Linen | Soft ivory, warm stone, and muted indigo. |
| Light | Sage Garden | Pale sage, natural green, and deep evergreen text. |
| Light | Blue Harbor | Powder blue, sea haze, and calm navy accents. |
| Light | Lavender Still | Dusty lavender, cool gray, and restrained violet. |
| Light | Warm Sand | Oat, sand, and soft terracotta accents. |
| Light | Rosewater | Muted blush, warm porcelain, and rosewood accents. |
| Light | Sea Glass | Pale mint, aqua gray, and deep teal accents. |
| Dark | Midnight Ink | Soft charcoal with muted midnight-blue accents. |
| Dark | Deep Ocean | Dark blue slate with subdued teal accents. |
| Dark | Forest Dusk | Deep green-charcoal with gentle sage accents. |
| Dark | Plum Twilight | Charcoal plum with softened mauve-violet accents. |
| Dark | Graphite Calm | Neutral graphite with quiet cool-gray accents. |
| Dark | Night Lavender | Deep blue-violet with muted lavender accents. |
| Dark | Moss Night | Olive-charcoal with soft moss accents. |
| Dark | Cocoa Evening | Warm deep brown with quiet amber-clay accents. |

The Settings > Appearance section presents Light and Dark groups with selectable preview cards (swatches, theme name, mode label, and selected marker). A selection applies immediately with no save button. On mobile, use a one-column or compact two-column gallery; on desktop, use up to four columns. Retain the name and mode text so the choice is never color-only. Include a “Use Morning Mist” reset action. Apply the theme before the first visible paint where possible to avoid a flash of the default palette.

Accessibility targets: meet WCAG 2.2 AA text contrast for normal and large text (4.5:1 and 3:1 respectively), and at least 3:1 non-text contrast against adjacent colors for meaningful control boundaries, focus/selection indicators, and graph states. Refer to [W3C Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) and [SC 1.4.11](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html) during palette checks. Neumorphic shadows are decoration and never the only indication of a control boundary or state.

## Information architecture and screen intent

### Shared navigation and page frame

Add a shared application header for dashboard, onboarding, reviews, and settings, with the product name, active section, Reviews (including due count when already available), New Topic, Settings, and access to Appearance. The header accepts an optional due-count prop: Dashboard and Review Queue pass counts from their existing requests; onboarding, settings, and focus routes omit the badge instead of making duplicate requests solely for the header. At narrow widths, collapse secondary destinations into an accessible menu without hiding the current-page context. Use a distinct compact focus header on lesson and review-session pages: clear return action, topic/lesson or review context, and progress/status where relevant. Keep existing routes unchanged.

### Dashboard

- Give the active topic and next useful action the strongest hierarchy.
- Keep global learning stats, topic switching/deletion, streak/backlog messages, module readiness, exam entry, and competence graph available, but stop presenting every block with identical card weight.
- Make the active topic selector visually selected with more than a color change; expose its selected state accessibly.
- Promote a clear Continue/Start action when the existing lesson data can identify one; prefer an in-progress unlocked lesson, otherwise an available next lesson. If no safe target can be derived, retain the graph as the primary way to choose.
- Organize the graph with a readable legend, clear current/practicing/passed/locked states, and a viewport that preserves useful node text on narrow screens. Prefer horizontal scrolling at a usable minimum graph width over shrinking all labels. Keep keyboard node activation and tooltip information intact.
- Keep streak and backlog language encouraging and non-punitive. Distinguish active streak, broken streak, backlog, and first-activity states.
- Empty dashboard directs a new learner to one obvious start action.

### Onboarding and curriculum confirmation

- Show the four existing stages—topic, setup, generation, curriculum review—as a quiet step indicator so learners know where they are and can interpret back actions.
- Keep topic entry focused and forgiving; show validation beside the field and retain the topic after recoverable failures.
- Render level/time options as selectable controls with an unmistakable selected state and keyboard operation.
- Make LLM-not-configured and generation failures clear, actionable, and separate from ordinary validation.
- Treat generation as a progress state with calm copy and a clear recovery path; do not add artificial progress percentages to an unknown-duration operation.
- Present curriculum modules as scannable grouped sections. Keep lesson depth/time/artifact markers visible; expand outcomes and prerequisites on demand. Make Test Out affordance and its state clear where the existing callback supports it.
- Keep Accept & Start as the primary action; Tweak and Regenerate are secondary. Place the persistent confirmation action where it remains reachable on long curricula without obscuring content.

### Lesson learning, assessment, and remediation

- Keep lesson metadata compact: breadcrumb, lesson name, estimated time, depth/mode, and explicit progress/artifact/quiz status.
- Make the conversation the visual center. Separate learner/tutor messages with alignment plus labels or icon cues, maintain readable width, and style streamed content and typing feedback without flashing.
- Keep the composer easy to reach on mobile, preserve multiline text entry, disabled/sending/error states, and the existing message-length behavior.
- Make Continue, Check Understanding, Submit Artifact, and Settings recovery links visibly distinct from ordinary chat content.
- Quiz, exam, and retest screens share a clear question/progress pattern: current position, answered/unanswered state, response area, next/back, and submit. Show missing-answer errors next to the action that needs correction.
- Present pass, retry, remediation, weak areas, and score feedback with explicit labels and supportive language. Preserve the existing semantics and actions.
- Artifact review clearly separates instructions, editable submission, rubric, evaluation dimensions, and revise/resubmit action. Preserve upload constraints and feedback details.
- Module exams retain question navigation, answered count, incomplete-submit guard, retake/partial-retest paths, and celebration behavior while reducing decoration around focused work.

### Spaced reviews

- The review queue makes total due, overdue count, topic, due date, and review type easy to scan. Group or label overdue items without relying on red alone.
- Keep Start Review prominent when work is due. The empty state calmly confirms there is nothing to do today and offers a direct route back to learning.
- Review session uses a one-question focus layout with clear progress and an accessible cancel action. Feedback and end summary use the same status language as quizzes and exams.

### Settings and system states

- Add an Appearance section ahead of provider/data settings, with all 16 named themes grouped by light/dark mode, immediate preview/application, an accessible selected state, and a reset action. Clearly state that the choice is saved in this browser.
- Keep provider/model configuration, environment-key status, and JSON data management as distinct sections with clear labels and feedback.
- Preserve import/export behavior and progress feedback. Because restore replaces current learning data, state this plainly before import is committed and make cancellation obvious; do not change the API or import semantics in the UI-only work.
- Restyle loading skeletons, offline status, error boundary, locked lesson, empty states, validation, disabled, saving, and success states with the same tokens. Skeletons should resemble the final layout and remain quiet. Offline/error messages need text and an action, not color alone.

## File map

| File | Responsibility in the revamp |
|---|---|
| `client/src/index.css` | Semantic design tokens, neutral fallbacks, focus styles, reduced-motion and high-contrast fallbacks; no screen-specific hard-coded theme palette. |
| `client/src/theme/themes.js` (new) | Sixteen named light/dark palettes using the same typed-by-convention semantic roles. |
| `client/src/theme/ThemeProvider.jsx` (new) | Load, validate, apply, and persist the selected theme; set mode-appropriate `color-scheme` for native controls; expose theme catalog and selection action to React. |
| `client/src/components/ThemePicker.jsx` (new) | Accessible grouped gallery with previews, selection state, and reset action. |
| `client/src/main.jsx` | Wrap the app with `ThemeProvider` and initialize the saved theme before rendering. |
| `client/index.html` | If needed to prevent first-paint flash, add a minimal safe theme bootstrap that reads only the theme key and uses the validated default. |
| `client/src/App.jsx` | Preserve route definitions and keep the shared header/layout variants consistent. |
| `client/src/components/AppHeader.jsx` (new) | Standard navigation and focus-mode header variants with active route and review-count treatment. |
| `client/src/components/ui/Button.jsx` (new) | Primary, secondary, quiet, and destructive button variants with consistent disabled/focus states. |
| `client/src/components/ui/Surface.jsx` (new) | Raised/inset/flat grouped surface variants; no nested default shadows. |
| `client/src/components/ui/StatusBadge.jsx` (new) | Text-backed semantic state indicators. |
| `client/src/components/ui/ProgressBar.jsx` (new) | Accessible visual progress with a textual equivalent. |
| `client/src/pages/Dashboard.jsx` | Navigation use, stats, topic switcher, streaks, modules, primary next action, exams, and page composition. |
| `client/src/components/CompetenceGraph.jsx` | State palette, node affordance, focus treatment, responsive graph viewport, legend, and tooltip contrast. |
| `client/src/pages/OnboardingFlow.jsx` | Step indicator and existing topic/setup/generation flow presentation. |
| `client/src/pages/CurriculumConfirmation.jsx` | Module/lesson hierarchy, expansion, test-out markers, and action placement. |
| `client/src/components/LessonChat.jsx` | Focus header, metadata, conversation, composer, locked state, and lesson actions. |
| `client/src/components/QuizPanel.jsx` | Quiz question, progress, feedback, and outcome surfaces. |
| `client/src/components/RemediationPanel.jsx` | Remediation chat/retest choices and feedback states. |
| `client/src/components/ArtifactPanel.jsx` | Submission, upload, rubric, evaluation, and revision surfaces. |
| `client/src/components/ExamPanel.jsx` | Exam navigation, answer progress, submission, result, and celebration states. |
| `client/src/pages/ReviewQueue.jsx` | Review overview, due/overdue list, and empty state. |
| `client/src/components/ReviewSession.jsx` | Focus review session, progress, feedback, and summary. |
| `client/src/pages/SettingsPage.jsx` | Appearance theme gallery, provider/environment and data-management sections, import confirmation, and status feedback. |
| `client/src/components/Skeleton.jsx` | Loading states matching the refreshed layouts. |
| `client/src/components/OfflineIndicator.jsx` | Accessible offline banner using semantic status treatment. |
| `client/src/components/ErrorBoundary.jsx` | Error fallback presentation and recovery actions. |
| `client/src/__tests__/ui-primitives.test.jsx` (new) | Accessible labels, variants, disabled behavior, and progress/status semantics for shared primitives. |
| `client/src/__tests__/theme-presets.test.js` (new) | Catalog count/names/modes/required tokens and contrast validation for all presets. |
| `client/src/__tests__/ThemeProvider.test.jsx` (new) | Default, valid/invalid stored choice, immediate application, persistence, and graceful read/write storage failures. |
| `client/src/__tests__/ThemePicker.test.jsx` (new) | Theme groups, accessible selection, immediate application, and reset action. |
| `client/src/__tests__/ReviewSession.test.jsx` (new) | Submission, feedback/next, cancellation, and completion-summary behavior. |
| `client/src/__tests__/App.test.jsx` | Standard/focus header placement and route continuity. |
| `client/src/__tests__/OfflineIndicator.test.jsx` | Offline status and dismiss action semantics. |
| `client/src/__tests__/ErrorBoundary.test.jsx` | Error disclosure and recovery action semantics. |
| Existing tests in `client/src/__tests__/` | Preserve and extend behavior coverage for every affected screen; revise styling-coupled selectors only when necessary. |

Do not edit `server/`, database schemas, `client/src/api.js`, or provider configuration behavior for this project.

For every new or changed user-observable interaction, write/update the relevant React Testing Library test first, run it to confirm the missing behavior, implement the smallest change, then rerun the focused test. For presentation-only changes that JSDOM cannot verify, preserve semantic assertions and inspect the real rendered page at the responsive/contrast checkpoints below; do not add brittle tests that assert a specific Tailwind class or shadow string.

## Execution plan

### Chunk 1: Baseline and visual foundation

**Outcome:** a tested, reusable visual vocabulary exists before any screen-by-screen styling.

1. **Record baseline behavior.** Run `npm run test:frontend` and `npm run build`; note existing failures before UI edits. Walk every route and state listed above at 375px and desktop width if a browser is available. Do not edit `.env` or other credentials.
2. **Define semantic tokens.** In `client/src/index.css`, add light-theme canvas/surface/text/action/status/depth/radius/spacing/motion variables. Replace only global defaults; do not mass-convert the app in this task. Verify body background, default text, and existing reduced-motion behavior.
3. **Create the theme registry.** Add exactly the 16 listed palettes to `client/src/theme/themes.js`, with shared semantic keys and explicit `mode`. Write `theme-presets.test.js` first; verify count, unique IDs, names, modes, required roles, and contrast for body text, large text, action labels, status text, and control/focus/selection/graph boundaries across all themes (3:1 minimum for meaningful non-text cues). Implement the registry only after the failing test proves the contract.
4. **Implement `ThemeProvider`.** Add tests first for default, valid/invalid/missing storage, storage read/write exceptions, immediate DOM theme application, mode-appropriate `color-scheme`, and reload persistence. Apply semantic custom properties plus `data-theme` on the root element. If an HTML bootstrap is required to avoid a first-paint flash, keep it limited to reading the theme preference and setting the known theme ID; never inject arbitrary stored strings into style text. If storage is denied, still apply the theme in memory and present the session-only status.
5. **Build `Surface` and `Button`.** Create the primitives and `client/src/__tests__/ui-primitives.test.jsx`. Write tests first for variant semantics, native button type, disabled state, and focusable accessible names; run the new test and confirm it fails before implementation. Implement token-backed variants and verify the test passes.
6. **Build `StatusBadge` and `ProgressBar`.** Test visible state text, accessible label/value, and complete/empty progress. Ensure bars are not the sole source of the progress value.
7. **Introduce `AppHeader`.** Build standard and focus variants with real links/buttons, active destination semantics, responsive menu behavior, and optional due-count badge. Test accessible names, `aria-current`, menu open/close/keyboard operation, and omitted badge when no reviews are due.
8. **Validate every palette.** Check text contrast and distinguishability for all semantic pairs in all 16 themes. Target at least 3:1 against adjacent colors for meaningful control boundaries, focus/selection cues, and graph states. Increase contrast or use a solid/bordered treatment wherever dual shadows alone do not make an interactive state discernible.

Verification after this chunk: run `npm run test:frontend` and `npm run build`. All catalog/provider/picker/primitives tests pass. Cycle through all 16 choices and confirm the selected palette updates immediately and survives a reload; verify corrupt/missing/denied storage falls back safely or reports session-only status without crashing. In a browser, confirm native selects/menus use the right light/dark control palette.

### Chunk 2: Shared navigation and dashboard

**Outcome:** learners can orient themselves and resume/select learning without losing the competence graph or review affordances.

1. Update `client/src/App.jsx` and `client/src/components/AppHeader.jsx` so standard routes share navigation and lesson/review-session routes use focus headers. Preserve all paths and route elements.
2. Reshape `client/src/pages/Dashboard.jsx` into a clear page title/context, one primary learning action, topic selector, secondary stats/status, module readiness, and graph. Replace fixed gray/indigo/green/red paint with semantic tokens/primitives so every dashboard state follows the selected theme. Keep topic switching, deletion confirmation, exams, due-review navigation, and streak states.
3. Write tests first for a small derived selector that exposes a safe dashboard Continue action only if `dashboard.modules` includes an unlocked lesson suitable for resuming. Prefer a practicing lesson; otherwise choose the next unlocked lesson not passed/tested out. If none qualifies, do not render a misleading action. Confirm the candidate/fallback tests fail before adding the selector.
4. Update `client/src/components/CompetenceGraph.jsx` state tokens, node labels, focus outline, lock/practicing cues, tooltip surface, legend, and scroll container. Replace literal SVG fills/strokes with CSS variables supplied by the active theme. Use a graph minimum readable width based on SVG viewBox; prevent unreadable downscaling on a narrow viewport. Keep keyboard activation and prerequisite highlighting.
5. Refresh dashboard loading/empty/error/streak states in `client/src/components/Skeleton.jsx` and tests without changing fetch or state-update behavior.
6. Add or update `Dashboard.test.jsx`, `CompetenceGraph.test.jsx`, and `App.test.jsx` assertions for primary action/fallback, selected topic, due badge, all five graph states, focus/keyboard operation, standard-header integration, focus-header integration, and existing navigation.

Verification: `npm run test:frontend` and `npm run build`. Manually inspect an empty dashboard, multiple topics, active and overdue streak states, loading, active lesson, exam-ready module, locked node, and long graph at mobile and desktop widths.

### Chunk 3: Onboarding and curriculum review

**Outcome:** topic creation feels guided and the generated path can be reviewed without losing important details or actions.

1. Update `client/src/pages/OnboardingFlow.jsx` with a four-step indicator and page hierarchy while preserving the `step` state machine and all API calls.
2. Restyle topic form, setup choices, loading state, missing-LLM callout, errors, and back/continue controls. Replace fixed palette utilities with theme tokens. Make selected setup choices keyboard-operable and visibly selected without color alone.
3. Update `client/src/pages/CurriculumConfirmation.jsx` so modules, lesson depth/time, artifact requirements, outcomes/prerequisites, Tweak, Regenerate, and Accept & Start have clear hierarchy. The current Test Out button receives a no-op callback; do not style it as actionable. Hide it or render a clearly noninteractive “not available” marker until a real callback exists; do not add test-out behavior in this UI project. Keep long-list actions reachable without covering content.
4. Update `CurriculumFlow.test.jsx` first for the active step, selected option, back path, generation failure/retry, expanded curriculum detail, and primary/secondary actions. Verify any new user-observable assertion fails before the corresponding UI change; keep all current route outcomes.

Verification: `npm run test:frontend` and `npm run build`. Manually inspect each step, a long curriculum, narrow viewport, and both missing-key and generation-error states.

### Chunk 4: Lesson focus experience

**Outcome:** lesson conversation and composer become the clearest region of the product while metadata and learning-state controls remain easy to find.

1. Update `client/src/components/LessonChat.jsx` and `AppHeader.jsx` to apply the focus header, metadata hierarchy, locked state, learner/tutor message distinction, streaming state, typing indicator, and sticky/mobile composer. Replace hard-coded bubble/status/background colors with active theme tokens. Preserve message length, SSE flow, Continue, quiz prompt, artifact entry, and API-key recovery.
2. Keep the composer visible above mobile browser safe areas and onscreen keyboard where supported. Ensure the message list can scroll independently without hiding the newest response or keyboard focus.
3. Align `client/src/components/QuizPanel.jsx` question/answer/error/result surfaces to the shared progress and status patterns. Preserve retry/remediation/back actions.
4. Update `LessonChat.test.jsx` and `QuizPanel.test.jsx` before the corresponding interaction changes, only for meaningful semantics and behavior; retain tests for send, stream, Continue, quiz launch, error, and return flow.

Verification: run focused tests with `cd client && npx vitest run --config ./vitest.config.js src/__tests__/LessonChat.test.jsx src/__tests__/QuizPanel.test.jsx`, then `npm run test:frontend` and `npm run build`. Manually verify keyboard-only chat, long tutor text, send-in-progress, error recovery, locked lesson, and mobile composer scrolling.

### Chunk 5: Remediation, artifacts, and exams

**Outcome:** all evaluation paths feel like one coherent learning system, while retaining each flow's distinct purpose.

1. Update `client/src/components/RemediationPanel.jsx` to distinguish diagnostic feedback, re-teach chat, retest, prerequisite study, defer, and completion. Replace fixed gray/red/green/amber/indigo classes with semantic, theme-backed states. Keep each decision explicit and supportive.
2. Update `client/src/components/ArtifactPanel.jsx` to separate task instructions, input/upload, rubric, score breakdown, revision, and approval. Preserve file constraints, upload states, and all feedback fields.
3. Update `client/src/components/ExamPanel.jsx` for question navigation, answered count, current question, incomplete submission, result, partial retest/retake, and celebration. Reduce incidental decoration in active exam state; keep result actions discoverable.
4. Standardize success/failure/weak-area badges and progress bars through the UI primitives. Check that status is expressed in text and not hue only.
5. Extend `RemediationPanel.test.jsx`, `ArtifactPanel.test.jsx`, and `ExamPanel.test.jsx` for accessible labels, action states, upload/revision paths, unanswered guard, and outcome navigation while preserving current functional coverage.

Verification: run the three focused Vitest files, then `npm run test:frontend` and `npm run build`. Walk pass, fail, retry, retest, revise, upload error, and completed-module branches manually.

### Chunk 6: Reviews and settings

**Outcome:** spaced review and configuration/data tasks are calm, scannable, and transparent about important actions.

1. Update `client/src/pages/ReviewQueue.jsx` with due/overdue hierarchy, topic labels, due/interval details, Start Review, and empty state. Replace fixed colors with theme tokens. Preserve counts and session creation.
2. Update `client/src/components/ReviewSession.jsx` with focus layout, question/answer progress, feedback, cancellation, and result summary. Preserve one-question-at-a-time behavior and backend submission calls.
3. Write/update `ThemePicker.test.jsx`, `SettingsPage.test.jsx`, and `SettingsPageExportImport.test.jsx` first for theme selection/reset, section access, storage-failure feedback, and restore confirmation/cancel/confirm. Then add the Appearance section and `ThemePicker` to `client/src/pages/SettingsPage.jsx`, with 16 presets grouped by light/dark mode, immediate theme application, selected-state announcement, reset, and accurate “saved” or session-only status. Structure provider/environment and data management as distinct sections and replace fixed color utilities in these sections and progress/error/success feedback with theme tokens. Keep export, JSON selection/import, progress, success/error, and provider/model selections unchanged. Clearly disclose that restore replaces existing data and provide a deliberate confirmation step before calling `importData`.
4. Write `ReviewSession.test.jsx` before restyling that component, covering answer submission, feedback and Next, cancellation, summary completion, and the missing-session recovery action back to `/reviews`. Give the missing-state screen a clear “Back to Review Queue” button. Update `ReviewQueue.test.jsx` before changing review interactions, for relevant actions, badge/status names, and error feedback. Keep API mocking at the client boundary as it is today.

Verification: run focused review/settings tests, including the new `ReviewSession.test.jsx`, then `npm run test:frontend` and `npm run build`. Manually inspect no-due, overdue, multi-topic queue, review cancellation/result, settings loading, unconfigured provider, export failure, invalid JSON, restore confirmation, and both light/dark theme groups.

### Chunk 7: System states, responsive audit, and finish

**Outcome:** the visual language covers transient/system states and the whole app remains usable across input modes and viewport sizes.

1. Update `client/src/components/Skeleton.jsx` for refreshed dashboard, onboarding, lesson, quiz, and settings layouts. Preserve content footprint and reduce distracting shimmer; revise `Skeleton.test.jsx` so tests describe roles/layout hooks rather than incidental Tailwind class names.
2. Update `client/src/components/OfflineIndicator.jsx` and `client/src/components/ErrorBoundary.jsx` to use shared surfaces/actions and concise recovery hierarchy. Replace fixed amber/red/gray/indigo utility colors with semantic tokens. Keep live status and error-detail disclosure semantics; update `OfflineIndicator.test.jsx` and `ErrorBoundary.test.jsx` for status and recovery accessibility.
3. Add global `:focus-visible`, `aria-invalid`, disabled, selected, and high-contrast fallback styling in `client/src/index.css`. Confirm the reduced-motion rule still disables nonessential movement.
4. Audit every route at 320px, 375px, 768px, 1024px, and 1440px in representative light and dark themes. Cycle through all 16 presets at desktop and spot-check all at mobile. Also test 200% browser zoom, keyboard-only traversal, long topic/lesson/module labels, empty data, slow loading, offline, and reduced motion. Fix content clipping, horizontal page overflow, obscured sticky controls, and unreachable actions.
5. Run the full required checks: `npm test`, `npm run build`, `npm run lint`, and `npm run typecheck`. The last two currently report that no lint/typecheck is configured; record that accurately rather than treating their placeholder echo as substantive static analysis.
6. Review `git diff --check` and `git status --short`; ensure no backend/data/API behavior changed and no credentials or local database files were added.

## Definition of done

- Every existing route and state uses one calm, coherent, soft-neumorphic visual system, and the user can select at least 14 distinct peaceful themes; the implementation ships the 16 named light/dark presets above.
- Theme selection applies immediately and survives reload in the same browser profile when storage is available; if storage is denied, it remains active for the current session and reports that honestly. Invalid stored values fall back safely. All theme-dependent surfaces, text, controls, status, chat bubbles, and SVG graph states respond to the chosen palette.
- Major surfaces are visually distinct without relying on shadows alone; primary actions, selection, disabled, focus, and state feedback are obvious.
- Existing behaviors remain covered and pass, including topic switching/deletion, onboarding, graph activation, streaming chat, quizzes/remediation, artifacts, exams, reviews, and settings export/import.
- Dashboard provides a safe, truthful next action when current data supports one and a usable fallback when it does not.
- All page content remains available at 320px and 200% zoom; lesson/review controls remain reachable while scrolling and using the mobile keyboard.
- Statuses are text-backed; keyboard focus and reduced-motion behavior remain intact; text/background pairings meet the stated contrast targets.
- `npm test` and `npm run build` complete successfully; placeholder lint/typecheck scripts are reported honestly.
- No API, database, authentication, learner-profile, cloud-sync, or learning-state-machine scope is introduced; the cosmetic theme preference stays in browser storage and outside the roadmap backup.

## Pre-mortem: how this redesign could go wrong

- **Everything becomes a card.** Excessive nested shadows erase content hierarchy. Keep page canvas flat, reserve raised surfaces for real groups, and use spacing/dividers for internal structure.
- **Controls look decorative.** A soft shape can read as a label instead of a button. Keep button text contrast, visible hover/pressed changes, borders where needed, and a strong keyboard outline.
- **The dashboard becomes prettier but slower to use.** Verify the next lesson, reviews, and topic switching remain immediately findable before polishing supporting statistics.
- **The SVG graph turns into tiny text on phones.** Keep a readable graph minimum width and scroll within the graph region, not the whole page; test long labels and many modules.
- **The refactor breaks hidden flow behavior.** Change one screen family at a time, preserve handlers/API calls, and rerun the existing route/component tests after each chunk.
- **Visual states diverge across panels.** Put shared button/surface/badge/progress decisions in tokens and primitives; do not copy one-off gradients/shadows into every component.
- **Theme selection only recolors the shell.** Search for leftover hard-coded gray/indigo/status utilities, especially in SVG styles and feedback panels; test theme changes while visiting each screen family.
- **Sixteen palettes drift or become inaccessible.** Enforce the same semantic token schema and run contrast checks across every palette; do not accept “looks calm” as a substitute for readable contrast.
- **Theme preference flashes or silently resets.** Validate the stored ID, initialize before visible render where practical, test reload persistence, and fall back to Morning Mist for unknown values.
- **Motion undermines calm.** Use short feedback transitions and respect reduced motion; avoid pulsing except for a genuinely active streaming/connection cue.
- **Restore feels casual despite replacing data.** Put the replacement consequence immediately beside a confirm/cancel choice and verify both outcomes in tests.
