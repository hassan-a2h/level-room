# Multi-Theme Trail UI/UX Overhaul Implementation Plan

**Plan date:** 2026-09-27

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` when subagents are available or `superpowers:executing-plans` otherwise. Track every checkbox. Follow the dependency graph and file-ownership rules. Use TDD, commit after every task, and do not combine unrelated work.

**Goal:** Replace the current palette-swapped interface with three complete, switchable learning experiences—Living Atlas, Curiosity Engine, and Mission Workshop—while keeping one authoritative learning flow and making every route focused, delightful, accessible, responsive, and faithful to the approved renders.

**Architecture:** Keep the existing React, React Router, Express, SQLite, activity, checkpoint, review, Build, continuation, and provider behavior. Extract page behavior into stable feature controllers and normalized view models, then render those models through three lazily loaded theme packs. Theme packs own composition, artwork, typography, motion, and progressive disclosure; they never own API calls, grading, persistence, navigation policy, or instructional content.

**Tech Stack:** React 19, React Router 7, Vite 6, Tailwind CSS 4, scoped CSS Modules, semantic CSS custom properties, Vitest, React Testing Library, Playwright, Axe, local WOFF2 fonts, optimized SVG/WebP/AVIF assets.

---

## Chunk 1: Decisions, Architecture, and Parallel Execution

## 1. Approved decisions and non-negotiable boundaries

These decisions are final. Implementers must not reopen them during execution.

1. Ship exactly three global themes:
   - `living-atlas` — default, light.
   - `curiosity-engine` — light.
   - `mission-workshop` — dark.
2. One selected theme applies to every route. There is no automatic route mixing.
3. Delete the current 16 palette-only themes. There is no Classic or compatibility mode.
4. An unknown or old stored theme ID resolves to Living Atlas.
5. Use bespoke local artwork and textures. No remote runtime assets.
6. Every theme receives the same curriculum, prompts, actions, grading, unlocks, and product vocabulary.
7. Themes may change composition, information density, illustration, motion, and disclosure, but not meaning.
8. Theme switching must not reload the route, issue an API request, or erase an unsaved answer.
9. Interactive visual learning objects are deferred. This release adds a stable visual slot but does not change the activity schema or fabricate diagrams from arbitrary text.
10. No backend schema or endpoint changes are required.
11. Engagement must come from competence, progress, feedback, Builds, retrieval, and meaningful completion—not currencies, loot, artificial urgency, shame, or punitive streaks.
12. Existing learning behavior must remain correct even though the presentation layer is replaced without legacy UI support.

## 2. Current-state baseline

The plan targets `main` at commit `2245cc5`.

Current client routes:

```text
/
/onboarding
/topic/:topicId/continue
/settings
/reviews
/review/:sessionId
/topic/:topicId/lesson/:lessonId
```

Current frontend characteristics:

- `ThemeProvider` applies one palette and CSS variables.
- `themes.js` contains 16 palettes rather than layout systems.
- `Dashboard.jsx` renders topic switching, next action, two TrailMap sections, reviews, rhythm, and focus areas together.
- `OnboardingFlow.jsx` owns 685 lines of state and presentation.
- `ArtifactPanel.jsx` owns 398 lines and nested scrolling.
- `SessionPlayer.jsx` is already one-block-at-a-time, but editable drafts live inside swappable child components.
- `ReviewQueue.jsx` renders every due item.
- `SettingsPage.jsx` renders all sections in one long page.
- `components.css` is a 435-line global stylesheet.
- No browser-level visual or accessibility regression suite exists.
- Production baseline: approximately 532KB minified JavaScript / 157.68KB gzip and 66.26KB CSS / 12.54KB gzip.

Verified baseline in the isolated worktree:

```text
Backend:  33 files, 497 tests passing
Frontend: 32 files, 191 tests passing
```

## 3. Source-of-truth design boards

Copy these generated boards into the repository during Task 1:

```text
/home/clive/.codex/generated_images/01a0d919-992c-7392-912d-2f17cb064661/exec-0d379273-55e3-4dc0-9b9e-7ac6f675116d.png
  -> docs/design/references/curiosity-engine-board.png

/home/clive/.codex/generated_images/01a0d919-992c-7392-912d-2f17cb064661/exec-cc3a5100-ba35-45e7-abf5-4a5e51dcba7e.png
  -> docs/design/references/mission-workshop-board.png

/home/clive/.codex/generated_images/01a0d919-992c-7392-912d-2f17cb064661/exec-91a9486a-9508-41d4-abf4-61980bf60eb6.png
  -> docs/design/references/living-atlas-board.png
```

These boards define visual identity, hierarchy, composition, spacing character, typography character, and illustration language. They are not production UI assets and must never be cropped into clickable interfaces.

## 4. Parallel execution topology

### 4.1 Dependency graph

```text
P0  Reference capture + contracts
 |
 +--> P1A Theme runtime + tokens -------+
 +--> P1B Controller/view-model split --+--> P2 feature surfaces in parallel
 +--> P1C Art production ---------------+       |
 +--> P1D Browser test harness ---------+       v
                                             P3 integration + support routes
                                                       |
                                                       v
                                             P4 visual/a11y/perf hardening
                                                       |
                                                       v
                                             P5 deletion + final verification
```

P0 is serial. P1A–P1D may run concurrently after P0 contracts are committed. P2 streams may run concurrently only after P1A and the relevant P1B controller land. P3–P5 are integration phases and remain serial.

### 4.2 Branch and worktree model

The integration owner creates `feat/multi-theme-ui-overhaul`. Each parallel worker branches from the latest integration foundation commit and uses a separate worktree.

Recommended branches:

```text
feat/multi-theme-ui-overhaul       integration owner
feat/theme-runtime                 P1A
feat/theme-controllers             P1B
feat/theme-art                     P1C
feat/theme-visual-harness          P1D
feat/theme-onboarding              P2A
feat/theme-dashboard               P2B
feat/theme-session-build           P2C
feat/theme-checkpoint-review       P2D
```

The integration owner cherry-picks reviewed commits. Workers never merge `main` independently after their branch is created. If foundation changes, the integrator sends the exact new commit to cherry-pick.

### 4.3 Strict file ownership

| Area | Owner | Other workers may do |
|---|---|---|
| `package.json`, lockfile, `App.jsx`, `main.jsx`, `index.html` | Integrator | Read only; request changes through integrator |
| `client/src/theme/core/**`, semantic tokens | P1A | Import only |
| `client/src/features/**` controllers and models; `client/src/lib/publicError.js` | P1B initially, then assigned feature owner | Do not modify another feature’s controller or error contract |
| `client/src/assets/themes/**` and optimization script | P1C | Consume only |
| Playwright config and `client/e2e/**` | P1D | Add feature specs only in assigned file |
| `client/src/__tests__/theme-parity/renderThemeFixture.jsx` | P1A | Import only |
| Per-surface theme parity specs | Assigned P2 surface owner | Never edit another stream’s parity spec |
| Onboarding and continuation views | P2A | No dashboard/session edits |
| Dashboard and Trail views | P2B | No onboarding/session edits |
| Session and Build views | P2C | No checkpoint/review edits |
| Checkpoint and review views | P2D | No session/build edits |
| Shared primitives | P1A/integrator | Feature workers request additions; do not fork primitives |
| Legacy deletion and global CSS cleanup | Integrator in P5 | Read only before P5 |

If two streams need the same shared file, the integrator makes the shared change first. Do not resolve shared-file conflicts by duplicating components.

### 4.4 Integration gates

Every cherry-picked stream must pass:

```bash
npm run test:frontend
npm run build
git diff --check
```

The integrator must run `npm test` after each parallel wave. Do not stack a second broken stream on top of a first broken stream.

## 5. Target file structure

Create this structure. Do not invent alternate parallel hierarchies.

```text
client/src/
  __tests__/
    theme-parity/
      renderThemeFixture.jsx          # P1A-owned shared helper
      onboarding.parity.test.jsx      # P2A
      continuation.parity.test.jsx    # P2A
      trail.parity.test.jsx           # P2B
      session.parity.test.jsx         # P2C
      build.parity.test.jsx           # P2C
      checkpoint.parity.test.jsx      # P2D
      review-queue.parity.test.jsx    # P2D
      review-session.parity.test.jsx  # P2D
      settings.parity.test.jsx        # integrator
      support.parity.test.jsx         # integrator
  theme/
    ThemeProvider.jsx                 # temporary public entry; removed after App import moves
    core/
      packs.js
      packContract.js
      ThemeProvider.jsx
      ThemeSwitcher.jsx
      ThemePrepaint.js
      useThemeView.js
    packs/
      curiosity-engine/
        pack.js
        tokens.css
        base.module.css
        views/
          OnboardingView.jsx
          TrailView.jsx
          SessionView.jsx
          CheckpointView.jsx
          ReviewQueueView.jsx
          ReviewSessionView.jsx
          BuildView.jsx
          ContinuationView.jsx
          SettingsView.jsx
          SupportView.jsx
          onboarding.module.css
          trail.module.css
          session.module.css
          checkpoint.module.css
          reviews.module.css
          build.module.css
          continuation.module.css
          settings.module.css
          support.module.css
      mission-workshop/
        pack.js
        tokens.css
        base.module.css
        views/                         # same files as curiosity-engine
      living-atlas/
        pack.js
        tokens.css
        base.module.css
        views/                         # same files as curiosity-engine
  features/
    onboarding/
      useOnboardingController.js
      onboardingViewModel.js
    trail/
      useTrailController.js
      trailViewModel.js
      visibleChapterWindow.js
    session/
      useSessionController.js
      sessionViewModel.js
    checkpoint/
      useCheckpointController.js
      checkpointViewModel.js
    reviews/
      useReviewQueueController.js
      useReviewSessionController.js
      reviewViewModel.js
    build/
      useBuildController.js
      buildViewModel.js
    continuation/
      useContinuationController.js
      continuationViewModel.js
    settings/
      useSettingsController.js
      settingsViewModel.js
  components/ui/
    Dialog.jsx
    Sheet.jsx
    Disclosure.jsx
    IconButton.jsx
    LearningObjectStage.jsx
    ErrorNotice.jsx
    EmptyState.jsx
    SceneSkeleton.jsx
  lib/
    publicError.js
  pages/
    CheckpointPage.jsx
    NotFoundPage.jsx
  assets/themes/
    curiosity-engine/
    mission-workshop/
    living-atlas/

client/e2e/
  fixtures/
    api-fixtures.js
    route-mocks.js
  visual/
    onboarding.visual.spec.js
    trail.visual.spec.js
    session-build.visual.spec.js
    checkpoint-review.visual.spec.js
    support.visual.spec.js
  accessibility.spec.js
  performance.spec.js
  state-preservation.spec.js

docs/design/
  references/
  multi-theme-system.md
  fidelity-checklist.md

scripts/
  check-ui-budgets.mjs
  optimize-theme-assets.mjs
```

Existing page files remain thin route adapters. They must end below roughly 150 lines after controller extraction.

## 6. Public and internal interfaces

### 6.1 ThemePack

Implement and validate this exact shape in `packContract.js`:

```js
{
  id: 'living-atlas',
  name: 'Living Atlas',
  mode: 'light',
  tagline: 'Your living atlas.',
  previewAsset: '/resolved/vite/asset',
  tokens: {
    canvas: '#F7F8F5',
    panel: '#FFFFFF',
    elevated: '#FFFFFF',
    inset: '#F1F3F8',
    border: '#E1E5EE',
    borderStrong: '#B6BECE',
    ink: '#101727',
    inkSoft: '#3C465F',
    inkMuted: '#626C86',
    primary: '#315FDA',
    primaryHover: '#234AC4',
    primaryContrast: '#FFFFFF',
    secondary: '#3CA874',
    accentWarm: '#FF7B72',
    accentSun: '#F4C54C',
    success: '#24764D',
    warning: '#7C5510',
    danger: '#A53B4A',
    fontDisplay: 'Fraunces',
    fontBody: 'Manrope',
    fontLabel: 'Manrope',
    radiusControl: '0.875rem',
    radiusPanel: '1.5rem',
    radiusHero: '2rem',
    motionFast: '140ms',
    motionStandard: '240ms',
    motionSpatial: '380ms'
  },
  artwork: {},
  viewLoaders: {
    OnboardingView: () => import('./views/OnboardingView.jsx'),
    TrailView: () => import('./views/TrailView.jsx'),
    SessionView: () => import('./views/SessionView.jsx'),
    CheckpointView: () => import('./views/CheckpointView.jsx'),
    ReviewQueueView: () => import('./views/ReviewQueueView.jsx'),
    ReviewSessionView: () => import('./views/ReviewSessionView.jsx'),
    BuildView: () => import('./views/BuildView.jsx'),
    ContinuationView: () => import('./views/ContinuationView.jsx'),
    SettingsView: () => import('./views/SettingsView.jsx'),
    SupportView: () => import('./views/SupportView.jsx')
  }
}
```

Curiosity Engine and Mission Workshop use the same keys. Pack validation fails loudly in development and unit tests if a key is missing. `viewLoaders` are per-view dynamic imports: never replace them with a barrel that statically imports every view, stylesheet, or route asset.

### 6.2 Theme context

```js
{
  themeId,
  pack,
  availableThemes,
  selectTheme(themeId),
  storageMessage
}
```

Storage rules:

- New key: `mastery-trail-theme-v2`.
- Default: `living-atlas`.
- If the new key is absent but `mastery-roadmap-theme` exists, write `living-atlas` and remove the old key.
- If storage is denied, apply the selection in memory and announce that it is session-only.
- Do not preserve mappings for each old palette.

### 6.3 Theme view module

Every pack contains one independently loadable module for each of these views:

```js
OnboardingView
TrailView
SessionView
CheckpointView
ReviewQueueView
ReviewSessionView
BuildView
ContinuationView
SettingsView
SupportView
```

Each file has one default export. `pack.js` contains metadata and dynamic import functions only; it must not statically import a view or view stylesheet.

All theme views receive `{ model, actions, slots }`.

- `model` is serializable canonical data.
- `actions` contains controller callbacks.
- `slots` contains shared behavior-heavy React elements such as `ActivityRenderer`, provider settings, or artifact upload.
- A view may own only ephemeral disclosure state such as an open Chapter sheet.

### 6.4 Stable content rule

The following must be identical across packs:

- Heading text carrying instructional meaning.
- Question and answer text.
- Outcome and Chapter names.
- Error and recovery text.
- Button actions and accessible names.
- Order of required learning steps.
- Mastery and scoring information.

Theme-specific visible taglines are allowed only as decorative reinforcement. Mark them `aria-hidden="true"` so they do not alter the semantic reading order.

## 7. Canonical view models

### 7.1 Trail model

```js
{
  state: 'empty' | 'setup' | 'ready' | 'complete' | 'error',
  topic: { id, title, progress, status, courseStage },
  topics: [{ id, title, progress, status, canDelete }],
  nextAction: {
    kind: 'setup_track' | 'start_session' | 'resume_session' |
      'start_checkpoint' | 'resume_checkpoint' | 'start_review' |
      'track_complete' | 'unavailable',
    title,
    description,
    label,
    topicId,
    moduleId,
    lessonId
  },
  chapters: [{
    id,
    number,
    title,
    summary,
    status,
    checkpointStatus,
    isCurrent,
    isFuture,
    outcomes,
    sessions
  }],
  visibleChapters,
  review: { totalDue, dueToday, overdue },
  rhythm,
  focusAreas,
  ui: {
    topicMenuOpen,
    selectedChapterId,
    chapterSheetOpen,
    fullTrailOpen,
    progressSheetOpen,
    deleteTargetId,
    deleteConfirmationOpen
  },
  busy: { loading, nextAction, topicDelete },
  error
}
```

`visibleChapterWindow` returns at most five chapter nodes. For long Tracks it returns a previous summary node, current neighborhood, and future summary node while the full sheet retains every Chapter.

### 7.2 Onboarding model

```js
{
  stage: 'destination' | 'starting-point' | 'placement' | 'rhythm' | 'generating' | 'preview',
  stageIndex,
  stageCount: 4,
  substep,
  destination,
  levelOptions,
  selectedLevel,
  placement: {
    phase: 'idle' | 'starting' | 'answering' | 'evaluating' | 'result' | 'error',
    assessmentId,
    questions,
    currentQuestionIndex,
    answers,
    result: { requestedLevel, recommendedLevel, gaps, feedback, questionScores }
  },
  timeOptions,
  selectedTime,
  paceOptions,
  selectedPace,
  generation: { state, stageLabel, attempt, maxAttempts, canResume },
  preview: {
    topicName,
    timeCommitment,
    pace,
    chapterCount,
    outcomeCount,
    coreCount,
    breadthCount,
    buildCount,
    chapters,
    selectedChapterId,
    adjustmentOpen,
    adjustmentDraft
  },
  error,
  busy,
  providerReady
}
```

### 7.3 Session model

```js
{
  state: 'loading' | 'locked' | 'active' | 'build' | 'complete' | 'error',
  session,
  progress: { completed, total, percent, currentIndex },
  blocks,
  currentBlock,
  viewedBlock,
  viewedEntry,
  draftsByBlockId,
  reviewMode,
  artifactRequired,
  tutor: {
    open,
    collapsed,
    draft,
    messages,
    streamingText,
    busy,
    error
  },
  busy: { loading, submitBlockId, completing },
  publicError
}
```

Drafts for choice, ordering, short answer, reflection, and worked-example reveal position live in the controller. Switching pack renderers cannot reset them.

### 7.4 Checkpoint, review, and Build models

Checkpoint:

```js
{
  phase: 'loading' | 'intro' | 'player' | 'results',
  module,
  outcomes,
  questions,
  currentQuestion,
  currentIndex,
  answers,
  answeredCount,
  saveState,
  evaluation,
  isPartialRetest,
  ready,
  lessonsRemaining,
  busy,
  error
}
```

Review:

```js
{
  phase: 'loading' | 'empty' | 'queue' | 'answering' | 'submit-review' | 'feedback-review' | 'summary' | 'expired' | 'error',
  counts,
  dueItems,
  sessionId,
  questions,
  currentQuestion,
  currentIndex,
  totalQuestions,
  remainingCount,
  answers,
  feedbackByQuestionId,
  feedbackIndex,
  result,
  ui: { queueSheetOpen, submitReviewOpen },
  busy,
  error
}
```

Build:

```js
{
  phase: 'brief' | 'evidence' | 'review' | 'evaluating' | 'result',
  taskSpec,
  artifactType,
  evidence: { setup, actions, result, reflection },
  currentEvidenceStep,
  content,
  fileName,
  rubric,
  evaluation,
  ui: { hintsOpen, rubricOpen },
  error,
  busy
}
```

Continuation:

```js
{
  phase: 'loading' | 'ineligible' | 'generating' | 'preview' | 'error',
  parentTrack: { id, title, progress, completedChapters },
  readiness: { eligible, reason, reviewDue },
  level,
  timeCommitment,
  profileStale,
  preview,
  selectedChapterId,
  adjustmentDraft,
  adjustmentOpen,
  busy,
  error
}
```

Settings:

```js
{
  phase: 'loading' | 'ready' | 'error',
  category: 'appearance' | 'learning' | 'ai' | 'privacy' | 'restore',
  themes,
  themeId,
  providers,
  provider,
  model,
  reasoningEffort,
  environmentStatuses,
  codexConnection,
  ready,
  saving,
  exportState,
  importState,
  pendingBackup,
  success,
  error
}
```

Support:

```js
{
  kind: 'loading' | 'offline' | 'route-error' | 'not-found' | 'locked' | 'service-unavailable',
  title,
  message,
  detail,
  retryable,
  returnLabel
}
```

### 7.5 Required action and slot contracts

All callbacks return `void` or a Promise resolved by the controller. Views never duplicate pending state: they disable controls from the appropriate boolean leaf of `model.busy` or the relevant named pending field. Rejected actions are converted by the controller into the model’s public `error`; views do not catch API errors.

```js
OnboardingActions = {
  setDestination(value), submitDestination(), selectLevel(value),
  startPlacement(), setPlacementAnswer(questionId, value), submitPlacement(),
  acceptRecommendedLevel(), keepReportedLevel(), skipPlacement(),
  selectTime(value), selectPace(value), saveRhythm(),
  retryGeneration(), refreshGeneration(), selectPreviewChapter(chapterId),
  setAdjustmentDraft(value), applyAdjustment(), closeAdjustment(),
  regenerate(), confirm(), back(), openSettings()
}

TrailActions = {
  openTopicMenu(), closeTopicMenu(),
  selectTopic(topicId), requestDeleteTopic(topicId), confirmDeleteTopic(), cancelDeleteTopic(),
  runNextAction(), openChapter(chapterId), closeChapter(), openFullTrail(), closeFullTrail(),
  startSession(lessonId), startCheckpoint(moduleId), openReviews(),
  openProgress(), closeProgress(), continueTrack(), retry()
}

SessionActions = {
  setBlockDraft(blockId, value), setOrdering(blockId, orderedIds),
  revealWorkedStep(blockId), completeBlock(blockId, payload), submitBlock(blockId, response),
  reviewBlock(blockId), returnToCurrentBlock(), openTutor(), closeTutor(),
  setTutorDraft(value), sendTutorMessage(message), retryTutor(), returnToTrail(), retryLoad()
}

CheckpointActions = {
  start(), setAnswer(questionId, value), previous(), next(), goToQuestion(index),
  submit(), retake(), startPartialRetest(), reviewLesson(lessonId), returnToTrail(), retry()
}

ReviewActions = {
  startSession(), openQueueDetails(), closeQueueDetails(), setAnswer(questionId, value),
  previousQuestion(), nextQuestion(), openSubmitReview(), returnToQuestion(index),
  submitAllAnswers(), previousFeedback(), nextFeedback(), finish(), cancel(), retry()
}

BuildActions = {
  begin(), setPhase(phase), setEvidence(field, value), setContent(value), selectFile(file),
  nextEvidence(), previousEvidence(), openHints(), closeHints(), openRubric(), closeRubric(),
  reviewSubmission(), submit(), revise(), returnToTrail()
}

ContinuationActions = {
  setLevel(value), setTimeCommitment(value), selectPreviewChapter(chapterId),
  generate(), setAdjustmentDraft(value), openAdjustment(), closeAdjustment(),
  applyAdjustment(), confirm(), defer(), openReviews(), returnToParent()
}

SettingsActions = {
  selectCategory(category), selectTheme(themeId), setProvider(providerId), setModel(modelId),
  setReasoningEffort(value), saveProvider(), exportData(), chooseImportFile(file),
  cancelImport(), confirmImport(), retry()
}

SupportActions = { retry(), returnHome(), dismiss() }
```

Allowed slots are deliberately narrow:

- Session: `{ activity, tutor }`.
- Build: `{ genericArtifactInput }` only for non-task-spec artifacts.
- Settings: `{ codexConnection }`.
- All other views: `{}`.

Disclosure ownership is explicit: the controller owns every `ui` field shown above because its matching open/close action is in the public contract. A theme view may own only disposable presentation state with no action contract, such as a purely decorative animation pause. Theme switching therefore preserves every functional Dialog, Sheet, selection, and confirmation state.

`ThemeSwitcher` is not a Settings slot and Settings views must not implement their own cards. Each themed `SettingsView` imports the shared controlled component and renders `<ThemeSwitcher variant="cards" themes={model.themes} value={model.themeId} onChange={actions.selectTheme} />` in its own composition. The header uses the same component with `variant="menu"` and values from theme context.

`selectFile(file)` accepts only UTF-8 text artifacts (`.txt`, `.md`, `.json`, or `.csv`) up to 256 KiB. The shared `genericArtifactInput` reads the file locally into `content`, records `fileName`, reports decoding/size errors through the model, and sends text through the existing submission contract. Do not show an image, archive, document, or other binary picker because the backend does not persist those bytes.

Add a contract fixture for each model/actions/slots triplet. The parity suite renders the same fixture through every pack and asserts the same canonical text, accessible action names, disabled rules, and callback invocations.

## 8. Route content and overflow mapping

| Surface | Keep prominent | Move behind disclosure | Remove or replace |
|---|---|---|---|
| Dashboard | Track, progress, one next action, current position, compact review cue | Full Track, rhythm, focus areas, topic management | Horizontal topic chips; two TrailMap instances; always-expanded Chapters |
| Onboarding | One decision, stage progress, one primary CTA | Examples, placement explanation, generation detail | Multiple placement questions stacked together |
| Preview | Track summary, selected Chapter, confirm | Other Chapters, full outcomes, prerequisites, tweak input | Every Session expanded simultaneously |
| Session | Current activity, compact progress, one action | Tutor, completed steps, secondary outcome detail | Persistent chat column; competing actions |
| Checkpoint | Current question, autosave, progress | Rules, all outcomes, answer review | Inline dashboard checkpoint |
| Review queue | Due count, overdue status, estimated queue, Start | Individual due items | Dozens of equal cards |
| Review session | During answering: one prompt. After the single full submission: one feedback item | Queue remainder and other answers | Partial-answer submission; prompt and feedback shown simultaneously |
| Build | Current stage, essential brief/evidence, submit | Hints, full rubric, secondary task detail | Nested scroll; unused uploads; all four form fields competing with full brief |
| Settings | One selected category | Other categories | Five long panels on one page |
| Continuation | Completion, next Track preview, one choice | Detailed outcomes | Separate stacked summary and preview panels |

Overflow rules:

- Support 320×568, 390×844, 768×1024, 1440×900, and 1920×1080.
- No essential horizontal scrolling.
- Only code/preformatted text may intentionally scroll horizontally.
- One vertical scroll owner per page, Dialog, or Sheet.
- Sheets use `max-height: calc(100dvh - var(--header-height))` and scroll only their body.
- Every grid/flex content child uses `min-width: 0`.
- Long user/provider/course content uses `overflow-wrap: anywhere`.
- Use `aspect-ratio` for scene art; never fixed content heights.
- Sticky CTAs account for mobile navigation and `env(safe-area-inset-bottom)`.
- At 200% zoom, all controls remain reachable.
- Long Tracks show five nodes plus a full-Track Sheet.
- Long review queues remain in the optional queue Sheet.
- Remove both `flex-1 overflow-y-auto` wrappers from `ArtifactPanel`.

Review protocol constraint: the backend review session is consumed by one complete submission. The client therefore keeps all answers locally, offers an explicit answer-review step, submits exactly once, then treats returned evaluation data as an immutable feedback sequence. Refreshing or reopening a consumed/missing session produces the `expired` support state; it must never silently recreate the attempt or claim saved mastery.

---

## Chunk 2: Phased Implementation Tasks

## Phase 0 — Serial contract and reference capture

### Task 1: Commit design references and fidelity contract

**Owner:** Integrator

**Files:**

- Create: `docs/design/references/*.png`
- Create: `docs/design/multi-theme-system.md`
- Create: `docs/design/fidelity-checklist.md`

- [ ] Copy the three source boards to the exact destinations in Section 3.
- [ ] Write the token, typography, radius, motion, and surface-level tables into `multi-theme-system.md`.
- [ ] Write one fidelity checklist per board panel covering hierarchy, composition, palette, type, art, spacing, controls, and responsive transformation.
- [ ] State that board screenshots are references only and cannot be embedded as UI.
- [ ] Run `git diff --check`.
- [ ] Commit:

```bash
git add docs/design
git commit -m "docs: establish multi-theme visual source of truth"
```

### Task 2: Lock theme and view-model contracts with TDD

**Owner:** Integrator

**Files:**

- Create: `client/src/__tests__/theme-pack-contract.test.js`
- Create: `client/src/__tests__/view-model-contracts.test.js`
- Create: `client/src/theme/core/packContract.js`

- [ ] Install shared runtime dependencies from the integration worktree:

```bash
npm install lucide-react @fontsource/manrope @fontsource/fraunces @fontsource/ibm-plex-mono
npm install --save-dev @playwright/test @axe-core/playwright sharp eslint @eslint/js eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y globals
```

- [ ] Add `eslint.config.js` and root scripts for `lint`, `test:visual`, `test:a11y`, `assets:optimize`, `assets:check`, `perf:check`, and `verify:ui`. Commands whose implementation files belong to later streams may initially be placeholders, but `npm test`, the contract tests, and `npm run build` must pass at the branch point.
- [ ] Run `npm install` only for the explicit packages above. Do not run `npm audit fix` or upgrade unrelated dependencies.

- [ ] Write tests asserting the three exact IDs and Living Atlas default.
- [ ] Write validator tests using local complete and incomplete fixture packs. Do not import the not-yet-created production registry in this task.
- [ ] Write tests asserting required token keys.
- [ ] Write fixture assertions for every canonical view-model field.
- [ ] Run the new tests and verify they fail because the contract validator and fixture validators do not exist.
- [ ] Add the contract validator, frozen view/token lists, and fixture-only view-model validators.
- [ ] Run the contract tests again and require PASS before committing. Never use a commit containing intentionally failing tests as a branch point.
- [ ] Commit:

```bash
git add client/src/theme/core/packContract.js client/src/__tests__/theme-pack-contract.test.js client/src/__tests__/view-model-contracts.test.js
git add package.json package-lock.json eslint.config.js
git commit -m "test: lock multi-theme presentation contracts and tooling"
```

This passing commit is the branching point for P1A–P1D. P1A adds production-registry tests; P1B adds production view-model-builder tests. Neither stream depends on the other stream’s implementation.

## Phase 1 — Parallel foundations

### Task 3A: Theme runtime and shared primitives

**Owner:** P1A

**Depends on:** Task 2

**Files:**

- Replace: `client/src/theme/themes.js`
- Replace: `client/src/theme/ThemeProvider.jsx`
- Replace: `client/src/components/ThemePicker.jsx`
- Create: `client/src/theme/core/packs.js`
- Create: `client/src/theme/core/ThemeSwitcher.jsx`
- Create: `client/src/theme/core/ThemePrepaint.js`
- Create: `client/src/theme/core/useThemeView.js`
- Create/modify: shared components under `client/src/components/ui/`
- Test: modify `ThemeProvider.test.jsx`; create `ThemeSwitcher.test.jsx`, production cases in `theme-pack-contract.test.js`, `ui-primitives.test.jsx`, and `theme-parity/renderThemeFixture.test.jsx`; delete `ThemePicker.test.jsx` after migration

- [ ] Update ThemeProvider tests first for the new key and three themes.
- [ ] Add tests for unknown IDs, storage denial, `color-scheme`, data attributes, and live announcements.
- [ ] Run targeted tests; verify failure against the old provider.
- [ ] Define all three packs with exact token keys.
- [ ] Implement the new provider without route or API knowledge.
- [ ] Add pre-paint logic as a pure exported function so it is unit-testable.
- [ ] Add `renderThemeFixture.jsx`. It accepts a view name, theme IDs, fixture model/actions/slots, loads only those pack modules, and runs shared semantic/action assertions; feature streams create separate spec files and never edit this helper.
- [ ] Add lazy pack view loading and a stable SceneSkeleton.
- [ ] Replace both palette picker and header menu responsibilities with one `ThemeSwitcher` component. `variant="cards"` renders Settings previews; `variant="menu"` renders the compact header popover. Delete `ThemePicker` after its callers and tests migrate; do not create a third ThemeMenu abstraction.
- [ ] Create the complete `views/` file set for every pack as minimal contract-compliant placeholders. Each feature stream later replaces only its assigned view files and matching feature CSS; it must not edit `pack.js` or `base.module.css`.
- [ ] Add production registry tests that import the three `pack.js` metadata modules, validate their tokens/loaders, and load each placeholder module successfully.
- [ ] Keep `client/src/theme/ThemeProvider.jsx` as a temporary re-export of `core/ThemeProvider.jsx` so the branch builds without editing integrator-owned `main.jsx`. Task 4 moves the import; Task 12 deletes the temporary entry.
- [ ] Add Dialog, Sheet, Disclosure, IconButton, ErrorNotice, EmptyState, and LearningObjectStage primitives.
- [ ] Verify focus trap, Escape, scroll lock, and focus restoration with RTL tests.
- [ ] Run:

```bash
npm run test:frontend -- ThemeProvider ThemeSwitcher ui-primitives theme-pack-contract
npm run build
```

- [ ] Commit `feat: add multi-theme runtime and shared primitives`.

### Task 3B: Controller and view-model extraction

**Owner:** P1B

**Depends on:** Task 2

**Files:**

- Create: all files under `client/src/features/**` listed in Section 5
- Modify temporarily: existing pages/components only enough to call the extracted controller
- Test: existing route tests plus new controller/model tests

For each row below, follow the same red/green sequence before starting the next row. Never commit a failing intermediate state. Before the first feature, create `client/src/lib/publicError.js` and `client/src/lib/__tests__/publicError.test.js`. Its only public function is `toPublicError(error, fallbackMessage)`, which maps network/offline, 404/expired, validation, provider-unavailable, and unknown failures to `{ kind, message, retryable }`, never includes stack/SQL/provider payloads, and passes already-sanitized domain errors through unchanged. Every controller uses it at the API boundary. First run its test and observe the missing-module failure, implement it, require PASS, and commit `feat: add safe public error boundary` before feature extraction begins.

| Feature | New tests | Existing regression tests | Required model cases |
|---|---|---|---|
| Trail | `features/trail/__tests__/trailViewModel.test.js`, `useTrailController.test.jsx` | `Dashboard.test.jsx`, `TrailMap.test.jsx` | empty/setup/ready/complete/error; every next-action kind; 0/1/5/6/20 Chapters |
| Onboarding | `features/onboarding/__tests__/onboardingViewModel.test.js`, `useOnboardingController.test.jsx` | `CurriculumFlow.test.jsx` | every stage/substep; placement start/answer/result; generation recovery; preview/tweak |
| Continuation | `features/continuation/__tests__/continuationViewModel.test.js`, `useContinuationController.test.jsx` | `ContinuationFlow.test.jsx` | loading/ineligible/generating/preview/error; stale profile; tweak failure |
| Reviews | `features/reviews/__tests__/reviewViewModel.test.js`, `useReviewControllers.test.jsx` | `ReviewQueue.test.jsx`, `ReviewSession.test.jsx` | empty/due/answer-all/submit-once/feedback/summary/expired/error |
| Checkpoint | `features/checkpoint/__tests__/checkpointViewModel.test.js`, `useCheckpointController.test.jsx` | `ExamPanel.test.jsx` | not-ready/intro/player/autosave/results/retake/partial retest |
| Session | `features/session/__tests__/sessionViewModel.test.js`, `useSessionController.test.jsx` | `SessionPage.test.jsx`, `SessionPlayer.test.jsx`, `ActivityBlocks.test.jsx`, `TutorSidecar.test.jsx` | loading/locked/active/review/build/complete/error; all drafts and tutor state |
| Build | `features/build/__tests__/buildViewModel.test.js`, `useBuildController.test.jsx` | `ArtifactPanel.test.jsx` | brief/evidence/review/evaluating/pass/fail; task-spec and generic artifact |
| Settings | `features/settings/__tests__/settingsViewModel.test.js`, `useSettingsController.test.jsx` | `SettingsPage.test.jsx`, `SettingsPageExportImport.test.jsx` | categories/provider/Codex/export/import/confirm/error |

- [ ] For a feature, first write the model test against its exact Section 7 shape.
- [ ] Run `cd client && npx vitest run --config ./vitest.config.js src/features/<feature>/__tests__/<model-test>`; expect FAIL on the missing builder.
- [ ] Implement only the pure model builder; rerun and require PASS.
- [ ] Write the controller test using mocked `api.js`; expect FAIL on the missing hook or action.
- [ ] Move the existing state/effects/callbacks into the controller without changing behavior; rerun the controller and existing regression tests.
- [ ] Convert the existing page/component to use the controller while retaining its current markup; rerun the same tests.
- [ ] Commit that feature with `refactor: extract <feature> controller`.
- [ ] For Session, hoist choice, ordering, short-answer, reflection, worked-example reveal position, tutor draft, tutor open/collapsed, stream, and error state.
- [ ] For Build, hoist evidence, generic content, filename, disclosure, evaluation, and phase state.
- [ ] For Reviews, implement the real server protocol: locally collect every answer, submit once, then traverse returned feedback. A partial-answer API call is a test failure.
- [ ] After all eight commits, run `npm run test:frontend` and the production view-model contract suite.

### Task 3C: Bespoke art production

**Owner:** P1C

**Depends on:** Task 2, which supplies `sharp` and the package script; Task 1 supplies the visual references

**Files:**

- Create: `client/src/assets/themes/**`
- Create: `scripts/optimize-theme-assets.mjs`
- Create: `client/src/assets/themes/manifest.js`

Required assets:

- Curiosity: wordmark mark, faceted mountain, canary/containers, telescope, summit flag, Build cube.
- Workshop: Trail mark, seamless paper grain, contour overlay, expedition figure, mineral mountain, lantern/watchtower, project schematic.
- Atlas: compass, forest island, systems island, people island, impact island, mastery ring, river/summit landscape.

- [ ] Generate each asset independently using the appropriate board as visual reference.
- [ ] Reject outputs containing UI text, labels, controls, fake logos, or baked-in buttons.
- [ ] Prefer SVG for marks, paths, rings, and reusable geometry.
- [ ] Optimize raster sources into WebP and AVIF with explicit dimensions.
- [ ] Add an asset manifest with width, height, aspect ratio, and fallback color.
- [ ] Make `optimize-theme-assets.mjs` deterministic: identical source bytes and options produce identical outputs, it never rewrites unchanged files, and `--check` performs no writes.
- [ ] Add `assets:check` for `node scripts/optimize-theme-assets.mjs --check`; it fails if output is stale, an above-fold raster exceeds 350KB, or a route family exceeds 1.5MB.
- [ ] Visually inspect light/dark edges and transparent backgrounds.
- [ ] Run `npm run assets:optimize`, then `npm run assets:check`.
- [ ] Commit one theme family per commit.

### Task 3D: Browser visual and accessibility harness

**Owner:** P1D

**Depends on:** Task 2

**Files:**

- Modify through integrator: `package.json`, lockfile
- Create: `client/playwright.config.js`
- Create: `client/e2e/fixtures/api-fixtures.js`
- Create: `client/e2e/fixtures/route-mocks.js`
- Create: initial files under `client/e2e/visual/`
- Create: `client/e2e/accessibility.spec.js`

- [ ] Use the Playwright and Axe dependencies already added by Task 2; do not edit the lockfile independently.
- [ ] Configure Chromium at 390×844 and 1440×900.
- [ ] Disable animations and wait for `document.fonts.ready` before screenshots.
- [ ] Intercept API calls in Playwright; do not create test-only production routes.
- [ ] Build fixtures for empty, setup, active, long, locked, completed, due-review, Build, offline, and error states.
- [ ] Add smoke screenshots against the old UI only to prove harness operation; do not approve them as final baselines.
- [ ] Add Axe execution and console-error collection.
- [ ] Run `npm run test:visual -- --update-snapshots` and `npm run test:a11y`.
- [ ] Commit `test: add visual and accessibility harness`.

## Phase 2 — Shared shell and feature surfaces

### Task 4: Integrate foundations and rebuild App shell

**Owner:** Integrator

**Depends on:** Tasks 3A–3D

**Files:**

- Modify: `package.json`, `package-lock.json`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`
- Modify: `client/src/components/layout/AppShell.jsx`, `FocusShell.jsx`, `AppHeader.jsx`
- Create: `client/src/pages/CheckpointPage.jsx`, `NotFoundPage.jsx`

- [ ] Cherry-pick P1 commits in this order: runtime, controllers, art, test harness.
- [ ] Resolve imports only; do not redesign feature pages here.
- [ ] Finalize the lint, visual, Axe, asset, and `verify:ui` scripts added in Task 2 so every command invokes the files now present.
- [ ] Add local font imports for only the used weights.
- [ ] Add a synchronous, non-module inline script in `client/index.html` before any stylesheet or module script. It reads only `mastery-trail-theme-v2`, allowlists the three IDs, falls back to `living-atlas`, and immediately sets `document.documentElement.dataset.theme` plus `style.colorScheme`. Keep the algorithm mirrored by the pure `ThemePrepaint` helper; test the literal inline script in JSDOM for known, unknown, absent, and storage-denied cases. An imported module is too late and is not acceptable pre-paint behavior.
- [ ] Lazy-load route pages.
- [ ] Add `/topic/:topicId/chapter/:moduleId/checkpoint` and wildcard routes.
- [ ] Make `CheckpointPage` parse positive integer IDs, call the existing dashboard API with local date/timezone, find the requested Chapter, and pass its title, outcomes, and Sessions to the checkpoint controller. Render a public not-found state when either ID or Chapter is invalid; do not depend on `location.state`.
- [ ] Rebuild the header with real navigation: Trail, Reviews, Settings, New Trail.
- [ ] Add theme switching to a compact header popover. Topic selection remains Dashboard-owned and is added by Task 5B, so the shell never fetches topics or duplicates Dashboard requests.
- [ ] Keep mobile bottom navigation safe-area aware.
- [ ] Add header and routing tests before implementation.
- [ ] Run `npm test` and `npm run build`.
- [ ] Commit `feat: integrate multi-theme shell and focused routes`.

Task 4 is the branching point for Tasks 5A–5D.

Every Task 5 stream must use this exact surface loop for each parity spec assigned to it in Section 5:

1. Create only the assigned spec using `renderThemeFixture`. Define the complete fixture, canonical text, accessible action names, disabled states, and callback assertions. Start its local `implementedThemes` table with `['curiosity-engine']`; do not enable unfinished packs.
2. Run that one spec; expect FAIL because the Curiosity placeholder has no finished surface. Replace the Curiosity view and feature CSS only, rerun parity plus the feature RTL suite, require PASS, then commit `feat: add Curiosity <surface> view`.
3. Append `mission-workshop` to that spec's `implementedThemes`; run it and expect only the newly enabled Workshop case to FAIL. Implement Workshop, require both cases to PASS, then commit `feat: add Workshop <surface> view`.
4. Append `living-atlas`; run it and expect only the new Atlas case to FAIL. Implement Atlas, require all three cases to PASS, then commit `feat: add Atlas <surface> view`.
5. Remove any temporary skip/TODO marker, assert the table equals the three canonical theme IDs, and run the complete assigned parity spec. Never commit an intentionally failing or skipped canonical theme case.
6. Add/update the assigned Playwright visual spec and state-preservation scenario.
7. Run the exact feature command named in the task plus `npm run build`; require PASS before handoff.

This sequence keeps each commit reviewable and prevents a single worker from hiding behavioral breakage under three simultaneous visual rewrites.

### Task 5A: Onboarding and continuation surfaces

**Owner:** P2A

**Files:**

- Modify: `pages/OnboardingFlow.jsx`, `pages/CurriculumConfirmation.jsx`, `pages/ContinuationFlow.jsx`
- Create/replace: `views/OnboardingView.jsx`, `views/ContinuationView.jsx`, `views/onboarding.module.css`, and `views/continuation.module.css` in all three pack folders
- Test: `CurriculumFlow.test.jsx`, `ContinuationFlow.test.jsx`, `onboarding.visual.spec.js`

- [ ] Update tests to require one decision per sub-screen.
- [ ] Keep four canonical stages; use substeps for placement questions and rhythm choices.
- [ ] Render one placement question at a time.
- [ ] Keep generation resumable and current preview safe on tweak failure.
- [ ] Build one shared preview model for initial and continuation Tracks.
- [ ] Show one selected Chapter; put all other Chapter details in disclosure.
- [ ] Put tweak input in a Sheet.
- [ ] Implement Curiosity choice cards, Workshop mission briefing, and Atlas compass composition.
- [ ] Verify theme switching preserves destination, placement answers, time, pace, and tweak draft.
- [ ] Run targeted RTL, visual, and Axe tests.
- [ ] Run `cd client && npx vitest run --config ./vitest.config.js src/__tests__/CurriculumFlow.test.jsx src/__tests__/ContinuationFlow.test.jsx src/__tests__/theme-parity/onboarding.parity.test.jsx src/__tests__/theme-parity/continuation.parity.test.jsx`.
- [ ] Run `npm run test:visual -- onboarding.visual.spec.js` and `npm run test:a11y` for onboarding/continuation routes.
- [ ] Commit `feat: redesign onboarding and continuation across themes`.

### Task 5B: Dashboard and Trail surfaces

**Owner:** P2B

**Files:**

- Modify: `pages/Dashboard.jsx`
- Replace: components under `components/trail/`
- Create/replace: `views/TrailView.jsx` and `views/trail.module.css` in all three pack folders
- Test: `Dashboard.test.jsx`, `TrailMap.test.jsx`, `trail.visual.spec.js`

- [ ] Write tests for every next-action kind.
- [ ] Replace two TrailMap instances with one normalized Trail scene.
- [ ] Replace the horizontal topic chips with a compact topic popover in the Dashboard page heading. It uses `useTrailController` data/actions and does not modify or fetch through the global shell.
- [ ] Make one next action visually dominant.
- [ ] Use the five-node Chapter window.
- [ ] Put every Chapter and Session in a full-Track Sheet.
- [ ] Put rhythm and focus areas in a Progress Sheet.
- [ ] Navigate checkpoint actions to the focused route.
- [ ] Implement Curiosity curved path, Workshop capability rail, and Atlas island map.
- [ ] Verify a 20-Chapter fixture remains usable at every viewport.
- [ ] Run `cd client && npx vitest run --config ./vitest.config.js src/__tests__/Dashboard.test.jsx src/__tests__/TrailMap.test.jsx src/__tests__/theme-parity/trail.parity.test.jsx`.
- [ ] Run `npm run test:visual -- trail.visual.spec.js` and its Axe cases.
- [ ] Commit `feat: rebuild Trail dashboard across themes`.

### Task 5C: Session and Build surfaces

**Owner:** P2C

**Files:**

- Modify: `pages/SessionPage.jsx`, `components/session/**`, `components/ArtifactPanel.jsx`
- Create/replace: `views/SessionView.jsx`, `views/BuildView.jsx`, `views/session.module.css`, and `views/build.module.css` in all three pack folders
- Test: Session, activity, tutor, artifact, visual, and state-preservation suites

- [ ] Convert block components to controlled inputs using the extracted controller.
- [ ] Test that theme switching retains choice, order, written answer, reflection, reveal count, tutor draft, and Build evidence.
- [ ] Keep one current activity and compact progress.
- [ ] Move tutor into a closed-by-default side Sheet on desktop and bottom Sheet on mobile.
- [ ] Keep `ActivityRenderer` shared across packs.
- [ ] Add `LearningObjectStage`; keep its visual slot decorative and optional.
- [ ] Transition to Build mode only after activities complete.
- [ ] Implement Build phases: Brief, Evidence, Review, Evaluating, Result.
- [ ] Keep safety notes visible before Build start.
- [ ] Put hints and full rubric behind disclosure.
- [ ] Remove nested scrolling.
- [ ] Never render a file input whose value the server discards.
- [ ] Implement all three Session and Build compositions.
- [ ] Run `cd client && npx vitest run --config ./vitest.config.js src/__tests__/SessionPage.test.jsx src/__tests__/SessionPlayer.test.jsx src/__tests__/ActivityBlocks.test.jsx src/__tests__/TutorSidecar.test.jsx src/__tests__/ArtifactPanel.test.jsx src/__tests__/theme-parity/session.parity.test.jsx src/__tests__/theme-parity/build.parity.test.jsx`.
- [ ] Run `npm run test:visual -- session-build.visual.spec.js`, state-preservation cases, and Axe cases.
- [ ] Commit Session and Build as separate commits.

### Task 5D: Checkpoint and review surfaces

**Owner:** P2D

**Files:**

- Modify: `components/ExamPanel.jsx`, `components/checkpoint/**`, `pages/ReviewQueue.jsx`, `components/ReviewSession.jsx`
- Create/replace: `views/CheckpointView.jsx`, `views/ReviewQueueView.jsx`, `views/ReviewSessionView.jsx`, `views/checkpoint.module.css`, and `views/reviews.module.css` in all three pack folders
- Test: `ExamPanel.test.jsx`, `ReviewQueue.test.jsx`, `ReviewSession.test.jsx`, visual specs

- [ ] Test direct checkpoint navigation and refresh.
- [ ] Keep checkpoint intro, player, results, retake, and partial retest behavior.
- [ ] Render one checkpoint question at a time.
- [ ] Keep autosave visible but quiet.
- [ ] Remove the inline checkpoint shell from Dashboard.
- [ ] Make review queue summary-first; move individual items into a Sheet.
- [ ] Match the existing server protocol exactly: collect answers one question at a time locally, show an answer-review step, submit the complete answer map once, then show returned feedback one item at a time before the summary. Never call `submitReview` with a partial answer map.
- [ ] Treat direct refresh, missing `location.state`, a missing in-memory server session, and server 404 as `expired`; explain that the review expired and return the learner to `/reviews` without claiming progress was saved.
- [ ] Implement Curiosity circular instruments/cards, Workshop paper sheets, and Atlas mastery rings/memory cards.
- [ ] Do not add confidence input or change mastery calculations.
- [ ] Run `cd client && npx vitest run --config ./vitest.config.js src/__tests__/ExamPanel.test.jsx src/__tests__/ReviewQueue.test.jsx src/__tests__/ReviewSession.test.jsx src/__tests__/theme-parity/checkpoint.parity.test.jsx src/__tests__/theme-parity/review-queue.parity.test.jsx src/__tests__/theme-parity/review-session.parity.test.jsx`.
- [ ] Run `npm run test:visual -- checkpoint-review.visual.spec.js`, expired-session cases, and Axe cases.
- [ ] Commit checkpoint and review as separate commits.

## Phase 3 — Serial integration and support routes

### Task 6: Integrate feature streams

**Owner:** Integrator

- [ ] Cherry-pick Tasks 5A–5D one at a time.
- [ ] After each cherry-pick run its targeted tests and the pack contract.
- [ ] Run the full test suite after the fourth stream.
- [ ] Verify no feature pack directly imports `api.js`.
- [ ] Verify each route adapter remains thin.
- [ ] Resolve shared primitives centrally; delete local copies created by workers.
- [ ] Commit conflict-resolution changes as `refactor: unify multi-theme feature integration`.

### Task 7: Settings, offline, errors, and support states

**Owner:** Integrator or a new worker after Task 6

**Files:**

- Modify: `pages/SettingsPage.jsx`, `components/OfflineIndicator.jsx`, `components/ErrorBoundary.jsx`, Skeleton components
- Replace: `views/SettingsView.jsx`, `views/settings.module.css`, `views/SupportView.jsx`, and `views/support.module.css` in all three pack folders
- Test: settings, offline, error-boundary, shell, support visual tests

- [ ] Create `settings.parity.test.jsx` and `support.parity.test.jsx` with complete fixtures; verify all three packs expose identical canonical fields and action names. These files are integrator-owned and are not touched by P2 streams.
- [ ] Write/update Settings controller tests first; require provider, model, reasoning, Codex, export, import, and confirmation behavior before changing markup.
- [ ] Convert Settings to categories: Appearance, Learning, AI connection, Data and privacy, Restore data.
- [ ] Show one category at a time.
- [ ] Replace swatches by placing the shared controlled `ThemeSwitcher variant="cards"` in each pack's Settings composition; do not implement pack-specific card behavior.
- [ ] Preserve provider, model, reasoning, Codex, export, import, and confirmation behavior.
- [ ] Replace the page-width offline banner with a fixed notice that does not shift layout.
- [ ] Route Settings, shell, and support failures through `client/src/lib/publicError.js`; add regression fixtures proving raw `NetworkError`, SQL, stack, or provider internals are never displayed.
- [ ] Theme loading, empty, locked, service-unavailable, and 404 states.
- [ ] Verify import Dialog focus behavior.
- [ ] Run `cd client && npx vitest run --config ./vitest.config.js src/__tests__/SettingsPage.test.jsx src/__tests__/SettingsPageExportImport.test.jsx src/__tests__/OfflineIndicator.test.jsx src/__tests__/ErrorBoundary.test.jsx src/__tests__/theme-parity/settings.parity.test.jsx src/__tests__/theme-parity/support.parity.test.jsx`.
- [ ] Run `npm run test:visual -- support.visual.spec.js` and `npm run test:a11y` for Settings and support states.
- [ ] Run the complete frontend suite.
- [ ] Commit `feat: complete themed settings and support states`.

## Phase 4 — Visual, responsive, accessibility, and performance hardening

### Task 8: Approve visual baselines against the boards

**Owner:** Design-integrator; may delegate independent theme comparisons

Capture every state below in every theme at both 1440×900 and 390×844. A state is not approved until all six theme/viewport combinations exist and pass comparison:

- Onboarding destination, placement, rhythm, generating, and preview.
- Dashboard active, empty, setup-resume, and complete.
- Session choice, ordering, written answer, tutor open, and complete.
- Checkpoint intro, question, passed, and remediation.
- Review queue, question, feedback, and summary.
- Build brief, evidence, review, failed result, and passed result.
- Continuation preview.
- Settings appearance.
- Offline, service error, and 404.

- [ ] Name snapshots `<theme>-<route>-<state>-<viewport>` so omissions are mechanically visible.
- [ ] Add a manifest assertion that the full theme × state × viewport matrix exists; do not rely on a reviewer remembering missing combinations.
- [ ] Compare every screenshot with its board panel using `fidelity-checklist.md`.
- [ ] Reject Curiosity if it resembles generic blue SaaS.
- [ ] Reject Workshop if it resembles a neon developer dashboard rather than tactile field equipment.
- [ ] Reject Atlas if it becomes a white card grid rather than a spatial landscape.
- [ ] Correct hierarchy and composition before polishing shadows.
- [ ] Approve final Playwright snapshots only after comparison.
- [ ] Commit `test: approve multi-theme visual baselines`.

### Task 9: Responsive and overflow torture pass

**Owner:** QA worker

- [ ] Test all acceptance viewports from Section 8.
- [ ] Test 200% zoom.
- [ ] Test 1, 5, 6, and 20 Chapters.
- [ ] Test 0, 1, and 20 reviews.
- [ ] Test 100-character destination and Chapter titles.
- [ ] Test long provider names, error messages, filenames, feedback, code, and tutor responses.
- [ ] Assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` outside declared code scrollers.
- [ ] Assert only the document or active Sheet owns vertical scroll.
- [ ] Verify sticky actions do not cover fields, errors, or mobile navigation.
- [ ] Verify content remains reachable with browser text enlargement.
- [ ] Fix failures inside the owning theme/feature module, not with global overflow clipping.
- [ ] Commit `fix: harden themed layouts against overflow`.

### Task 10: Accessibility and motion pass

**Owner:** Accessibility worker

- [ ] Achieve zero serious or critical Axe violations.
- [ ] Verify WCAG AA contrast for text, controls, statuses, and focus indicators.
- [ ] Keyboard-complete every learning flow.
- [ ] Verify Dialog/Sheet focus trap, Escape, and restoration.
- [ ] Verify headings and landmarks in every route state.
- [ ] Verify progress and autosave announcements are informative but not noisy.
- [ ] Verify status never relies on color, art, position, or texture alone.
- [ ] Verify `prefers-reduced-motion` removes path drawing, paper settling, parallax, crossfades, and celebration movement.
- [ ] Verify forced-colors mode exposes borders, selection, focus, and progress.
- [ ] Commit `fix: complete multi-theme accessibility pass`.

### Task 11: Performance and asset-loading pass

**Owner:** Performance worker

- [ ] Configure the production build to emit `dist/.vite/manifest.json`, preserving the repository's existing Vite `outDir: '../dist'` contract.
- [ ] Create `scripts/check-ui-budgets.mjs`. It reads the manifest and built files, follows static imports from the app entry to calculate shared initial JS, follows the selected route entry plus exactly one theme view's dynamic-import closure to calculate route+theme JS, gzips the referenced bytes with Node `zlib.gzipSync`, deduplicates chunks by filename, and exits nonzero with an itemized chunk table when a limit is exceeded.
- [ ] Add fixture tests for the graph walker covering shared chunks, duplicate imports, dynamic imports, missing manifest entries, and a deliberately over-budget graph.
- [ ] Wire `npm run perf:check` to run a production build and then the budget script. Budgets are 170KB gzip for shared initial JS and 230KB gzip for each route+single-theme closure; check every route against every theme, not only the default.
- [ ] Ensure route pages and theme view packs use dynamic imports.
- [ ] Add `client/e2e/performance.spec.js`: cold-load each canonical route once per selected theme, inspect `performance.getEntriesByType('resource')`, and fail if any other theme's view chunk, font-only-to-that-theme, or art path was requested.
- [ ] Ensure unselected theme art is absent from Performance Resource entries.
- [ ] Ensure fonts import only required families and weights.
- [ ] Add width/height or aspect ratio to every raster.
- [ ] Keep shared initial JS at or below 170KB gzip.
- [ ] Keep selected route plus theme JS at or below 230KB gzip.
- [ ] Remove the current Vite oversized single-chunk warning.
- [ ] Keep above-fold selected-theme art at or below 350KB.
- [ ] Keep all selected-theme art for one route at or below 1.5MB.
- [ ] Verify theme switching from a cached pack completes without a blank frame.
- [ ] Verify dashboard initial render causes no LLM work.
- [ ] Run `npm run perf:check` and `npm run test:visual -- performance.spec.js`.
- [ ] Commit `perf: split theme packs and enforce asset budgets`.

## Phase 5 — Clean cutover and final verification

### Task 12: Delete the old presentation system

**Owner:** Integrator

- [ ] Delete all 16 old palette definitions.
- [ ] Delete replaced Trail cards and duplicate layout components.
- [ ] Delete dead selectors from `components.css`; remove the file if fully migrated.
- [ ] Delete obsolete tests that assert the old palette count or layout.
- [ ] Remove inline color styles replaced by semantic tokens.
- [ ] Remove emoji controls and raw glyph icons.
- [ ] Remove compatibility aliases that no live component uses.
- [ ] Search:

```bash
rg -n "morning-mist|quiet-linen|sage-garden|blue-harbor|lavender-still|warm-sand|rosewater|sea-glass|midnight-ink|deep-ocean|forest-dusk|plum-twilight|graphite-calm|night-lavender|moss-night|cocoa-evening" client/src
rg -n "🌿|✅|❌|📎|✦|✧|✓|⌄|↻|←|→" client/src --glob '*.{js,jsx}'
rg -n "style=\{\{.*(?:color|backgroundColor)" client/src
```

- [ ] Inspect every glyph-search result. Replace glyphs used as interface icons with Lucide icons carrying correct labels; retain only genuine instructional/user content. Expected: no old theme IDs, no emoji/raw-glyph UI, and no avoidable inline visual tokens.
- [ ] Commit `refactor: remove legacy presentation system`.

### Task 13: Final end-to-end verification

**Owner:** Integrator

Run exactly:

```bash
npm run lint
npm run test:frontend
npm run test:backend
npm run test:visual
npm run test:a11y
npm run assets:check
npm run perf:check
npm run build
npm test
git diff --check
git status --short
```

Acceptance:

- [ ] Every command exits zero.
- [ ] All three themes work on every route and support state.
- [ ] Theme selection persists and defaults correctly.
- [ ] Switching theme preserves unsaved input and sends no API request.
- [ ] No raw infrastructure error is shown to a learner.
- [ ] No essential content clips or scrolls horizontally.
- [ ] No unselected theme art loads.
- [ ] Shared and every route+theme JavaScript closure pass the enforced gzip budgets.
- [ ] No legacy theme or layout path remains.
- [ ] Existing curriculum, activity, checkpoint, review, Build, continuation, settings, export, and import behavior remains functional.
- [ ] Visual baselines are approved against the three boards.
- [ ] The working tree contains only intended files.
- [ ] Commit `feat: complete multi-theme Trail experience`.

---

## Chunk 3: Theme-Specific Direction and Acceptance Matrix

## 9. Living Atlas implementation direction

Living Atlas is the default and calmest experience.

- Porcelain canvas with generous negative space.
- Fraunces display headings; Manrope body.
- Soft-edged topographic islands with restrained shadows.
- Green denotes healthy/current growth; cobalt denotes action and connection; coral denotes risk or attention; yellow denotes insight.
- Dashboard Chapters appear as capability islands connected by a dotted route.
- Onboarding uses a compass/orbit composition without turning required choices into unlabeled icons.
- Session content remains the visual focus; terrain art frames rather than competes.
- Checkpoint uses a mastery/evidence ring built from real progress.
- Review shows one floating memory card.
- Build shows a journey landscape and evidence milestones.
- Mobile converts spatial maps into a vertical connected island chain.

Reject the implementation if it becomes generic white cards with small landscape images pasted beside them.

## 10. Curiosity Engine implementation direction

Curiosity Engine is the clearest, brightest, and most playful experience.

- Manrope typography with strong navy headings.
- Crisp white panels on a cool luminous canvas.
- Cobalt is dominant; yellow, lavender, coral, and green are sparse semantic accents.
- Geometric/faceted illustration rather than soft AI blobs.
- Dashboard uses a blue next-action hero and a curved node path.
- Onboarding uses explicit cards, sliders/segmented choices, and visible stage progress.
- Session uses a clean learning stage and strong answer feedback.
- Checkpoint uses circular question progress.
- Review uses layered cards.
- Build uses guided milestones and a checklist.
- Motion may feel buoyant but never bouncy enough to delay interaction.

Reject the implementation if it looks like a generic startup dashboard, uses gradients as decoration everywhere, or hides learning behind illustration.

## 11. Mission Workshop implementation direction

Mission Workshop is focused, tactile, and practical.

- Dark mineral canvas with subtle contour lines.
- Warm paper carries briefs, questions, and evidence.
- Fraunces display typography; IBM Plex Mono only for metadata; Manrope for controls and readable body copy.
- Lime marks the main next action; orange marks mission/build emphasis.
- Dashboard uses a vertical capability rail and paper mission card.
- Onboarding resembles a clear field briefing rather than a settings form.
- Session may split paper explanation from a dark working surface at wide sizes.
- Checkpoint and review use paper sheets without fake handwriting for required text.
- Build resembles a project board with milestones and evidence.
- Paper texture remains subtle enough for AA contrast.
- Mobile stacks paper and workspace into one document flow.

Reject the implementation if it becomes a cyberpunk console, uses fluorescent text extensively, or sacrifices reading comfort for atmosphere.

## 12. Cross-theme behavioral acceptance matrix

| Behavior | Atlas | Curiosity | Workshop |
|---|---:|---:|---:|
| Create and confirm Track | Required | Required | Required |
| Resume generation | Required | Required | Required |
| Switch/delete Track safely | Required | Required | Required |
| Start/resume/review Session | Required | Required | Required |
| Complete all six activity types | Required | Required | Required |
| Open tutor and stream response | Required | Required | Required |
| Complete/revise/pass Build | Required | Required | Required |
| Start/autosave/submit checkpoint | Required | Required | Required |
| Retake and partial retest | Required | Required | Required |
| Complete retrieval review | Required | Required | Required |
| Generate/adjust/confirm continuation | Required | Required | Required |
| Configure provider/Codex | Required | Required | Required |
| Export/import data | Required | Required | Required |
| Offline/error recovery | Required | Required | Required |
| Keyboard and reduced motion | Required | Required | Required |

## 13. Explicitly deferred work

Do not silently expand this plan to include:

- A new visual-learning-object or simulation schema.
- New AI prompts for theme-specific curriculum content.
- Accounts, cloud sync, social features, leagues, XP, currencies, badges, shops, or notifications.
- Native mobile applications.
- Server-side theme persistence.
- More theme packs or per-pack light/dark variants.
- A public standalone Build route.
- Backend scoring, mastery, review, or curriculum redesign.

The current release must leave `LearningObjectStage` ready for a later structured visual-object project, but it must not ship fake learning diagrams.

## 14. Completion definition

The overhaul is complete only when the product feels like three intentionally art-directed versions of the same focused learning system—not one application with three color palettes. A learner must be able to switch between the worlds at any point, keep their exact state, immediately understand the next meaningful action, and complete every existing learning flow without regression.
