# Bounded Core Courses, Practice Tasks, and Learning Lanes Implementation Plan

> **For agentic workers:** REQUIRED: Use `subagent-driven-development` (if subagents are available) or `executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a single generated roadmap into a finite, practical Core course that can unlock separate, linked Advanced courses in learner-selected specialization lanes.

**Architecture:** A topic becomes a course with durable completion metadata; a `course_links` table models the directed parent-to-child learning tree. Existing curriculum, lesson, artifact, quiz, exam, SRS, and provider abstractions remain the sources of truth. Small utilities own course completion, continuation context, task-schema validation, and mixed-question grading so routes remain orchestration layers.

**Tech Stack:** React 18, React Router, Express 4, SQLite via `better-sqlite3`, Vitest, Supertest, existing LLM provider abstraction and SSE helpers.

---

## Product contract

### Course lifecycle

1. A user-created topic starts as a `core` course at stage `0`.
2. A Core course contains 3–5 modules with 3–5 lessons each. Its purpose is practical 80/20 coverage: the highest-value concepts, common workflows, and typical mistakes needed to become productive. It must not pretend to exhaust a subject.
3. Every new lesson has a practical task. The learner completes the teaching chunks, submits task evidence, then takes a short mixed quiz. Both task and quiz must pass before the lesson passes.
4. A module is completed only when all of its lessons pass and the existing module exam passes.
5. A course is completed only when every module is completed. Completion is an automatic, atomic result of the final passed module exam; there is no additional redundant course exam.
6. A completed course changes topic `status` to `completed`, retains its dashboard, lessons, submissions, and due reviews, and stops counting toward the active-topic limit.
7. Completion exposes continuation choices. The learner can select one of three suggested lanes or name a custom lane. Generating a continuation never edits the completed course.
8. Confirming an Advanced course creates a new active topic, links it to its direct prerequisite, sets its stage to the parent stage plus one, and persists its finite roadmap. A parent may have multiple child lanes; each child can in turn unlock deeper courses.

### Deliberate defaults

- New Core and Advanced roadmaps are bounded to 9–25 lessons. The limit is validated server-side, not merely requested from the LLM.
- Continuation becomes available only after the complete Core or Advanced course has passed every module checkpoint.
- Advanced creation inherits the parent's learner level and time commitment, while allowing the learner to adjust both before generation.
- New task-backed lessons require all teaching chunks to complete before task evidence can be submitted; their task evidence must pass before the quiz can proceed. Test-out is unavailable for task-backed lessons, because their required completion path is task evidence plus the mixed quiz. Legacy lessons preserve their existing artifact/quiz ordering and behavior.
- A normal quiz contains four questions: two multiple-choice questions and two concise written explanations. A targeted retest contains one of each. Multiple-choice questions test recall and discrimination; written answers test reasoning and transfer. The hands-on task is the evidence of doing.
- Paid services are never a required setup. Each task must specify a local, open-source, free-public, or no-software primary path, plus a free fallback when the primary path needs an account or hosted service.
- The app collects text-based evidence only: code, commands, logs, configuration, outcomes, and reflection. It must not pretend to execute local code, validate screenshots, or inspect a learner's external environment.
- Private answer keys never leave the server. Browser-accessible exports omit them; importing a backup with an unresolved mixed-format quiz resets that quiz safely instead of importing an ungradeable pending attempt.

### Non-goals for this release

- No user accounts, cloud synchronization, code execution sandbox, binary asset store, external browser automation, or paid-resource catalogue.
- No change to the existing provider-selection, Codex OAuth, Claude/API-key configuration, or provider-switching behavior.
- No rewriting, deleting, or mutating a completed course when a child course is generated.

## Data and public interface design

### SQLite schema

Add migration `012_add_course_lineage_and_task_assessment` in `server/db.js`. It must be idempotent through the existing `migrations` table and use one database transaction.

Add the following `topics` columns, all with safe defaults so existing rows remain valid:

| Column | Type/default | Purpose |
| --- | --- | --- |
| `course_kind` | `TEXT NOT NULL DEFAULT 'core'` | `core` or `advanced` |
| `course_stage` | `INTEGER NOT NULL DEFAULT 0` | Depth along one learning branch |
| `course_focus` | `TEXT NOT NULL DEFAULT ''` | Selected advanced lane; blank for a generic Core course |
| `course_summary` | `TEXT NOT NULL DEFAULT ''` | JSON snapshot of outcomes, strengths, gaps, and course scope at completion |
| `course_completed_at` | `DATETIME` | Completion timestamp independent of old display fields |

Create `course_links`:

```sql
CREATE TABLE course_links (
  child_topic_id INTEGER PRIMARY KEY,
  parent_topic_id INTEGER NOT NULL,
  lane TEXT NOT NULL,
  normalized_lane TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (child_topic_id <> parent_topic_id),
  UNIQUE (parent_topic_id, normalized_lane),
  FOREIGN KEY (child_topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_topic_id) REFERENCES topics(id) ON DELETE RESTRICT
);
CREATE INDEX idx_course_links_parent ON course_links(parent_topic_id);
```

`ON DELETE RESTRICT` is intentional: deleting a prerequisite course that still has deeper courses must return a clear conflict instead of silently destroying a learning history.

Add the following lesson and quiz-attempt fields:

| Table | Column | Type/default | Purpose |
| --- | --- | --- | --- |
| `lessons` | `task_spec` | `TEXT NOT NULL DEFAULT ''` | Validated JSON task definition; blank means legacy lesson |
| `quiz_attempts` | `answer_key` | `TEXT` | Private JSON answer keys for new multiple-choice items |
| `quiz_attempts` | `format_version` | `INTEGER NOT NULL DEFAULT 1` | `1` means legacy all-written quiz; `2` means mixed assessment |

Use the migration to classify all existing topics as Core courses. For existing topics whose status is `active`, which have at least one module, and whose every module already has `status = 'completed'`, set `status = 'completed'` and set `course_completed_at` if absent. When a legacy completed course has no summary, continuation context derives it deterministically in memory; this does not require an LLM or mutate a readiness request. Do not change archived topics, incomplete topics, progress, artifacts, messages, SRS rows, exam attempts, or provider settings.

### Task specification contract

New curriculum payloads must attach this normalized object to every lesson:

```json
{
  "title": "Build and verify a small local setup",
  "scenario": "You are preparing a safe development environment for a teammate.",
  "goal": "Create the setup and demonstrate the requested behavior.",
  "constraints": ["Use test data only", "Do not use paid services or secrets"],
  "deliverables": ["Relevant configuration or commands", "Observed output", "A short explanation"],
  "success_criteria": ["The requested behavior is observable", "The result can be reproduced from the submitted evidence"],
  "estimated_time": 25,
  "primary_setup": {
    "kind": "local",
    "description": "Use a local installation or containerized equivalent.",
    "requires_account": false,
    "requires_payment": false,
    "requires_secret": false,
    "requires_external_target": false
  },
  "free_fallback": {
    "kind": "no_software",
    "description": "Use the supplied sample data and explain the expected configuration and output.",
    "requires_account": false,
    "requires_payment": false,
    "requires_secret": false,
    "requires_external_target": false
  },
  "hints": ["Start by identifying the smallest working setup.", "Check the expected output before expanding the task."],
  "safety_notes": ["Use only systems you own or an isolated local environment."]
}
```

Validation rules:

- Field limits are deterministic: title ≤120 characters; scenario ≤600; goal ≤300; each constraint/deliverable/success criterion ≤180; each setup/fallback description ≤400; each hint ≤180; each safety note ≤200. Constraints are 1–5 items, deliverables and success criteria are 2–4 items, hints are 0–2, and safety notes are 0–3.
- All string fields are trimmed, non-empty where required, length-bounded, and serialized only after validation.
- `estimated_time` is a positive integer no greater than 180.
- `primary_setup.kind` and `free_fallback.kind` are one of `local`, `open_source`, `free_public`, or `no_software`.
- `requires_payment`, `requires_secret`, and `requires_external_target` must always be `false`. A `free_public` primary setup may require an account only when its fallback has `requires_account: false`; all other kinds must have `requires_account: false`.
- Resource safety is enforced from those structured flags, not brittle phrase matching. Prompts instruct the model that prose may only describe the validated free path; UI labels the path and fallback directly.
- Treat task prose as untrusted too. `task-spec.js` applies a defined case-insensitive imperative-text policy to scenario, goal, constraints, deliverables, success criteria, tool labels, and setup/fallback descriptions: it rejects positive directives requiring payment, accounts, secrets, production/live systems, or external targets, while recognizing an immediately preceding `do not`, `never`, `without`, or `avoid` as a prohibition. The UI renders required access and safety statements only from validated fields/templates, never from raw setup instructions. Provider output that fails this policy is discarded and regenerated at most twice before returning a safe validation error.
- Hints are optional and capped at two. They are not shown until the learner asks for help.

### Mixed quiz contract

Persist the public questions and private answer keys separately. Public question JSON for format version 2 is:

```json
[
  {
    "id": "q1",
    "format": "multiple_choice",
    "category": "Recall",
    "prompt": "Which command ...?",
    "options": [
      { "id": "a", "text": "..." },
      { "id": "b", "text": "..." },
      { "id": "c", "text": "..." },
      { "id": "d", "text": "..." }
    ],
    "weight": 1
  },
  {
    "id": "q3",
    "format": "written",
    "category": "Explain",
    "prompt": "In one or two sentences, explain why ...",
    "max_words": 80,
    "weight": 2
  }
]
```

Private `answer_key` JSON is stored only in `quiz_attempts.answer_key`:

```json
{ "q1": "b", "q2": "d" }
```

No browser-accessible endpoint may return `answer_key`, hidden correct-option text, or an internal grading prompt. Existing `format_version = 1` rows retain their current `type`, free-text answer, and LLM-only evaluation behavior.

### Continuation API contract

All continuation endpoints are mounted through a new `server/routes/continuations.js` router under `/api`.

| Method and path | Request | Successful response | Required behavior |
| --- | --- | --- | --- |
| `GET /topics/:id/continuation-readiness` | — | `{ eligible, reason?, course, lineage }` | Computes eligibility without LLM calls or writes. |
| `POST /topics/:id/continuation-options` | — | `{ options: [{ id, title, rationale, builds_on, target_outcomes, free_stack }] }` | Requires eligibility; returns exactly three safe suggestions derived from local course context. |
| `POST /topics/:id/continuations/generate` | `{ lane, level, timeCommitment }` | One validated `curriculum` SSE event | Buffers the provider stream server-side, parses and validates it, then emits the complete draft without creating any topic or modules. |
| `POST /topics/:id/continuations/tweak` | `{ lane, level, timeCommitment, curriculum, request }` | Full validated curriculum draft | Alters only the transient draft; no database write. |
| `POST /topics/:id/continuations/confirm` | `{ lane, level, timeCommitment, curriculum }` | `{ ok, topic, firstLessonId }` | Atomically creates the linked Advanced topic and its curriculum. |

Input limits: `lane` is sanitized and limited to 100 characters; its normalized case-folded whitespace form is stored for uniqueness; `request` is trimmed and limited to 1,000 characters; all profile values use the existing allowed level and time-commitment values. Child stage must equal parent stage plus one, and every new/imported link must point to a lower-stage parent, so a cycle is impossible. Invalid IDs, incomplete parents, malformed curricula, duplicate payload retries, and active-topic-limit failures return a structured 4xx response and write nothing.

Core generation and regeneration use the same buffered-and-validated SSE contract. The client only accepts the named final `curriculum` event. Malformed, truncated, over-limit, or invalid provider output emits a typed SSE error and never reaches the confirmation UI.

## File ownership map

| File | Responsibility |
| --- | --- |
| `server/db.js` | Migration 012 and legacy-data classification. |
| `server/utils/course-lineage.js` | Course eligibility, deterministic completion summary, ancestry context, atomic child creation, and deletion guard. |
| `server/utils/task-spec.js` | Task schema normalization and validation; no Express dependency. |
| `server/utils/mixed-quiz.js` | Mixed-question validation, public-question sanitizer, deterministic choice scoring, and score aggregation. |
| `server/utils/curriculum-draft.js` | Buffer provider output, parse and validate it, and write a final safe SSE draft event. |
| `server/routes/curriculum.js` | Core curriculum prompt, draft validation, persistence of `task_spec`, and bounded-course rules. |
| `server/routes/continuations.js` | Continuation API orchestration and LLM prompts. |
| `server/routes/exams.js` | Invoke course completion inside both passed-exam transactions. |
| `server/routes/lessons.js` | Task-aware lesson payloads and mixed-quiz generation/submission. |
| `server/routes/dashboard.js` | Course metadata, lineage summaries, completed-topic presentation data, default-topic preference, and protected deletion. |
| `server/routes/data.js` | Versioned export/import of `course_links` and new fields. |
| `server/index.js` | Mount the continuation router. |
| `client/src/api.js` | Typed fetch helpers for continuation endpoints. |
| `client/src/pages/ContinuationFlow.jsx` | Lane selection, inherited-profile editing, temporary draft generation, review, tweak, confirm, and cancellation. |
| `client/src/pages/OnboardingFlow.jsx` | Core-course wording and Core draft metadata display only. |
| `client/src/pages/Dashboard.jsx` | Core/Advanced labels, completed-course card, lineage link, and continuation entry point. |
| `client/src/components/ArtifactPanel.jsx` | Render structured task evidence for `task_spec`; retain legacy artifact behavior when it is absent. |
| `client/src/components/QuizPanel.jsx` | Render radio options and concise written answers; preserve legacy question rendering. |
| `client/src/App.jsx` | Add the continuation route. |

## Chunk 1: Durable course lifecycle

### Task 1: Add migration coverage before changing the schema

**Files:**
- Modify: `server/__tests__/db.test.js`
- Create: `server/__tests__/course-lineage.test.js`
- Modify: `server/db.js`

- [ ] **Step 1: Write failing migration tests.** Cover a fresh database with every new column/table; a database initialized before migration 012; valid Core defaults; existing fully examined courses becoming completed; incomplete and archived topics remaining unchanged; foreign-key rejection for a link to a missing parent; self-link rejection; and duplicate normalized lanes under one parent.
- [ ] **Step 2: Run the focused tests.**
  ```bash
  npx vitest run server/__tests__/db.test.js server/__tests__/course-lineage.test.js
  ```
  Expected: failures identifying the missing migration, columns, and table.
- [ ] **Step 3: Implement migration 012 in `initSchema`.** Add columns defensively, create `course_links` and its index, and run the one-time legacy classification query inside the migration transaction. Never recreate a table or alter existing row IDs.
- [ ] **Step 4: Re-run focused tests.**
  ```bash
  npx vitest run server/__tests__/db.test.js server/__tests__/course-lineage.test.js
  ```
  Expected: PASS.
- [ ] **Step 5: Commit only the isolated schema/test change.** Do not stage unrelated existing work.

### Task 2: Create the course-lineage utility

**Files:**
- Create: `server/utils/course-lineage.js`
- Test: `server/__tests__/course-lineage.test.js`

- [ ] **Step 1: Add failing utility tests.** Test `getCourseReadiness`, `getLineage`, `buildCourseSummary`, `completeCourseIfEligible`, and `createLinkedCourse`. Exercise no modules, unfinished module, all modules passed, multiple branches, missing parent, parent not completed, depth increments, active-topic capacity, and no partial data after errors.
- [ ] **Step 2: Run the utility test file.**
  ```bash
  npx vitest run server/__tests__/course-lineage.test.js
  ```
  Expected: FAIL because the utility does not exist.
- [ ] **Step 3: Implement deterministic course summaries.** Build summaries from persisted lesson outcomes, quiz scores/evaluation gaps, artifact feedback, module exam evaluation, and `mistakes_log`. Cap each list and never include raw message history, credentials, or provider-specific data. Build ancestry by following `course_links` from current topic to root; reject loops defensively even though the write path prevents them. When a legacy completed course has no summary, build it in memory for continuation context without writing during readiness.
- [ ] **Step 4: Implement atomic completion and child creation.** `completeCourseIfEligible` must be a transaction-aware inner operation—never start a nested SQLite transaction—and update only an active topic whose every module is completed. `createLinkedCourse` must check parent eligibility, canonical-lane uniqueness, parent/child stage, and active-topic capacity; create the child with `last_active_at` set; create its link; persist its prepared curriculum; create progress rows; and return the first foundation lesson in one transaction.
- [ ] **Step 5: Re-run utility tests and commit the isolated utility/test change.**
  ```bash
  npx vitest run server/__tests__/course-lineage.test.js
  ```

### Task 3: Wire course completion and dashboard semantics

**Files:**
- Modify: `server/routes/exams.js`
- Modify: `server/routes/dashboard.js`
- Modify: `server/__tests__/exams.test.js`
- Modify: `server/__tests__/dashboard.test.js`

- [ ] **Step 1: Add failing route tests.** Verify a passed non-final module does not complete its course; the final passed full exam and successful partial retest both complete it; a failed exam does not; SRS remains available after completion; default topic prefers the newest active topic including a newly linked child after restart; dashboard exposes course kind/stage/focus/completion/lineage; and deleting a parent with children returns `409`.
- [ ] **Step 2: Run the focused tests.**
  ```bash
  npx vitest run server/__tests__/exams.test.js server/__tests__/dashboard.test.js
  ```
  Expected: FAIL on missing course completion and dashboard data.
- [ ] **Step 3: Invoke `completeCourseIfEligible` in both existing passed-exam transactions.** Do not add a second write after the response. Preserve `nextModuleUnlocked`, existing exam result shapes, and SRS scheduling.
- [ ] **Step 4: Enrich dashboard/topic queries.** Return course metadata and immediate parent/child references; keep completed courses selectable; group active and completed records in the API response without hiding completed records; select an active default first; and use the course-lineage deletion guard before deleting any topic.
- [ ] **Step 5: Re-run focused tests and commit the isolated lifecycle change.**
  ```bash
  npx vitest run server/__tests__/exams.test.js server/__tests__/dashboard.test.js server/__tests__/course-lineage.test.js
  ```

## Chunk 2: Bounded curriculum and practical evidence

### Task 4: Define and validate practical task specifications

**Files:**
- Create: `server/utils/task-spec.js`
- Create: `server/utils/curriculum-draft.js`
- Create: `server/__tests__/task-spec.test.js`
- Modify: `server/routes/curriculum.js`
- Modify: `server/__tests__/curriculum.test.js`

- [ ] **Step 1: Write failing pure-validation and route-guard tests.** Include valid local, open-source, free-public, and no-software tasks; missing fallback; empty deliverables; unsupported setup kind; `requires_payment`, secret, external-target, and invalid-account flags; free-public accounts without an account-free fallback; positive prose directives such as “use production credentials” or “paste an API token”; accepted explicit safety prohibitions; excessive task duration; every field boundary; malformed JSON; duplicate lesson titles; circular prerequisites; bounded Core/Advanced curriculum counts; and rejected generate/regenerate/tweak/confirm mutations for completed or started courses with their progress and artifacts unchanged.
- [ ] **Step 2: Run validator and curriculum tests.**
  ```bash
  npx vitest run server/__tests__/task-spec.test.js server/__tests__/curriculum.test.js
  ```
  Expected: FAIL because task validation and bounded course validation do not exist.
- [ ] **Step 3: Implement `task-spec.js`.** Export `normalizeTaskSpec`, `validateTaskSpec`, `validateTaskTextPolicy`, and a constrained `TASK_SETUP_KINDS` list. Enforce the explicit field, count, access-flag, and negation-aware imperative-text contract; reject data rather than silently repairing unsafe or incomplete task specifications.
- [ ] **Step 4: Upgrade Core generation.** Extend the LLM schema with top-level `course` metadata and per-lesson `task`. Explicitly request 80/20 coverage, 3–5 modules, 3–5 lessons per module, practical outcomes, and the structured safe free-access contract. Persist normalized task JSON in `lessons.task_spec`, set `artifact_required = 1`, and set an appropriate artifact type for every newly generated lesson.
- [ ] **Step 5: Replace raw curriculum streaming.** Implement `curriculum-draft.js` to buffer provider text under an explicit maximum size, parse it after the provider completes, run full curriculum/task validation, then emit one `event: curriculum` SSE message. When only the task safety policy fails, regenerate the complete draft up to two times; otherwise return a typed error. Update the client stream reader and tests so malformed/truncated output produces an error state and no confirmation draft.
- [ ] **Step 6: Preserve completed and started course history.** Add a shared curriculum-mutation guard to generate, regenerate, tweak, and confirm routes. Reject a completed course or any course with started progress, messages, artifacts, quiz attempts, or exam attempts with `409`; allow only an unstarted draft to be replaced. Refactor persistence into a non-transactional inner writer plus a transaction-owning wrapper so continuation confirmation can reuse it without nested transactions. Existing curricula with blank `task_spec` continue to use legacy validation.
- [ ] **Step 7: Re-run focused tests and commit the isolated curriculum/task-schema change.**
  ```bash
  npx vitest run server/__tests__/task-spec.test.js server/__tests__/curriculum.test.js
  ```

### Task 5: Make task evidence the practical checkpoint

**Files:**
- Modify: `server/routes/lessons.js`
- Modify: `server/utils/lesson-state-machine.js`
- Modify: `server/__tests__/artifacts.test.js`
- Modify: `server/__tests__/lesson-state-machine.test.js`
- Modify: `client/src/components/ArtifactPanel.jsx`
- Modify: `client/src/__tests__/ArtifactPanel.test.jsx`

- [ ] **Step 1: Add failing server tests.** Confirm a new task-backed lesson exposes `task_spec`; rejects artifact submission before final teaching chunk; rejects quiz start before task approval; rejects both `/lessons/:lid/test-out/start|finish` and the existing `/lessons/:lid/test-out` GET/POST routes with `409 TASK_REQUIRED`; direct HTTP test-out cannot mark it `tested_out`; can submit structured evidence only after final chunk; cannot pass from a task alone; passes only after the subsequent quiz; preserves attempt history; and leaves state untouched if LLM artifact evaluation fails.
- [ ] **Step 2: Add failing UI tests.** Confirm a task renders scenario, goal, constraints, deliverables, success criteria, free path, fallback, and hidden hints; serializes the four evidence fields before submission; shows rubric feedback; and renders legacy artifact fields when no task spec exists.
- [ ] **Step 3: Run focused tests.**
  ```bash
  npx vitest run server/__tests__/artifacts.test.js server/__tests__/lesson-state-machine.test.js
  cd client && npx vitest run --config ./vitest.config.js src/__tests__/ArtifactPanel.test.jsx
  ```
  Expected: FAIL on task metadata and task-before-quiz gating.
- [ ] **Step 4: Remove the production-only state bypass.** Remove `PUT /api/topics/:id/lessons/:lid/state` and its unused client helper; tests seed state through database fixtures or tested state-machine APIs. Scope every remaining lesson lookup by both topic and lesson. For task-backed lessons, reject both test-out route families—`/test-out/start|finish` in `lessons.js` and `/test-out` in `curriculum.js`—with `409 TASK_REQUIRED`; do not alter legacy test-out behavior.
- [ ] **Step 5: Implement the ordered server transition rule.** Only when `task_spec` is non-empty, require `progress.state = practicing`, a nonzero `total_chunks`, and `current_chunk >= total_chunks` before artifact evaluation; then require `artifact_passed` before `startQuiz`. Do not change legacy artifacts. Include task context and structured evidence in artifact evaluation prompts. Retain the existing rubric pass rule and retry behavior.
- [ ] **Step 6: Set route-specific compatible payload limits.** Mount `express.json({ limit: '50mb' })` only for `/api/data/import` and `express.json({ limit: '32mb' })` only for `POST /api/topics/:id/lessons/:lid/artifact`, both before the general parser. The former preserves complete local backups that contain several valid legacy 5 MB artifacts; the latter accommodates worst-case JSON escaping of an otherwise valid 5 MB text artifact. Set the general API parser to `6mb` for ordinary requests. For structured tasks, cap each of the four evidence fields at 16 KiB and the canonical evidence record at 64 KiB before LLM evaluation; retain the existing 5 MB legacy artifact limit. Add boundary tests against the actual app router for a task payload, an escape-heavy 5 MB legacy artifact, and a valid backup over 6 MB.
- [ ] **Step 7: Implement evidence UI without a second backend flow.** Make `ArtifactPanel` select a task-evidence form when task metadata exists and submit a canonical, human-readable evidence record through the current artifact API. Keep text files/code/logs supported; clearly describe that evidence is reviewed, not executed.
- [ ] **Step 8: Re-run focused tests and commit the isolated practical-evidence change.**

## Chunk 3: Mixed assessment and continuation courses

### Task 6: Add private answer keys and mixed-quiz grading

**Files:**
- Create: `server/utils/mixed-quiz.js`
- Create: `server/__tests__/mixed-quiz.test.js`
- Modify: `server/routes/lessons.js`
- Modify: `server/__tests__/quiz.test.js`
- Modify: `server/__tests__/remediation.test.js`
- Modify: `client/src/components/QuizPanel.jsx`
- Modify: `client/src/__tests__/QuizPanel.test.jsx`

- [ ] **Step 1: Write failing utility tests.** Cover question validation, exactly two choice/two written regular items, one choice/one written retest items, unique option IDs, private key separation, invalid answer IDs, exact question-ID sets, missing/extra answers, 80-word and 2,000-character written-answer caps, deterministic choice scoring, weighted aggregation, legacy format pass-through, and sanitizer removal of answer keys.
- [ ] **Step 2: Add route/UI tests.** Verify `GET` and `POST` quiz-start responses never contain answer keys; each response carries an attempt ID; choice questions are radio groups with keyboard labels; written prompts have the word cap; evaluation combines deterministic and LLM scores; stale attempt IDs, empty/invalid/oversized answers, missing fields, and unexpected fields fail cleanly; and an LLM error writes neither answers nor evaluation.
- [ ] **Step 3: Run focused tests.**
  ```bash
  npx vitest run server/__tests__/mixed-quiz.test.js server/__tests__/quiz.test.js server/__tests__/remediation.test.js
  cd client && npx vitest run --config ./vitest.config.js src/__tests__/QuizPanel.test.jsx
  ```
  Expected: FAIL on missing format version, answer keys, and mixed UI.
- [ ] **Step 4: Generate and persist format version 2 quizzes.** Prompt for the precise mix and a separate answer key. Validate both before transition to `quiz_pending`; insert public questions, private answer key, attempt ID, and `format_version = 2` together. Keep all old attempts readable as version 1.
- [ ] **Step 5: Grade safely.** Require the submitted attempt ID to be the pending attempt for the exact topic/lesson. Validate that answer keys exactly equal the persisted question IDs, each choice value belongs to its question, and each written answer meets word/character limits; score choices locally; send only written responses and necessary lesson context to the LLM; aggregate weighted scores and critical gaps; then call the existing atomic state-machine result writer once. Persist an auditable per-question evaluation without exposing answer keys.
- [ ] **Step 6: Render the formats accessibly.** Extend `QuizPanel` rather than creating another quiz page. Maintain retry/remediation navigation and existing quiz result feedback.
- [ ] **Step 7: Re-run focused tests and commit the isolated assessment change.**

### Task 7: Implement continuation routes and Advanced-course generation

**Files:**
- Create: `server/routes/continuations.js`
- Create: `server/__tests__/continuations.test.js`
- Modify: `server/index.js`
- Modify: `server/routes/curriculum.js`

- [ ] **Step 1: Write failing API tests.** Cover non-existent topic, incomplete parent, merely lesson-complete but exam-incomplete parent, successful readiness, exactly three options, custom lane sanitization and canonical duplicate rejection, inherited/changed profile, transient generation that creates no rows, malformed/truncated stream that emits no curriculum event, invalid draft, valid confirmation, parent/child persistence, ancestry depth, two siblings with distinct lanes, self-link/cycle/stage violations, active-limit failure, concurrent duplicate confirmation, LLM error, and provider configuration error.
- [ ] **Step 2: Run the continuation tests.**
  ```bash
  npx vitest run server/__tests__/continuations.test.js
  ```
  Expected: FAIL because no continuation router is mounted.
- [ ] **Step 3: Build continuation context and option prompts.** Use the deterministic stored course summary and direct ancestry, capped to avoid unbounded prompts. Ask the LLM for exactly three practical, distinct lanes with rationale, inherited strengths/gaps, intended outcomes, and structured free-stack access fields. Validate option shape before returning it.
- [ ] **Step 4: Build transient advanced curriculum endpoints.** Reuse SSE and curriculum validators, but pass parent title, course focus, inherited profile, stage, completed outcomes, and known gaps into an Advanced-specific prompt. Require the same bounded task-backed schema. Tweak requests operate only on the payload supplied in the request.
- [ ] **Step 5: Build atomic confirmation.** Recheck parent completion and capacity inside the write transaction; create `topics` row with `course_kind = 'advanced'`, focus, stage, inherited profile, and `last_active_at`; create `course_links`; call the shared inner curriculum writer; set the first lesson available; and return the new topic. Make repeated confirmation idempotent by rejecting an existing child with the same parent and normalized lane rather than duplicating it.
- [ ] **Step 6: Mount the route and re-run tests.**
  ```bash
  npx vitest run server/__tests__/continuations.test.js server/__tests__/course-lineage.test.js server/__tests__/curriculum.test.js
  ```
- [ ] **Step 7: Commit the isolated continuation backend change.**

### Task 8: Deliver the course and lane UX

**Files:**
- Create: `client/src/pages/ContinuationFlow.jsx`
- Create: `client/src/__tests__/ContinuationFlow.test.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/api.js`
- Modify: `client/src/pages/Dashboard.jsx`
- Modify: `client/src/pages/OnboardingFlow.jsx`
- Modify: `client/src/pages/CurriculumConfirmation.jsx`
- Modify: `client/src/__tests__/Dashboard.test.jsx`
- Modify: `client/src/__tests__/CurriculumFlow.test.jsx`

- [ ] **Step 1: Write failing component tests.** Cover Core-course framing during onboarding; completed course display; no continuation CTA until every module is completed; three selectable lanes; custom lane; inherited profile editing; loading/error/retry states; cancellation without a created topic; draft review; tweak/regenerate; confirmation navigation; parent/child lineage display; and completed-course selection.
- [ ] **Step 2: Run frontend tests.**
  ```bash
  cd client && npx vitest run --config ./vitest.config.js src/__tests__/ContinuationFlow.test.jsx src/__tests__/Dashboard.test.jsx src/__tests__/CurriculumFlow.test.jsx
  ```
  Expected: FAIL because the flow, API helpers, route, and course display do not exist.
- [ ] **Step 3: Add API helpers and route.** Add one helper per continuation endpoint; use the existing SSE reader for generation. Register `/topic/:topicId/continue` and keep all route state recoverable from the server response rather than in fragile navigation-only state.
- [ ] **Step 4: Implement `ContinuationFlow`.** It fetches readiness, fetches suggestions only after eligibility, supports a suggested or custom lane, pre-fills profile controls from the parent, generates a transient draft, reuses curriculum confirmation affordances, and only navigates to the new topic after successful confirmation.
- [ ] **Step 5: Update dashboard and onboarding.** Present Core/Advanced stage labels, a readable parent link, completed-course status, and a focused continuation CTA. Change Core wording from an unbounded “learning path” to an 80/20 foundation with a clear milestone. Keep module cards, graph navigation, reviews, and topic switching functional.
- [ ] **Step 6: Re-run frontend tests and build.**
  ```bash
  cd client && npx vitest run --config ./vitest.config.js
  cd .. && npm run build
  ```
  Expected: all frontend tests and production build PASS.
- [ ] **Step 7: Commit the isolated frontend change.**

## Chunk 4: Backup compatibility and full verification

### Task 9: Version exports and imports without losing learning history

**Files:**
- Modify: `server/routes/data.js`
- Modify: `server/__tests__/data-export-import.test.js`
- Modify: `client/src/__tests__/SettingsPageExportImport.test.jsx`

- [ ] **Step 1: Write failing backup tests.** Cover export version `1.1.0`, `course_links` export, new topic/lesson/quiz public columns, complete absence of answer keys from the browser export payload, round-trip with branches and task evidence, import of a `1.0.0` legacy backup without `course_links`, malformed/duplicate/self/cyclic/stage-invalid links, unresolved mixed quizzes, and rollback on invalid data.
- [ ] **Step 2: Run focused tests.**
  ```bash
  npx vitest run server/__tests__/data-export-import.test.js
  cd client && npx vitest run --config ./vitest.config.js src/__tests__/SettingsPageExportImport.test.jsx
  ```
  Expected: FAIL on versioned lineage support.
- [ ] **Step 3: Implement version-aware import.** Export every non-credential public course field and `course_links`, but explicitly omit `quiz_attempts.answer_key`. Treat missing new fields/tables in version 1.0 backups as empty/default values. Reject supplied answer keys instead of importing them. Before import mutation, validate parent-before-child ordering, normalized lane uniqueness, self-link/cycle prevention, and exact stage progression. For a format-2 attempt without an evaluation, remove that unresolved attempt and return its progress row from `quiz_pending` to `practicing`; completed attempts retain their evaluation. Insert parent topics before links and preserve the current transaction rollback guarantee.
- [ ] **Step 4: Re-run focused tests and commit the isolated backup change.**

### Task 10: Run regression, resilience, and manual acceptance checks

**Files:**
- Modify as required only for failures discovered by the checks below.

- [ ] **Step 1: Run all backend tests.**
  ```bash
  npm run test:backend
  ```
  Expected: PASS.
- [ ] **Step 2: Run all frontend tests.**
  ```bash
  npm run test:frontend
  ```
  Expected: PASS.
- [ ] **Step 3: Build production assets.**
  ```bash
  npm run build
  ```
  Expected: PASS.
- [ ] **Step 4: Perform manual local acceptance checks.** With an LLM provider configured, create a Core course; inspect its finite task-backed draft; complete a task and mixed quiz; pass module exams; confirm completion and due reviews remain visible; create a suggested Advanced lane; verify the completed parent is unchanged; switch the configured provider before a later lesson; and confirm the course lineage and progress remain intact.
- [ ] **Step 5: Run final repository checks.**
  ```bash
  git diff --check
  git status --short
  ```
  Expected: no whitespace errors; only intentional files are changed. Do not stage or overwrite pre-existing user changes.

## Acceptance criteria

- A generated Core roadmap is server-validated as finite, task-backed, safe, and free-path capable.
- Completing all lessons and module exams visibly completes the course and frees an active-topic slot without losing reviews or evidence.
- A learner can create a separate, linked Advanced course from a selected or custom lane; its content uses prior outcomes and gaps, and the parent course is unchanged.
- A learner can branch into multiple advanced lanes and keep progressing down either branch.
- Every new lesson requires a practical evidence submission and a short mixed quiz; legacy lessons and quiz attempts continue to work.
- Choice-answer keys never reach the browser, mixed scores remain auditable, and remediation remains focused on identified gaps.
- Legacy backups import successfully, new backups preserve lineage and evidence, and invalid imports make no changes.
- Provider switches, malformed LLM output, invalid submissions, stale attempts, task/test-out bypass requests, retries, active-limit conflicts, and interrupted continuation requests never create partial courses or corrupt progress.
