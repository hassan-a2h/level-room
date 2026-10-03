# Playground V2: Full-App UI/UX Implementation Plan

> **For agentic workers:** REQUIRED: Use `executing-plans`, or `subagent-driven-development` when independent tasks can be delegated. Complete the tasks in dependency order. Do not substitute prototype fixtures for application behavior.

**Goal:** Apply the approved Playground V2 design across the current Roadmap Learning app, with eight paired color families—16 themes total—while preserving real learning progress, assessment rules, and existing functionality.

**Architecture:** Keep React, React Router, the existing page/component boundaries, and the Express/SQLite backend. Extend the current semantic theme system and reusable UI components. Add narrowly scoped contract fixes where the current frontend and backend disagree.

**Tech Stack:** React 19, React Router 7, Vite, Tailwind 4, CSS/SVG, Vitest, Testing Library, Supertest. Add Playwright and axe as development dependencies for browser verification.

**Plan date:** 2026-10-03. **Worktree baseline:** `2245cc5d2e97f02564a2ea23bada96f585863373`.

---

## 1. Goal, scope, and source of truth

### Decisions already approved

- Eight light/dark pairs, retaining all 16 existing theme IDs.
- Rewards reflect existing mastery, completion, assessment evidence, and weekly activity.
- Enhance the six existing activity formats; do not introduce a new simulation schema.
- Apply V2 layouts, roadmap visuals, guide character, and microinteractions throughout the app.
- Real backend state determines availability, completion, scores, and scheduling.
- No new XP ledger, levels, leaderboard, or invented progression.

### Visual references

Use these archived references inside this worktree:

- `docs/design-reference/playground-v2/playground-v2.html`
- `docs/design-reference/playground-v2/full-app/`
- The screenshots and module mapping inside the archived full-app prototype folder.

Original temporary locations:

- `/tmp/roadmap-ux-concepts-2026-10-03/playground-v2.html`
- `/tmp/roadmap-ux-concepts-2026-10-03/full-app/`

The prototype supplies visual design and interaction examples. Production source supplies behavior and data contracts.

Explicitly exclude prototype-only controls: sample-data resets, scenario shortcuts, simulated provider connections, hardcoded SQL lessons, keyword grading, fabricated progress percentages, and manual generation-completion buttons.

### Routes and ownership

Preserve these routes:

| Route | Existing owner |
|---|---|
| `/` | `Dashboard` |
| `/onboarding` | `OnboardingFlow`, with `CurriculumConfirmation` |
| `/topic/:topicId/lesson/:lessonId` | `SessionPage`, `SessionPlayer` |
| `/topic/:topicId/continue` | `ContinuationFlow` |
| `/reviews` | `ReviewQueue` |
| `/review/:sessionId` | `ReviewSession` |
| `/settings` | `SettingsPage` |

Keep checkpoints inside the Dashboard’s existing `ExamPanel` flow. Do not port the prototype’s separate checkpoint URL.

Keep Trail → Track → Chapter → Session, existing continuation lineage, and actual later Chapters.

Baseline observed during plan preparation: 191 frontend tests passed across 32 files; the production build passed. Re-run the full baseline before implementation. The audit found contract gaps that those tests currently miss; the relevant tasks below explicitly repair them.

---

## 2. Visual system and shared interfaces

### Theme catalog

Modify `client/src/theme/themes.js`.

Retain existing preset IDs and names. Add:

```js
{
  id,
  name,
  mode: 'light' | 'dark',
  familyId,
  pairedThemeId,
  tokens
}
```

Export `THEME_FAMILIES`:

```js
[
  { id, name, lightId, darkId }
]
```

Preserve `THEMES`, `THEME_IDS`, `getTheme`, and `DEFAULT_THEME_ID`. The default remains `morning-mist`, with the approved Playground light appearance.

Use these color anchors. Each tuple is canvas / surface / text / accent.

| Family | Existing light ID | Existing dark ID | Light anchors | Dark anchors |
|---|---|---|---|---|
| Playground | `morning-mist` | `forest-dusk` | `#F7F8F2 / #FFFFFF / #243329 / #357849` | `#111A17 / #19241F / #EEF4E9 / #98CA78` |
| Ocean | `blue-harbor` | `deep-ocean` | `#F0F7FB / #FFFFFF / #253749 / #227681` | `#101C28 / #192A38 / #EDF6FB / #76CFCE` |
| Lavender | `lavender-still` | `night-lavender` | `#F7F4FB / #FFFFFF / #382D43 / #7E5E9A` | `#1B1929 / #28243B / #F2EEFB / #BCA4E4` |
| Ember | `warm-sand` | `cocoa-evening` | `#FCF4EC / #FFFFFF / #443125 / #9A5D32` | `#241B18 / #302521 / #FFF1E4 / #EDAE78` |
| Sage | `sage-garden` | `moss-night` | `#F1F6EB / #FEFFF9 / #2E3B27 / #54713B` | `#1D241A / #293324 / #F0F5E8 / #B5CF85` |
| Rose | `rosewater` | `plum-twilight` | `#FBF2F5 / #FFFFFF / #432C37 / #96536D` | `#281D2B / #38293E / #F9EEF7 / #DFA1C6` |
| Slate | `quiet-linen` | `graphite-calm` | `#F4F6F9 / #FFFFFF / #2C3645 / #4B6888` | `#181F29 / #253040 / #F0F4FA / #A9BDD7` |
| Lagoon | `sea-glass` | `midnight-ink` | `#EFF9F6 / #FFFFFF / #243C36 / #317666` | `#112322 / #1C3532 / #EEF9F4 / #82D5BC` |

### Token rules

Retain existing semantic tokens and `--ui-*` aliases. Add tokens for:

- Decorative card borders, separate from meaningful control boundaries.
- Button depth and subtle panel shadows.
- Roadmap scenery and connectors.
- Mastered, current, available, and locked nodes.
- Informational feedback and earned mastery marks.

Use deterministic derivation:

- `mix(a,b,t)` mixes RGB channels and rounds to integers.
- Raised surface: mix surface with white by `0.20` light or `0.07` dark.
- Sunken surface: mix canvas with text by `0.04` light, or black by `0.12` dark.
- Accent-soft background: mix surface with accent by `0.12`.
- Decorative border: mix surface with text by `0.12`.
- Control border: start at mix surface with text by `0.45`.
- Soft and muted text: start at mix text with canvas by `0.14` and `0.25`.
- When needed, move a derived foreground toward primary text in one-percent increments until its required contrast passes.

Require:

- Text: at least 4.5:1 against its actual background.
- Meaningful boundaries, icons, and focus indicators: at least 3:1.
- Button labels: 4.5:1 in normal and hover states.
- Stable success/warning/error meanings across families.
- Labels and icons accompanying status colors.

Keep color literals in the catalog and generated theme assets. Components use semantic tokens.

### Theme persistence and first paint

Preserve `mastery-roadmap-theme` and the existing ThemeProvider interface:

```js
{ theme, selectTheme, storageMessage }
```

Create `scripts/generate-themes.js` to generate theme CSS and a small pre-paint initializer from the same catalog.

- The initializer validates the saved ID and sets theme attributes before the first painted frame.
- CSS provides the default theme when initialization or storage is unavailable.
- Preserve native `color-scheme`.
- Storage failures keep the selected theme active in memory and show the existing session-only message.
- Invalid saved IDs fall back to the default.
- Synchronize valid theme changes between tabs through the storage event.
- Theme changes must not remount lessons, clear answers, collapse feedback, or reset navigation.

Add `themes:generate` and `themes:check` scripts. The check command compares generated output without rewriting it.

### Shared component contracts

Extend existing `Button`, `Surface`, `StatusBadge`, and `ProgressBar`. Add small, focused shared components:

```js
Icon({ name, decorative = true, label })
GuideCharacter({ expression, size })
OutcomeChips({ outcomes })
MasteryBadge({ state, label })
Dialog({ open, title, onClose, children })
```

`MasteryBadge.state` is `locked`, `available`, `practicing`, or `mastered`.

Use native controls, accessible names, and ordinary React rendering. Dialogs provide initial focus, trapped focus, Escape, background inertness, and focus restoration. Reuse them for deletion, restore, and disconnect confirmation.

### Geometry, layout, and motion

- Panels: 18px corners; inner tiles: 13px; buttons: 10px.
- Roadmap nodes: approximately 64px; minimum interactive target: 44px.
- Standard content: maximum 1300px.
- Mobile: ≤700px, single-column content and standard-page bottom navigation.
- Tablet: 701–1099px, stacked primary content with two-column support cards where useful.
- Desktop: ≥1100px, Dashboard primary/support columns approximately `2.2fr / 1fr`; lesson guide approximately 320px.
- Focus screens use their existing return/progress header and omit standard bottom navigation.
- Preserve safe-area padding and prevent fixed navigation, composers, banners, and sticky actions from overlapping.
- Use CSS transitions and local SVG artwork. Add no animation framework or remote font dependency.
- Hover/press transitions: 120ms; disclosure/feedback: 220ms; earned celebration: approximately 500ms.
- No perpetual bouncing or pulsing.
- Reduced motion removes movement and confetti while retaining static feedback.
- Preserve forced-colors and increased-contrast support.

---

## 3. Ordered implementation tasks

For behavior changes, add the failing regression test first, implement the change, then run the affected suites. Verify styling through browser captures rather than tests that merely assert CSS class names.

### Task 0 — Freeze references and establish the parity ledger

**Work:** Documentation and test baseline.

- [x] Copy the approved prototype and screenshots into `docs/design-reference/playground-v2/` before temporary files disappear.
- [x] Save this plan as `.agents/superpowers/specs/2026-10-03-playground-v2-app-revamp.md`.
- [ ] Create a flow ledger linking every flow/state listed below to its component, relevant API, test, and browser scenario.
- [ ] Run the full existing tests and build; record preexisting failures separately.
- [x] Create the feature branch/worktree used for implementation: `docs/playground-v2-app-revamp-plan`, `.worktrees/playground-v2-app-revamp-plan`.

**Exit:** Every existing route and embedded flow has an owner. No production code has changed.

### Task 1 — Implement all 16 themes

**Files:** Theme catalog/provider/picker, theme styles, `client/index.html`, generator script, package scripts.

- [ ] Implement the eight explicit pairs and token derivation above.
- [ ] Add generated CSS and pre-paint initialization.
- [ ] Keep all existing IDs, names, selection behavior, and storage fallback.
- [ ] Present eight family cards, each containing light/dark radio choices and a miniature page preview.
- [ ] Add a compact “switch to paired light/dark theme” action that stays within the selected family.
- [ ] Update palette-anchor assertions to the approved colors; retain and expand contrast assertions.
- [ ] Verify reload, invalid selection, denied storage, cross-tab changes, and first paint.

**Tests:** `theme-presets`, `ThemeProvider`, `ThemePicker`.

**Exit:** All 16 themes cover controls, surfaces, typography, status messages, code, dialogs, skeletons, and roadmap artwork.

### Task 2 — Shared components, shells, and microinteractions

**Files:** Existing `components/ui/`, `components/layout/`, `AppHeader`, shared components, styles.

- [ ] Implement the shared contracts above.
- [ ] Replace heavy neumorphic shadows with V2 borders, shallow depth, and restrained shadows.
- [ ] Preserve one primary navigation per standard page and existing focus headers.
- [ ] Add a working skip link and consistent main landmark.
- [ ] Keep finite, positive review badges and correct active-route semantics.
- [ ] Implement guide-sheet and confirmation-dialog keyboard behavior.
- [ ] Style loading, empty, error, readonly, disabled, selected, and busy states.
- [ ] Add a safe unknown-route page with a Trail return action.

**Tests:** UI primitives, `AppShell`, `AppHeader`, `App`, keyboard dialog behavior.

**Exit:** Shared components work in every theme without page-specific color overrides.

### Task 3 — Protect flows when learning data changes

**Files:** `client/src/api.js`, server request handling, data-import route, new shared server revision utility.

A successful restore can replace records while old requests still reference the same numeric IDs. Close that boundary before updating the assessment flows.

- [ ] Maintain an in-process `dataRevision`, initialized with a UUID.
- [ ] Return it through `X-Learning-Data-Revision`; expose/allow the header through existing CORS handling without weakening origin restrictions.
- [ ] The current client captures the revision and sends it with mutations.
- [ ] Reject stale mutations with HTTP 409 and `code: "DATA_CHANGED"`.
- [ ] Capture the revision before awaited generation/evaluation; verify it again before publishing or committing results.
- [ ] Rotate the revision only after a successful import transaction.
- [ ] Invalidate active review sessions/receipts and supersede old generation work after restore.
- [ ] Preserve old drafts for viewing/copying after a conflict, but block submission against restored IDs. Offer an explicit return/reload action.
- [ ] The importing tab adopts the new revision and refreshes affected settings/state. Cross-tab storage notifications are advisory; server checks remain effective when storage is denied.
- [ ] Retain headerless compatibility for older callers.
- [ ] Preserve HTTP status and structured error fields in API errors; do not convert streams into JSON requests.

**Tests:** Import during delayed review, Build, placement, checkpoint, activity evaluation, and generation; failed import does not invalidate state.

**Exit:** Old asynchronous work cannot modify restored records.

### Task 4 — Dashboard and tactile roadmap

**Files:** `Dashboard`, `TodayCard`, `TrailMap`, `ChapterCard`, `WeeklyRhythm`, `FocusAreas`.

- [ ] Rebuild the Dashboard using the V2 mission card, chapter scenery, roadmap nodes, and support rail.
- [ ] Keep roadmap content as semantic ordered lists with actual Session buttons. SVG/CSS paths are decorative.
- [ ] Use generic chapter scenes; do not infer subject-specific facts or copy SQL fixture art into unrelated topics.
- [ ] Preserve mobile DOM order: Today → Reviews due → Trail so far → Weekly rhythm → Focus areas → Remaining Trail.
- [ ] Follow the server’s `nextAction` for Session, checkpoint, review, setup, completion, and unavailable states.
- [ ] Preserve URL topic selection, Trail switching, parent Track navigation, archived/completed Tracks, and deletion restrictions for linked continuations.
- [ ] Keep current Chapters expanded, completed Chapters collapsible, and future work visibly locked with its reason.
- [ ] Completed Session actions open review rather than starting a fresh attempt.
- [ ] Represent a passed Session with one earned mastery mark. Do not infer three-star grading tiers.
- [ ] Derive active-Track counts from real Session state. Keep weekly activity based on existing local-date/time-zone data.
- [ ] Cover empty topics, missing Chapters, loading, failed requests, stale switching responses, incomplete setup, generation recovery, and deletion failure.

**Tests:** `Dashboard`, `TrailMap`, dashboard-summary backend suites.

**Exit:** Every Dashboard action reaches the correct real flow; no fixture IDs or client-generated unlock rules remain.

### Task 5 — Onboarding, placement, and Track preview

**Files:** `OnboardingFlow`, `CurriculumConfirmation`, curriculum routes/recovery utility.

Preserve the flow:

```text
Destination → Starting point → Placement when required
→ Learning rhythm → Generation → Preview → Confirmation
```

- [ ] Apply V2 choice cards, step navigation, guide prompts, and outcome disclosures.
- [ ] Preserve destination validation, capacity errors, canonical levels, and canonical study windows.
- [ ] Align placement with the backend: Beginner continues directly; Intermediate/Advanced require verification.
- [ ] Render the real six written questions: five target questions and one stretch question.
- [ ] Save the server-recommended effective level with its assessment ID. Remove unsupported “keep my self-reported level” bypasses.
- [ ] Clear obsolete assessment state when the requested level changes.
- [ ] Preserve answers on evaluation failure and handle expired/superseded assessments.
- [ ] Remove the UI-only pace selector; it currently does not affect saved profiles or generation.
- [ ] Bound setup-choice loading and provide explicit retry instead of an automatic error loop.
- [ ] Preserve durable generation, SSE-to-polling fallback, retry/deadline information, and cancellation of client subscriptions.
- [ ] Show explanatory design stages with indeterminate progress; the server does not provide a stage percentage.
- [ ] Reopen saved drafts without generating another one. Redirect already-confirmed recovery to that Track’s Dashboard.
- [ ] Return matching completed placement metadata when available for recovered profiles. Label it as reusable verification, not an exact reconstruction of the original self-report.
- [ ] Require re-verification when editing an unverified recovered/imported non-Beginner profile.
- [ ] Preview real Chapters, outcomes, prerequisites, estimated times, and Builds. Deduplicate outcomes by ID.
- [ ] Keep the preview after tweak/regenerate/confirm failure and reject late responses from another topic.
- [ ] Keep step navigation from bypassing required creation, profile, or generation steps.

**Tests:** `CurriculumFlow`, recovery/stream/setup-question client suites; curriculum, placement, and recovery backend suites.

**Exit:** Beginner and verified higher-level setup both complete through real API contracts.

### Task 6 — Sessions, six activity formats, and tutor

**Files:** `SessionPage`, `SessionPlayer`, `ActivityRenderer`, the six block components, `SessionComplete`, `TutorSidecar`.

- [ ] Apply the V2 workbench, compact progress, outcome chips, guide rail, and mobile guide sheet.
- [ ] Retain all six activity types and schema version 1.
- [ ] Enhance existing public structures: worked-example timelines, choice comparison cards, ordering cards, written-answer evidence feedback, and reflection summaries.
- [ ] Do not synthesize interactive scientific/code experiments from prose or execute learner/generated code.
- [ ] Key activity state by block ID. Preserve unsent drafts when reviewing another step; prevent consecutive same-type activities from sharing input state.
- [ ] Keep authoritative server progress separate from a local `heldFeedbackBlockId`.
- [ ] After a successful scored answer, update server state but hold its immutable feedback until explicit Continue. Continue clears the hold and makes no second mutation.
- [ ] Hold final scored feedback before Build handoff or completion.
- [ ] Keep incorrect answers editable and retain them after network/evaluator failure.
- [ ] Preserve mutation locks, latest-state conflict recovery, required/optional block semantics, and future-step locks.
- [ ] Allow completed-step review during Build handoff and from completed Sessions.
- [ ] For restored passed Sessions lacking an activity document, show a historical readonly summary and prior Build. Never call activity generation or invent missing responses.
- [ ] Select the completion takeaway from a reflection block. Avoid showing an option ID or unrelated answer.
- [ ] Show actual review timing when available; otherwise use neutral wording rather than promising “tomorrow.”

Tutor requirements:

- [ ] Use the displayed block as context during review/held feedback.
- [ ] Keep one draft/message state for desktop and mobile composers.
- [ ] Parse complete SSE events, including chunk boundaries, `{message,code,retryable}` errors, and explicit completion.
- [ ] Treat partial text followed by error or premature closure as incomplete.
- [ ] Retain drafts on failure, prevent double-send, and abort/ignore stale streams after navigation.
- [ ] Preserve safe Markdown and message bounds. Never expose private grading material.

**Tests:** `SessionPage`, `SessionPlayer`, `ActivityBlocks`, `TutorSidecar`, activity schema/runtime/backend suites.

**Exit:** Six formats work with arbitrary valid curricula, held feedback is reliable, and theme changes preserve drafts.

### Task 7 — Practical Builds and assessment feedback

**Files:** `ArtifactPanel`, lesson/artifact route handling, shared evidence formatting/validation.

- [ ] Present the real task brief, constraints, deliverables, success criteria, setup/fallback options, hints, and safety notes.
- [ ] Keep four evidence fields: `setup`, `actions`, `result`, `reflection`.
- [ ] Match backend limits: 16 KiB per field and 64 KiB for compiled evidence, measured in UTF-8 bytes.
- [ ] Allow bounded UTF-8 text files to populate Actions; reject oversized/binary content and confirm before replacing an existing draft. Never execute uploads.
- [ ] Remove unsupported legacy grading forms. Historical artifacts without a valid task specification remain readable.
- [ ] Persist new structured evidence inside the existing TEXT column using:

```js
{
  kind: 'build-evidence',
  version: 1,
  evidence: { setup, actions, result, reflection }
}
```

- [ ] On reads, validate recognized envelopes and return `evidence` plus flattened `content`. Old plain-text rows return `evidence: null`.
- [ ] Do not parse legacy flattened text heuristically into editable fields.
- [ ] Validate recognized envelopes during backup import; preserve backup version 2 and existing columns.
- [ ] Keep required-activity readiness, the four rubric dimensions, no zero dimension, and the ≥6/8 pass rule.
- [ ] Preserve failed evidence for revision and restore structured fields after reload.
- [ ] Keep the earned passing rubric visible until the learner chooses Continue.
- [ ] Ensure only a newly passing result triggers completion/celebration.

**Tests:** `ArtifactPanel`, artifacts API, data export/import, transactional rollback and duplicate completion.

**Exit:** Submit → feedback → revision → pass → Session completion works without losing evidence.

### Task 8 — Checkpoints, autosave, and targeted retakes

**Files:** `ExamPanel`, checkpoint components, exam routes, checkpoint-format utility.

- [ ] Apply V2 intro, question cards, progress/navigation, outcome scores, and repair actions.
- [ ] Preserve ≥80% overall and ≥60% on every core outcome. Backend evaluation remains authoritative.
- [ ] Keep readiness locked until every required Session has passed.
- [ ] Distinguish missing attempts from unavailable/corrupt attempts using real HTTP status.
- [ ] Scope partial resume/save validation to the targeted outcomes. Permit breadth-only targeted subsets while requiring core outcomes for full checkpoints.
- [ ] Keep the root full attempt as the partial attempt’s parent.
- [ ] Build successive targeted results from the latest aggregated evidence for that root, retaining earlier repairs.
- [ ] Permit targeting only actual failed outcome IDs. An overall miss with no failed outcomes offers a full retake.
- [ ] Maintain one active pending attempt per Chapter. Supersede obsolete pending attempts only after a valid replacement exists.
- [ ] Fence autosave and submission by attempt identity and saved-answer revision.
- [ ] Serialize debounced saves; capture the attempt identity in each queued operation.
- [ ] Flush saves before explicit pause/return and final submission. Show unsaved state when flushing fails.
- [ ] Preserve local drafts on conflict and offer explicit “Use saved answers” or “Overwrite with this draft.”
- [ ] Prevent start/retake/submit duplication and writes during evaluation.
- [ ] Complete a Chapter and schedule completion effects only once. Return `newlyCompleted` for earned celebration.

Extend existing API signatures compatibly:

```js
saveExamProgress(topicId, moduleId, answers, {
  attemptId, expectedAnswersRevision
})

submitExam(topicId, moduleId, answers, localDate, {
  attemptId, expectedAnswersRevision
})

submitPartialRetest(topicId, moduleId, retestId, answers, localDate, {
  expectedAnswersRevision
})
```

Use SHA-256 of canonical saved-answer JSON as `answersRevision`; no database revision column is required. Check identity, status, and revision again inside the final transaction. Headerless/legacy requests without attempt options are accepted only when the pending attempt is unambiguous.

**Tests:** `ExamPanel`, exams API, checkpoint-format; multi-core/breadth targeting, repeated repairs, stale saves, multiple tabs, and failed evaluation.

**Exit:** Retakes retain repaired mastery, autosave cannot reach another attempt, and failed results never celebrate.

### Task 9 — Retrieval practice and authentic results

**Files:** `ReviewQueue`, `ReviewSession`, review routes.

The existing frontend submits each answer before the backend accepts an incomplete batch. Replace that incompatible interaction:

```text
One question at a time → Previous/Next → Review answers
→ Submit complete batch → Question feedback → Summary
```

- [ ] Collect answers locally; submit only after all required answers are present.
- [ ] Retain answers and the current question after final-submission failure.
- [ ] Use authentic feedback, score, scheduling dates, and accelerated/revisit results.
- [ ] Add queue filters as client-side presentation; preserve actual due totals and server batch selection.
- [ ] Add real topic/lesson/Chapter titles to result metadata.
- [ ] Assign unique internal/public question IDs using SRS item ID and ordinal; never trust repeated generator IDs.
- [ ] Validate complete answer keys, nonblank strings, and a 2,000-character per-answer bound.
- [ ] Validate evaluator coverage and finite scores before updating SRS; derive pass status from the accepted score.
- [ ] Keep one active in-process review session. Starting again reuses its public questions rather than creating overlapping practice.
- [ ] Expire pending sessions after two hours. Keep identical completed-submission receipts for 30 minutes, capped at 100, to support response-loss retry without repeating SRS effects.
- [ ] Lock submit/cancel races. Different answers after completed submission return conflict.
- [ ] Reject deleted SRS items and stale data revisions before committing.
- [ ] Handle missing navigation state, expiry, restart, empty queue, failed generation, provider unavailability, and cancellation failure truthfully.
- [ ] Do not promise durable pause/resume across server restart.

**Tests:** Replace unsupported per-question mocks in `ReviewSession`; extend queue/SRS suites and add a real client/server batch-contract test.

**Exit:** Practice completes through the actual backend, and retry cannot award or schedule twice.

### Task 10 — Track completion and continuation

**Files:** `ContinuationFlow`, existing continuation API/routes.

- [ ] Apply V2 completion summary, strengths/gaps, Build evidence, profile controls, generation, and preview.
- [ ] Preserve automatic generation of one balanced next Track for an eligible parent.
- [ ] Keep completion details visible while generating or showing an error.
- [ ] Distinguish readiness/dashboard loading failure from generation failure.
- [ ] Preserve transient drafts; refresh/re-entry regenerates them.
- [ ] Changing level/time makes the preview stale and disables confirmation until refreshed or successfully adjusted.
- [ ] Preserve the preview after adjustment/confirmation failure.
- [ ] Keep atomic child creation, duplicate-confirm conflicts, parent lineage, actual destination validation, and defer/back actions.
- [ ] Exclude the prototype’s Deepen/Broaden lane selection; no supported API accepts it.
- [ ] Do not replace parent progress or locally reset production Track state.

**Tests:** `ContinuationFlow`, continuation API, backend continuation/lineage suites.

**Exit:** Only truly completed Tracks continue, and a failed confirmation leaves the existing Track intact.

### Task 11 — Settings, authentication, backups, and global recovery

**Files:** `SettingsPage`, `ThemePicker`, `CodexConnection`, `OfflineIndicator`, `ErrorBoundary`, Markdown styling.

- [ ] Organize appearance, learning explanation, provider/model, connection, and data controls using V2 panels.
- [ ] Use the real provider catalog and supported model/reasoning combinations.
- [ ] Preserve key-presence indicators; render no API-key input.
- [ ] Keep real browser, device-code, manual-code, account-switching, disconnect, checking, unavailable, timeout, poll failure, copy failure, and cancellation states.
- [ ] Preserve validated authorization URLs, local-origin guards, focus restoration, polling cleanup, and readiness callbacks.
- [ ] Never persist credentials in theme preferences, exports, or UI state.
- [ ] Keep backup version 2, replacement confirmation, transactional validation/rollback, private-field exclusion, and same-file retry.
- [ ] Use action-specific notices for settings save, export, and restore.
- [ ] Refetch restored provider/settings state after successful import; keep browser-local theme selection.
- [ ] Revoke download URLs and clean up file readers and pending requests.
- [ ] Theme offline/loading/error banners and abort outstanding health checks on unmount.
- [ ] Keep error details sanitized and safe Markdown behavior unchanged.

**Tests:** Settings, export/import, Codex connection, offline indicator, ErrorBoundary, semantic cleanup, unsafe content/link scenarios.

**Exit:** Every operational state receives the design treatment while retaining real recovery and privacy behavior.

---

## 4. Verification and acceptance criteria

### Required regression coverage

| Area | Required scenarios |
|---|---|
| Themes | 16 presets; pair switching; reload; first paint; invalid IDs; denied storage; cross-tab changes; unchanged lesson drafts |
| Roadmap | Empty/setup/active/completed/archived; all next actions; long titles; missing optional metadata; locked prerequisites; switching/deletion races |
| Setup | Beginner; verified Intermediate/Advanced; downgrade; expired assessment; retained answers; saved draft; retry exhaustion; confirmed recovery |
| Sessions | Six types; consecutive same-type blocks; optional blocks; held final feedback; readonly review; duplicate click; server conflict; restored historical completion |
| Tutor | Split SSE events; Unicode chunks; explicit errors; partial/empty streams; cancellation; late response; mobile focus |
| Builds | Byte limits; upload errors; evidence reload; revision; failed grading; duplicate pass; historical artifacts; rollback |
| Checkpoints | Readiness; autosave failure; pause flush; attempt/revision conflicts; unanswered focus; core/breadth misses; successive repairs; overall-only miss |
| Reviews | Complete batch; partial batch rejection; duplicate question IDs; retry; submit/cancel race; reused session; expiry/restart; deleted SRS item |
| Continuation | Ineligible parent; automatic generation; stale profile; failed adjustment; failed/concurrent confirmation; defer; preserved lineage |
| Settings/data | Catalog/load/save errors; all auth states; unsafe URLs; malformed/private backup; failed restore; restored settings; restore during evaluation |
| Global layout | Offline/error/loading; keyboard-only; touch; 200% zoom; reduced motion; forced colors; long code and user text |

### Browser verification

Add Playwright and axe development tooling.

- Serve the real React frontend.
- Browser fixtures intercept actual API URLs and use production-shaped responses.
- Fail tests on unexpected API calls, console exceptions, and unhandled errors.
- Exercise all routes and inline checkpoints in the default light/dark pair.
- Render representative lesson, roadmap, result, settings, and dialog states in all 16 themes.
- Check widths 320, 375, 768, 1024, and 1440px, plus 200% zoom.
- Require no page-level horizontal overflow; code/table containers may scroll locally.
- Verify focus remains visible and unobscured.
- Check touch and keyboard ordering, radio selection, disclosures, dialogs, and guide sheets.
- Capture screenshots against the approved V2 reference. Review intended differences before accepting screenshot baselines.

### Real contract tests

Add a frontend contract suite using Testing Library, real Express routers through Supertest, temporary SQLite databases, and stubbed LLM responses.

At minimum, test:

1. Higher-level setup through placement and profile saving.
2. Review collection through one final batch and authentic summary.
3. Build submission → reload → revision → pass.
4. Targeted retake → reload → second repair.
5. Backup restore → open a passed historical Session.
6. Restore during a pending evaluation.

Do not mock unsupported API behavior into success. Do not use personal databases, real credentials, or live OAuth in automated tests. Never read `.env` or credential values.

### Commands and completion gates

For targeted frontend tests:

```bash
npm run test:frontend -- src/__tests__/<suite>.test.jsx
```

For targeted backend tests:

```bash
npx vitest run --config server/vitest.config.js server/__tests__/<suite>.test.js
```

Final gates:

```bash
npm run themes:check
npm test
npm run build
npm run test:e2e
```

Add `test:e2e` to package scripts. The existing lint/typecheck scripts are placeholders and must not be reported as meaningful validation.

Completion requires:

- Every parity-ledger row implemented and verified.
- All 16 themes passing semantic contrast checks.
- Existing valid workflows preserved; documented contract fixes covered by real integration tests.
- No prototype fixtures or fake grading/provider behavior in production.
- No new private grading material exposed.
- No database schema or backup-version migration required.
- A final report of changed behavior, test results, screenshots, and bundle-size delta.

---

## 5. Delivery order and defaults

Implement in this sequence:

```text
References/baseline
→ Themes/shared components
→ Data revision protection
→ Dashboard/setup
→ Sessions/tutor
→ Builds/checkpoints
→ Reviews/continuation/settings
→ Full browser and contract verification
```

Keep each stage runnable. Commit coherent milestones after their affected checks pass; do not combine unrelated backend fixes into unreviewable UI commits.

Use existing names and domain rules. Preserve historical data rather than generating replacement evidence. When the server cannot provide a score, date, progress percentage, or verification record, show a truthful fallback.

Deployment follows verification and any explicitly requested publication approval. This plan itself performs no production changes.
