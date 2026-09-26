# Mastery Trail Product, Learning Runtime, and UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development if subagents are available, or superpowers:executing-plans otherwise. Work one task at a time, follow every checkbox, and run the named verification before committing. Never include unrelated dirty-worktree changes in a commit.

**Goal:** Transform the current chat-first roadmap app into Mastery Trail: a cozy, focused, highly engaging mastery product built around short interactive sessions, meaningful chapter checkpoints, practical evidence, and an endless sequence of finite balanced Tracks.

**Architecture:** Keep the existing React, Express, SQLite, curriculum, artifact, exam, SRS, mistakes, and course-lineage foundations. Add a thin deterministic mastery spine around structured outcome manifests and persisted activity state. AI compiles approved outcomes into validated learning activities, adapts explanations, evaluates bounded open responses, and proposes the next Track; ordinary application code owns identity, ordering, persistence, scoring rules, unlocking, completion, reviews, and lineage.

**Tech Stack:** React 19, React Router 7, Vite 6, Tailwind CSS 4, semantic CSS custom properties, Express 4, better-sqlite3, the existing LLM provider abstraction, Vitest, React Testing Library.

---

## 1. Status and decision record

This plan is the implementation source of truth for the approved direction.

The product vocabulary changes in the interface, while database nouns remain internal implementation details:

| Product term | Existing implementation term | Meaning |
|---|---|---|
| Trail | A linked topic lineage | The learner's continuing journey through one subject. It is derived from course_links and is not a new table. |
| Track | topic | One finite, completable curriculum. |
| Chapter | module | A coherent group of Sessions ending in a checkpoint. |
| Session | lesson | A short sequence of interactive activity blocks. |
| Chapter checkpoint | module exam | A meaningful assessment after a Chapter, not after every Session. |
| Build | artifact/task evidence | Practical proof that the learner can transfer knowledge into action. |
| Review | SRS item | Retrieval practice scheduled from completed learning. |

The final architecture is intentionally simpler than a conventional adaptive-learning platform:

- Do not introduce a skill graph, mastery ledger, events table, XP ledger, awards table, social feed, account system, or separate Trail table.
- Add only two persisted columns: lessons.activity_blocks and progress.activity_state.
- Store new structured outcome manifests inside the existing modules.skill_outcomes and lessons.outcomes JSON fields.
- Use a one-way development cutover. Existing learning data and old backups are not supported after the new schema lands.
- Use one structured Session runtime. Delete the chat-chunk, per-Session quiz, remediation, skip, and test-out flows.
- Do not require a quiz after a Session.
- Continue using module exams as Chapter checkpoints.
- Continue using artifacts, checkpoint remediation/partial retest, SRS, mistakes, streak, current-format backup, and provider systems.
- Replace continuation lane selection with one balanced next Track using the 80/20 progression contract.

### 1.1 Clean-cutover policy

Migration 018 is intentionally destructive to pre-overhaul learning data:

- Preserve llm_settings and provider connection state.
- Delete topics; existing foreign-key cascades remove curricula, progress, messages, reviews, artifacts, exams, placement records, mistakes, lineage, and generation jobs.
- Reset streaks.
- Preserve the browser-local theme selection because it is not learning data.
- Reject backup payloads created before backup format version 2.
- Announce the reset plainly in release notes before implementation is distributed.

This is a development-stage reset, not a production migration strategy. Do not add compatibility code, dual response shapes, legacy UI, legacy route fallbacks, or one-off data inference.

## 2. Product principles and non-negotiable guardrails

### 2.1 Learning remains the core loop

The primary loop is:

    orient → attempt → receive targeted feedback → retry or advance → prove transfer → retrieve later

The application must not become a content reader with decorative points. Every high-emphasis interaction must move one of these learning actions forward.

### 2.2 Engagement without manipulation

Use:

- Clear short-term goals.
- Visible progress through a finite Track.
- Immediate, specific feedback.
- Choice of explanation or hint when stuck.
- Satisfying completion transitions.
- Weekly rhythm derived from real learning activity.
- Streak recovery language that encourages returning.
- Progress celebrations tied to demonstrated work.

Do not use:

- Infinite-scroll learning.
- Artificial urgency.
- Punishing streak resets.
- Loot boxes, currencies, random rewards, or meaningless badges.
- Shame copy.
- Notifications that imply failure.
- Confetti for routine clicks.
- Scores that hide weak outcomes behind an overall average.

### 2.3 AI is powerful but not authoritative

AI may:

- Generate validated activity content from declared outcomes.
- Adapt explanations, analogies, examples, and hints.
- Generate checkpoint questions against outcome IDs.
- Evaluate short written responses and artifacts against explicit rubrics.
- Summarize demonstrated strengths and gaps.
- Generate the next balanced Track from bounded lineage context.

AI may not:

- Invent or change Track outcomes after a learner starts.
- Directly write progress state.
- Decide unlocks or completion outside deterministic thresholds.
- Grade choice, ordering, or other objective interactions.
- Remember course history only through chat.
- expose private answer keys to the browser.
- Rewrite an in-progress activity set.
- Declare mastery from conversation sentiment or message count.

### 2.4 Anti-slop visual rules

- No gradients, glassmorphism, glowing AI orbs, generic dashboard hero art, or decorative chat avatars.
- Do not put every piece of content in an identical card.
- Use at most three surface levels: canvas, section, interactive control.
- Use one visually dominant action per view.
- Prefer editorial typography, generous space, and confident borders over shadow stacks.
- Use pills only for compact status or metadata.
- Motion must explain state change; it must not run continuously.
- Use illustrations only when they teach, orient, or celebrate a major milestone.
- Keep tutor UI secondary to the activity.

## 3. Success criteria

The release is complete only when all of the following are true:

### Learning behavior

- A learner can start an untouched Session, complete structured activities, submit a required Build when present, and finish without a per-Session quiz.
- A Chapter checkpoint unlocks only when all Sessions in that Chapter are passed or tested out.
- A Chapter completes only after checkpoint rules pass.
- A Track completes only after every Chapter completes.
- SRS, mistakes, remediation, checkpoint retakes, and partial retests still work.
- A completed Track offers one balanced next Track, not three specialization lanes.
- The next Track is finite, shows a preview, and is not persisted until confirmation.
- The next Track contains approximately 80 percent high-leverage core progression and 20 percent adjacent breadth, plus both knowledge and skill outcomes.

### Reliability

- Generated activities are schema-validated before persistence.
- Generated activity content is immutable after the learner starts.
- Concurrent generation requests converge on one stored activity document.
- Objective answers are scored locally.
- Open answers are graded against bounded rubrics and failure leaves progress unchanged.
- A pre-overhaul database is reset once and then operates only on the new contracts.
- Export and import round-trip both new fields.

### Experience

- On opening the dashboard, the next useful action is visible without scrolling at 1440 × 900 and at 390 × 844.
- A returning learner can resume the current activity in at most two interactions.
- Desktop Session view keeps the activity central and the tutor in a secondary sidecar.
- Mobile Session view uses one content column and a dismissible tutor sheet.
- Keyboard users can complete every activity and checkpoint.
- All 16 themes remain selectable and retain their stored theme IDs.
- Every theme passes the automated contrast contract.
- Reduced-motion mode removes nonessential animation.

### Performance

- Dashboard initial render does not trigger LLM work.
- Activity generation occurs only when an eligible untouched Session is opened or explicitly retried.
- Returning to a generated Session reads cached JSON and makes no generation request.
- Activity-state writes update one block at a time and do not replace newer state from another tab.
- Production client build succeeds without console warnings introduced by this work.

## 4. System architecture

### 4.1 Three layers

    Layer 1: Mastery contract
    Track and Chapter outcomes, evidence requirements, ordering, and thresholds
                              ↓
    Layer 2: AI content layer
    Activities, explanations, hints, bounded written evaluation, next-Track draft
                              ↓
    Layer 3: Deterministic runtime
    State transitions, objective scoring, persistence, unlocks, SRS, completion

### 4.2 Source-of-truth matrix

| Concern | Source of truth | AI involvement |
|---|---|---|
| Outcome identity | Persisted curriculum JSON | Proposes during draft generation; validator accepts or rejects. |
| Activity ordering | Persisted activity_blocks JSON | Generates once before Session start. |
| Current position | progress.activity_state | None. |
| Choice and ordering score | Server code and private answer key | None. |
| Written response feedback | Stored rubric and bounded evaluator | Evaluates only the submitted response. |
| Build pass | Existing artifact rubric and deterministic pass rule | Scores rubric dimensions. |
| Chapter pass | Versioned checkpoint envelope plus deterministic threshold | Evaluates written portions only. |
| Session, Chapter, Track unlock | State-machine code | None. |
| Review schedule | Existing SRS scheduler | May generate review wording, never due dates. |
| Next Track | Confirmed continuation curriculum | Proposes a transient draft; validator and learner confirmation control persistence. |
| Theme | Existing localStorage preference | None. |

### 4.3 Single Session classification

The server has only three valid read conditions:

| Condition | Behavior |
|---|---|
| activity_blocks is null and progress is not_started | The Session is eligible; the client calls the idempotent generation endpoint. |
| activity_blocks contains a valid document | Use SessionPlayer and the structured runtime. |
| activity_blocks contains malformed or unsupported JSON | Return ACTIVITY_DOCUMENT_INVALID; never guess, silently repair, or fall back. |

Migration 018 removes pre-overhaul progress, so no dual runtime is necessary.

## 5. Data contracts

### 5.1 Migration 018 and backup format 2

Update the canonical table definitions and add an idempotent cutover migration to server/db.js:

    const migration018 = '018_add_structured_activities'

    ALTER TABLE lessons ADD COLUMN activity_blocks TEXT;
    ALTER TABLE progress ADD COLUMN activity_state TEXT NOT NULL DEFAULT '{}';

The migration adds both columns, deletes every topic so existing cascades clear pre-overhaul learning data, and resets streaks. It must not delete llm_settings. Do not add a generated-content table. Each lesson has exactly one frozen activity document. Activity attempts and responses are compactly stored inside progress.activity_state.

Migration tests must verify:

- A fresh database has both columns.
- A database migrated from migration 017 has no learning rows or streak rows after the cutover.
- Existing llm_settings survive the cutover unchanged.
- Running initSchema repeatedly is safe.
- Deleting a Track continues cascading through existing foreign keys.

Backup format 2 rules:

- Export declares backupVersion: 2.
- Export never includes activity answerKey data or pending checkpoint answer keys.
- Completed progress, completed sanitized checkpoints, artifacts, SRS history, and outcome manifests may be exported.
- Incomplete Sessions export with activity_blocks omitted, activity_state empty, and state not_started so import regenerates them safely.
- Pending checkpoint attempts are omitted; a new checkpoint is generated after import.
- Import accepts version 2 only and rejects older/unknown formats with BACKUP_VERSION_UNSUPPORTED before any write.

### 5.2 Structured outcome manifest

New curricula store outcome objects. A lesson stores the full subset it teaches so prompts do not require fragile joins.

    {
      "id": "sql-joins-choose-correct-join",
      "title": "Choose and implement the correct SQL join",
      "kind": "skill",
      "role": "core",
      "evidence": ["activity", "checkpoint", "artifact"]
    }

Field rules:

| Field | Rule |
|---|---|
| id | Required kebab-case string, 3–80 characters, unique inside the Track. |
| title | Required plain text, 5–160 characters. |
| kind | knowledge or skill. |
| role | core or breadth. |
| evidence | Nonempty unique subset of activity, checkpoint, artifact. |

Track validation rules:

- Every lesson outcome ID must exist in its Chapter's skill_outcomes.
- Every Chapter has at least one knowledge and one skill outcome.
- Every Chapter has at least one core outcome.
- Every skill outcome requires activity evidence.
- At least one Session per Chapter requires an artifact.
- New continuation Tracks must contain at least one breadth outcome.
- For Tracks with at least ten outcomes, 70–90 percent must have role core. This tolerance implements an honest 80/20 goal without forcing impossible rounding.
- IDs cannot repeat any outcome ID in the supplied lineage summary.
- Normalized titles cannot exactly repeat lineage outcome titles.

Create server/utils/outcome-manifest.js with these exports:

    validateOutcome(value, path)
    validateOutcomeManifest(curriculum, options)
    publicOutcome(outcome)
    collectOutcomeCoverage(curriculum)

Function contracts:

- validateOutcome returns { valid: true, value } or { valid: false, code, path, error }; it never throws for input errors.
- validateOutcomeManifest accepts options { trackKind, lineageOutcomes }.
- trackKind is initial or continuation. Initial Tracks require core coverage but may contain zero breadth outcomes; continuation Tracks enforce the 70–90 percent core rule and at least one breadth outcome.
- lineageOutcomes is an array of prior { id, title } values used only for continuation duplicate rejection.
- JSON text parsing remains the responsibility of curriculum-draft.js; outcome-manifest.js accepts objects only.

### 5.3 Activity document

Persist this private server document in lessons.activity_blocks:

    {
      "schemaVersion": 1,
      "promptVersion": "session-activities-v1",
      "generator": {
        "provider": "openai",
        "model": "example-model",
        "generatedAt": "2026-09-26T12:00:00.000Z"
      },
      "lesson": {
        "lessonId": 42,
        "outcomeIds": ["sql-joins-choose-correct-join"],
        "estimatedMinutes": 18
      },
      "blocks": [
        {
          "id": "hook",
          "type": "read",
          "title": "Why joins fail quietly",
          "required": true,
          "estimatedMinutes": 2,
          "content": "Markdown content"
        },
        {
          "id": "choose-join",
          "type": "choice",
          "title": "Choose the relationship",
          "required": true,
          "estimatedMinutes": 3,
          "prompt": "Question text",
          "options": [
            {"id": "a", "label": "INNER JOIN"},
            {"id": "b", "label": "LEFT JOIN"}
          ],
          "outcomeIds": ["sql-joins-choose-correct-join"]
        }
      ],
      "answerKey": {
        "choose-join": {
          "kind": "choice",
          "correctOptionId": "b",
          "explanation": "Specific explanation",
          "critical": true
        }
      }
    }

Every block has exactly these common fields:

| Field | Rule |
|---|---|
| id | Kebab-case, 2–80 characters, unique in the document. |
| type | One of the six types below. |
| title | Plain text, 3–120 characters. |
| required | Boolean. Version 1 generation sets every block to true. |
| estimatedMinutes | Integer 1–15. |
| outcomeIds | One to five unique IDs, each declared by the lesson. |

Type-specific public fields:

| Type | Exact additional fields | Completion |
|---|---|---|
| read | content: Markdown string, 1–4,000 characters. | Continue after content is visible. |
| worked_example | problem: 1–1,200 characters; steps: 2–6 objects containing id 1–40, title 1–100, content 1–2,000; takeaway: 1–500. | Reveal every step in stored order, then continue. |
| choice | prompt: 1–1,000; options: 2–5 objects containing unique id 1–40 and label 1–300. | Server scores one submitted option ID. |
| ordering | prompt: 1–1,000; items: 2–7 objects containing unique id 1–40 and label 1–300. | Server scores a submitted array containing every item ID exactly once. |
| short_answer | prompt: 1–1,000; responseHint: 1–200; minChars: integer 1–100; maxChars: integer from minChars through 600. | AI evaluates a bounded string against private criteria. |
| reflection | prompt: 1–1,000; placeholder: optional 0–160; maxChars: integer 1–400. | A nonempty bounded response completes it without correctness language. |

Private answerKey forms:

| Block type | Exact private fields |
|---|---|
| choice | kind choice; correctOptionId matching one option; explanation 1–1,000; critical boolean. |
| ordering | kind ordering; correctOrder containing every item ID exactly once; explanation 1–1,000; critical boolean. |
| short_answer | kind short_answer; criteria containing 2–4 objects with unique id 1–40, label 1–120, description 1–500, and critical boolean; exemplar 1–1,500. |

read, worked_example, and reflection must not have answerKey entries. The answerKey key set must exactly equal the choice, ordering, and short_answer block ID set.

Generation requirements:

- Four to eight blocks.
- One read block and one worked example minimum.
- Two active attempts minimum across choice, ordering, and short_answer.
- At least one active attempt appears in the final two blocks.
- Every declared lesson outcome appears on one or more active blocks.
- Total estimated minutes is between 60 and 125 percent of lesson.estimated_time, with an absolute floor of 5 and ceiling of 45 minutes.
- IDs are unique, stable, kebab-case, and never generated from array indexes at runtime.
- Markdown is allowed only in content, prompt, steps, explanation, and takeaway fields.
- Content cannot contain scripts, HTML event attributes, external image embeds, or data URLs.
- The serialized document is capped at 128 KiB.
- blocks is capped at 8; outcomeIds at 5; options at 5; items at 7; steps at 6; criteria at 4; object nesting beyond the declared shapes is rejected.
- Private answerKey entries must exactly match objective or graded block IDs.
- Public sanitization returns only schemaVersion, lesson, and allowlisted public block fields. It removes answerKey and generator metadata from every client response.

Create server/utils/activity-schema.js with:

    parseActivityDocument(raw)
    validateActivityDocument(document, lesson)
    sanitizeActivityDocument(document)
    getBlock(document, blockId)
    isObjectiveBlock(block)

### 5.4 Activity state

Store this compact state in progress.activity_state:

    {
      "schemaVersion": 1,
      "currentBlockId": "choose-join",
      "blocks": {
        "hook": {
          "status": "completed",
          "attempts": 1,
          "completedAt": "2026-09-26T12:04:00.000Z"
        },
        "choose-join": {
          "status": "needs_retry",
          "attempts": 1,
          "response": "a",
          "feedback": "A LEFT JOIN is needed because...",
          "updatedAt": "2026-09-26T12:06:00.000Z"
        }
      },
      "updatedAt": "2026-09-26T12:06:00.000Z"
    }

State rules:

- Block statuses are not_started, active, completed, passed, or needs_retry.
- read, worked_example, and reflection finish as completed.
- choice, ordering, and short_answer finish as passed.
- Required blocks unlock in stored order.
- Completed blocks remain reviewable but cannot be uncompleted.
- Attempts increment only for a valid submission.
- Store the last response only, capped by the block's response limit.
- Update one block transactionally on the server. The client never sends the whole state document.
- Unknown block IDs, future block IDs, and submissions to locked blocks return 409 and do not mutate state.
- Before every decision, strictly validate activity_state against the frozen document: known IDs only, valid statuses, nonnegative integer attempts, type-correct bounded responses, legal completion statuses, and a currentBlockId equal to the first unresolved required block. Invalid state returns ACTIVITY_STATE_INVALID with no mutation or side effects.
- Repeating a canonically identical successful request returns the stored result without incrementing attempts, recording another mistake, or repeating completion side effects.
- Submitting a different response to a final block returns 409 BLOCK_ALREADY_FINAL and the latest sanitized state.
- A stale ordering request returns 409 ACTIVITY_STATE_CONFLICT and the latest sanitized state.
- A failed scored attempt records one stable mistake description built as outcome title — criterion label, or outcome title — block title when no criterion exists.
- localDate must be a real calendar date in YYYY-MM-DD form. Impossible dates such as 2026-02-31 are rejected.

Create server/utils/activity-runtime.js with:

    ensureProgressRow(topicId, lessonId)
    startActivitySession(topicId, lessonId)
    completeInformationalBlock(input)
    submitObjectiveBlock(input)
    recordWrittenEvaluation(input)
    getActivityProgress(topicId, lessonId)
    completeActivitySessionIfEligible(topicId, lessonId, completionContext)

completionContext contains validated localDate and now. When the final required block or artifact passes, one SQLite transaction commits the block/artifact result, Session state, completed_at, SRS row, streak, mistake update, and topics.last_active_at.

## 6. API contracts

### 6.1 Read Session

Extend GET /api/topics/:id/lessons/:lid.

Response additions:

    {
      "activityDocument": {
        "schemaVersion": 1,
        "lesson": {},
        "blocks": []
      },
      "activityState": {},
      "activityProgress": {
        "completed": 2,
        "total": 6,
        "percent": 33,
        "currentBlockId": "choose-join"
      }
    }

Security and correctness:

- Continue scoping every lesson lookup by both topic and lesson.
- Never return answerKey, model answers, or rubric scoring anchors.
- Return activityDocument null for an untouched Session.
- Malformed stored activity JSON returns a typed 500 error and does not fall back silently.

### 6.2 Generate or fetch activities

Add POST /api/topics/:id/lessons/:lid/activities.

Behavior:

1. Validate topic, lesson, prerequisite status, and current structured progress.
2. If a valid document exists, return it without calling the provider.
3. Build a bounded prompt from topic title, Chapter title, lesson title, outcomes, estimated time, task metadata, learner level, difficulty, and interaction mode.
4. Do not include full chat history, unrelated chapters, credentials, or raw artifacts.
5. Collect provider output under 128 KiB.
6. Parse and validate the complete JSON before any write.
7. Atomically cache with an update conditioned on empty activity_blocks.
8. Re-read the winning document and return its sanitized form.
9. After a valid document exists, call startActivitySession transactionally when progress is not_started, then return the resulting activity state.
10. Leave the database unchanged on provider, parse, validation, or disconnect failure.

SessionPage calls this endpoint whenever activityDocument is null. Merely reading the dashboard or curriculum never starts a Session.

Response status:

- 200 for cached.
- 201 for newly stored.
- 400 for invalid request or provider configuration.
- 409 for prerequisite or ordering conflict.
- 422 for generated schema failure.
- 502 for malformed provider output.

Use an in-process Map keyed by lesson ID only to deduplicate concurrent work in one server process. Correctness must still rely on the conditional SQLite update because process memory is not durable and multiple processes may exist.

### 6.3 Start and complete simple blocks

Add POST /api/topics/:id/lessons/:lid/activities/:blockId/complete.

Request:

    {
      "action": "continue",
      "response": "Optional reflection text",
      "localDate": "2026-09-26"
    }

Only read, worked_example, and reflection are accepted. The server validates prerequisites and block ordering, merges one block state, attempts Session completion, and returns the sanitized activity state plus any completion event.

### 6.4 Submit scored blocks

Add POST /api/topics/:id/lessons/:lid/activities/:blockId/submit.

Request:

    {
      "response": "b",
      "localDate": "2026-09-26"
    }

Response:

    {
      "correct": true,
      "status": "passed",
      "feedback": "A LEFT JOIN keeps unmatched rows...",
      "activityState": {},
      "session": {
        "completed": false,
        "requiresArtifact": false
      }
    }

Rules:

- Choice and ordering are scored synchronously in code.
- short_answer uses the stored rubric, lesson outcome, and learner response only.
- The evaluator returns criterion IDs, pass booleans, concise feedback, and one next step.
- The deterministic pass rule requires every criterion marked critical and at least 70 percent of all criteria.
- If evaluation parsing fails, return retryable 502 and write nothing.
- Never reveal the correct option before the learner submits.
- After an incorrect objective response, return an explanation and permit retry; do not return the raw answer key object.

### 6.5 Tutor sidecar

Extend the existing chat endpoint request with optional activityBlockId.

When present:

- Validate that the block belongs to the persisted document.
- Add the public block, relevant outcomes, and current attempt feedback to the tutor system prompt.
- Tell the tutor to ask guiding questions before giving a complete answer.
- Tell the tutor not to claim completion or alter scores.
- Keep the existing 2,000-character learner-message limit.
- Store messages through the existing messages table.

The tutor is available only as the SessionPlayer sidecar.

### 6.6 Chapter checkpoint

Keep the existing module exam endpoints and persistence. Change product copy and generation contracts:

- Questions reference one or more outcomeIds.
- Every core Chapter outcome appears in at least one question.
- Objective questions are scored in code when their answer keys are available.
- Written questions are evaluated by rubric.
- Overall pass threshold becomes 80.
- Every critical core outcome must score at least 60.
- Failed outcomes are returned explicitly for remediation and partial retest.
- Auto-saved responses and incomplete-submission protection remain unchanged.

Store new checkpoints as a versioned envelope inside the existing exam_attempts.questions TEXT column:

    {
      "schemaVersion": 1,
      "publicQuestions": [],
      "answerKey": {}
    }

Every GET and POST response returns publicQuestions only. Migration 018 removes all pre-overhaul attempts, so the parser accepts only this envelope. All checkpoints use the 80 percent plus critical-outcome-floor rule.

### 6.7 Balanced continuation

Delete POST /continuation-options and its client function. There is no lane-selection compatibility endpoint.

Change POST /continuations/generate to accept:

    {
      "level": "Advanced",
      "timeCommitment": "30 min/day"
    }

The server supplies a fixed lane value balanced-next to the existing lineage writer. The learner no longer chooses a lane.

The continuation prompt must include:

- Up to the last 12 Track summaries.
- All bounded prior outcome IDs and normalized titles.
- Demonstrated strengths.
- Persistent and recent gaps.
- Artifact feedback summaries.
- Learner level and time commitment.
- The 80/20 core-to-breadth contract.
- The knowledge-and-skill contract.
- The finite 3–5 Chapter and 3–5 Session bounds.

The validator rejects exact repeated IDs or titles and invalid coverage. The transient draft is still editable through the current tweak endpoint and is persisted only through confirmation.

Change the active limit:

- A root Trail is a topic with no parent course_link.
- MAX_ACTIVE_TOPICS applies only to active root Trails.
- Linked continuation Tracks do not consume another root slot.
- Each completed Track may have only one balanced-next child.
- Each Track has at most one child, so the Trail is linear.

## 7. Deterministic state transitions

### 7.1 Structured Session

    not_started
        ↓ startActivitySession
    practicing
        ↓ every required block passed/completed
        ├─ no required artifact → passed
        └─ required artifact → practicing, artifact phase visible
                                    ↓ artifact passes
                                  passed

On structured Session pass:

- Set completed_at once.
- Schedule the existing lesson review once.
- Record the existing streak event once.
- Update topic.last_active_at.
- Recompute dashboard next action.
- Do not create a quiz_attempt.

Replace the lesson state machine with exactly not_started, practicing, and passed. practicing to passed is permitted only through the structured completion function. Delete per-Session continue, quiz, remediation, skip, and test-out transitions and routes. Do not expose a generic client-controlled state endpoint.

### 7.3 Artifact interaction

- Artifact submission is unavailable until all required activity blocks are done.
- Existing artifact evaluation and attempt history remain.
- An artifact-required Session passes when the artifact passes; no quiz score is required.
- A failed artifact leaves the Session practicing and returns actionable rubric feedback.
- Optional blocks, if introduced in a future schema, never gate artifact availability or completion.
- Artifact pass, Session pass, completed_at, SRS, streak, and topic activity update commit in one transaction.

### 7.4 Chapter and Track completion

- Chapter checkpoint readiness continues to require every Session passed or tested_out.
- Passing the checkpoint sets modules.status to completed.
- Final Chapter completion calls the existing completeCourseIfEligible logic.
- Track status becomes completed, course_summary is frozen, and continuation readiness becomes true.
- Reviews stay available after Track completion.

## 8. Information architecture and UX specification

### 8.1 Global navigation

Desktop header:

- Mastery Trail wordmark at left.
- Trail, Reviews, and Settings destinations.
- Due-review count only when already available; do not issue a header-only request.
- Active theme styling without a separate appearance icon.
- New Trail action placed after primary navigation and visually secondary to Continue Learning.

Mobile:

- Compact wordmark and page context in the top bar.
- Bottom navigation with Trail, Reviews, and Settings.
- New Trail lives inside the Trail switcher, not as a fourth persistent tab.
- Respect safe-area insets.

Focus routes—Session, review, Build, and checkpoint—use a quiet header with Back, context, and progress. They do not show full navigation.

### 8.2 Dashboard: Today and the Trail

Desktop layout uses a 12-column grid:

- Main 8 columns: Today card and Trail map.
- Supporting 4 columns: weekly rhythm, reviews due, and active gaps.

The top Today card contains:

- Eyebrow: Continue your Trail.
- Current Track and Chapter.
- Session title.
- Current activity when resuming.
- Honest time estimate.
- Primary action: Continue or Start Session.
- Secondary action only when useful: Review due items.

Next-action priority:

1. Resume an in-progress structured Session.
2. Resume an in-progress checkpoint.
3. Start an overdue review when no learning item is active.
4. Start the first unlocked Session in the earliest incomplete Chapter.
5. Start the ready Chapter checkpoint.
6. Review Track completion and generate the next Track.

The Trail map is vertically readable, not a free-form graph:

- Track header shows stage, finite progress, and status.
- Chapters appear in order with a connecting trail line.
- Each Chapter shows outcome summary, Sessions, Build marker, and checkpoint.
- Current Chapter is expanded.
- Completed Chapters can collapse.
- Future Chapters show their titles and lock reason without exposing a wall of metadata.
- A completed prior Track appears as a compact node above the active Track.

The right rail:

- Weekly rhythm shows seven labeled days derived from started_at, completed_at, exam completion, and review timestamps.
- Reviews shows due and overdue counts with a direct action.
- Focus areas shows at most three uncleared mistakes and links to the related Session or Review.
- Do not show vanity totals such as total messages.

Mobile order:

1. Today.
2. Current Chapter.
3. Reviews due.
4. Remaining Trail.
5. Weekly rhythm and focus areas.

### 8.3 Session Player

Desktop:

- Maximum shell width 1180 px.
- Main activity column 680–760 px.
- Tutor sidecar 320–360 px, sticky within viewport.
- Header shows Chapter, Session, time, and block progress.
- Only one active block is presented as the task.
- Earlier completed blocks can be reopened in read-only review.
- Later blocks are visible only as small step markers, not full content.

Mobile:

- One content column.
- Sticky bottom action area with safe-area padding.
- Tutor opens as a bottom sheet and preserves draft text.
- Progress label remains textual, for example 3 of 6.

Block interaction:

- read: content followed by one Continue action.
- worked_example: learner reveals steps one at a time; Reveal next step is visually different from Continue.
- choice: large radio-like options, submit once selected, inline result, retry without page jump.
- ordering: keyboard-accessible Move up and Move down buttons are required even if drag-and-drop is added.
- short_answer: character counter, explicit expected response shape, submit, rubric feedback, retry.
- reflection: private-feeling text area and Save takeaway language; never label it correct or incorrect.

Feedback:

- Positive feedback says what was demonstrated.
- Incorrect feedback names the misconception and gives one useful clue.
- A hint never auto-completes a block.
- A second failed attempt offers Explain another way in the tutor.
- Do not use red as the whole background of the activity.

Session completion:

- Use a short 250–400 ms progress transition unless reduced motion is active.
- Show outcomes practiced, one takeaway, review timing, and the next useful action.
- Major celebration is reserved for Chapter and Track completion.

### 8.4 Tutor sidecar

- Title it Ask your guide, not AI Tutor.
- Include contextual suggestion chips such as Give me a hint, Show another example, and Why was this wrong?
- Chips insert a normal learner message and remain editable.
- Keep the conversation scannable and compact.
- The sidecar never replaces the activity or opens automatically.
- On error, preserve the learner's draft and offer Retry.
- The sidecar can be collapsed; store this preference only for the current browser session.

### 8.5 Chapter checkpoint

Before starting:

- Explain outcomes covered, approximate question count, estimated time, autosave, and pass rule.
- Show Continue learning if a Session remains; do not allow bypass.

During:

- One question at a time on mobile.
- Question navigator and answered count on desktop.
- Back and forward preserve answers.
- Submitting with unanswered required questions opens a summary and focuses the first missing question.

Results:

- Lead with Ready to continue or A few ideas need another pass.
- Show overall score and per-outcome evidence.
- Distinguish core gaps from supporting misses.
- Offer targeted Review weak outcomes, then partial retest.
- Keep full retake secondary.
- Do not celebrate a failed checkpoint.

### 8.6 Build flow

- Introduce the scenario, goal, deliverables, constraints, success criteria, safe setup, fallback, and estimated time before inputs.
- Keep the existing four evidence fields: setup, actions, result, reflection.
- Autosave client drafts in component state only; server persistence occurs on submission as today.
- Show rubric criteria before submission.
- After evaluation, pair each score with evidence and one revision step.
- Passing a Build should feel substantial and should be visible in Chapter and Track completion summaries.

### 8.7 Track completion and continuation

Completion page:

- Show the finite Track as completed.
- Summarize Chapters, outcomes, Builds, strengths, and continuing focus areas.
- Offer Review this Track and Build my next Track.

Generation:

- Use calm indeterminate progress with concrete stages: reading your Trail, balancing depth and breadth, designing practice, validating the plan.
- Do not show fake percentages.
- On failure, preserve the completion summary and offer retry.

Preview:

- Explain the 80/20 balance in plain language.
- Show which prior outcomes the new Track builds on.
- Mark breadth outcomes distinctly but quietly.
- Show Chapters, estimated weekly rhythm, and practical Builds.
- Primary action: Add to my Trail.
- Secondary actions: Adjust plan and Not now.

After confirmation, navigate to the new Track's dashboard. Do not auto-start its first Session.

### 8.8 Onboarding

Use four explicit steps:

1. Destination — what the learner wants to be able to do.
2. Starting point — self-report plus the existing placement option.
3. Learning rhythm — daily/weekly time and preferred pace.
4. Track preview — finite Chapters, outcomes, Builds, and checkpoint expectations.

Retain generation recovery. The page must survive refresh during generation and return to the active job. Avoid long personality questionnaires; the product learns from attempts.

### 8.9 Reviews

- Keep the current queue and session mechanics.
- Rename lesson review copy to retrieval practice where appropriate.
- Show why an item is due and its Track context.
- Completion feedback uses remembered, almost, and revisit language, not shame.
- An empty queue directs the learner to Continue Trail.

### 8.10 Settings

Sections:

1. Appearance.
2. Learning preferences.
3. AI connection.
4. Data and privacy.
5. Danger zone.

Learning preferences reuse existing tone, mode, and time fields where applicable; do not invent a profile table.

Data and privacy explains:

- Learning data lives in local SQLite.
- Theme lives in browser storage.
- Content sent to the configured provider includes bounded learning context.
- Credentials are never included in exports.

## 9. Visual design system

### 9.1 Design character

The target feeling is a beautifully printed field guide combined with a modern interactive notebook:

- Warm paper-like canvases.
- Crisp readable type.
- Botanical and twilight accent families.
- Friendly geometry without toy-like excess.
- A winding trail motif used only for progress.
- Subtle tactile controls.
- Calm empty space.

Use no external runtime font request. In version 1:

- Display stack: ui-rounded, Avenir Next, Nunito Sans, Segoe UI, sans-serif.
- Body stack: Inter, ui-sans-serif, system-ui, Segoe UI, sans-serif.
- Code stack: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace.

If licensed local fonts are added later, they must be bundled and must not block rendering.

### 9.2 Token contract

Split styling into:

- client/src/styles/tokens.css — theme-neutral semantic variables and scale.
- client/src/styles/base.css — reset, typography, focus, links, form defaults.
- client/src/styles/components.css — shared component classes only.
- client/src/styles/motion.css — transitions, completion motion, reduced-motion override.
- client/src/index.css — Tailwind import plus the four style imports.

Required tokens:

    --canvas
    --canvas-subtle
    --surface
    --surface-raised
    --surface-sunken
    --border
    --border-strong
    --text
    --text-soft
    --text-muted
    --accent
    --accent-hover
    --accent-soft
    --accent-contrast
    --focus
    --success
    --success-soft
    --warning
    --warning-soft
    --danger
    --danger-soft
    --trail-complete
    --trail-current
    --trail-future
    --shadow-color
    --radius-sm
    --radius-md
    --radius-lg
    --radius-xl
    --space-1 through --space-12
    --duration-fast
    --duration-standard
    --duration-celebration

Delete the current global overrides that reinterpret arbitrary Tailwind color classes when the new shell lands. All subsequent screens use semantic classes/components only.

### 9.3 Cozy theme catalog

Preserve all current IDs so saved preferences remain valid. The following anchor colors are implementation targets; derived soft/status colors must be contrast-tested.

| ID | Name | Mode | Canvas | Surface | Text | Accent |
|---|---|---|---|---|---|---|
| morning-mist | Morning Mist | Light | #F1F5F3 | #FFFEFA | #23312C | #3E7163 |
| quiet-linen | Quiet Linen | Light | #F6F0E6 | #FFFCF5 | #352F29 | #765D88 |
| sage-garden | Sage Garden | Light | #EDF4E9 | #FBFFF7 | #233426 | #4E7852 |
| blue-harbor | Blue Harbor | Light | #EBF3F5 | #FAFEFF | #20343A | #39727A |
| lavender-still | Lavender Still | Light | #F2EEF7 | #FCFAFF | #332D3F | #745F91 |
| warm-sand | Warm Sand | Light | #F7EEDD | #FFFBF2 | #3C3024 | #9B5E42 |
| rosewater | Rosewater | Light | #F8EEEE | #FFF9F8 | #402E33 | #96596A |
| sea-glass | Sea Glass | Light | #EAF4F0 | #FAFFFC | #1F3530 | #39786D |
| midnight-ink | Midnight Ink | Dark | #171D23 | #202830 | #EEF3F1 | #86B7A8 |
| deep-ocean | Deep Ocean | Dark | #122229 | #1B3038 | #ECF5F5 | #75BCC0 |
| forest-dusk | Forest Dusk | Dark | #18231D | #233128 | #EEF5EC | #91BE8E |
| plum-twilight | Plum Twilight | Dark | #211B27 | #302638 | #F5EFF7 | #C19BCB |
| graphite-calm | Graphite Calm | Dark | #1B2024 | #282E33 | #F1F3F4 | #9DB7C8 |
| night-lavender | Night Lavender | Dark | #1B1B29 | #29283A | #F2F0FA | #B0A5DC |
| moss-night | Moss Night | Dark | #20231B | #2D3126 | #F2F4EA | #AFBE83 |
| cocoa-evening | Cocoa Evening | Dark | #251E19 | #342921 | #FAF1EA | #C99776 |

Theme rules:

- Default remains morning-mist.
- Status meaning is consistent across themes.
- Accent is not reused as danger.
- Normal text meets 4.5:1 contrast.
- Large text and meaningful component boundaries meet 3:1.
- Focus ring meets 3:1 against adjacent colors.
- Selected controls use shape/border/text in addition to color.
- Shadows are decorative and never the only boundary.

### 9.4 Type and spacing

- Base size 16 px.
- Body line height 1.6.
- Learning content line length 60–72 characters.
- Display scale: 40/44, 32/38, 24/30, 20/26.
- UI scale: 16/24, 14/20, 12/16.
- Use 8 px as the primary spacing unit with 4 px fine adjustments.
- Minimum pointer target 44 × 44 px.
- Default section gap 32 px desktop and 24 px mobile.
- Do not use font weights above 750.

### 9.5 Motion

- Hover and press: 100–140 ms.
- Standard expand/collapse and progress: 180–240 ms.
- Major Chapter/Track completion: at most 600 ms.
- No infinite pulse on the current node.
- Respect prefers-reduced-motion by removing transforms, path drawing, confetti, and smooth scrolling.
- Focus changes must never depend on animation.

## 10. Component and file architecture

### 10.1 Server files

| File | Responsibility |
|---|---|
| server/db.js | Canonical columns plus the one-way migration 018 learning-data reset. |
| server/utils/outcome-manifest.js | Validate the single structured outcome contract and Track coverage. |
| server/utils/activity-schema.js | Validate, parse, cap, and sanitize activity documents. |
| server/utils/activity-runtime.js | Transactional block state and structured Session completion. |
| server/routes/activities.js | Generation, simple completion, objective submission, and written evaluation endpoints. |
| server/routes/lessons.js | Structured Session read, contextual tutor, and artifact submission only; legacy route families are removed. |
| server/utils/lesson-state-machine.js | Three-state Session transitions and guarded structured completion. |
| server/utils/curriculum-draft.js | Invoke outcome validation and selected-Build requirements. |
| server/routes/curriculum.js | Generate/persist structured outcomes for new Tracks. |
| server/utils/checkpoint-format.js | Parse versioned checkpoint envelopes, hide keys, and compute deterministic result rules. |
| server/routes/exams.js | Outcome-mapped checkpoint generation, deterministic threshold, and results. |
| server/utils/course-lineage.js | Structured summaries, one-child continuation, and root-only active limit. |
| server/routes/continuations.js | Single balanced continuation generation and validation. |
| server/routes/dashboard.js | Derived next action, weekly rhythm, Trail lineage, and normalized outcomes. |
| server/routes/data.js | Backup format 2 sanitization and import. |
| server/index.js | Mount activities routes without changing unrelated middleware. |

### 10.2 Client files

| File | Responsibility |
|---|---|
| client/src/App.jsx | Route SessionPage and shared shells; preserve route URLs. |
| client/src/api.js | Typed-by-convention activity, dashboard, and balanced continuation calls. |
| client/src/pages/SessionPage.jsx | Load a Session, generate missing activities, and own retry/recovery. |
| client/src/components/session/SessionPlayer.jsx | Orchestrate block order, local pending state, focus, and completion. |
| client/src/components/session/ActivityRenderer.jsx | Exhaustive type switch with a safe unknown-type error. |
| client/src/components/session/ReadBlock.jsx | Read block. |
| client/src/components/session/WorkedExampleBlock.jsx | Step reveal block. |
| client/src/components/session/ChoiceBlock.jsx | Choice selection, submit, feedback, and retry. |
| client/src/components/session/OrderingBlock.jsx | Pointer and keyboard ordering. |
| client/src/components/session/ShortAnswerBlock.jsx | Capped input and rubric feedback. |
| client/src/components/session/ReflectionBlock.jsx | Reflection capture without correctness language. |
| client/src/components/session/TutorSidecar.jsx | Contextual chat and responsive sheet. |
| client/src/components/session/SessionComplete.jsx | Outcome summary and next action. |
| client/src/components/layout/AppShell.jsx | Standard desktop/mobile navigation. |
| client/src/components/layout/FocusShell.jsx | Quiet task-focused header and progress. |
| client/src/components/trail/TodayCard.jsx | Derived next-action presentation. |
| client/src/components/trail/TrailMap.jsx | Linear Track/Chapter progress. |
| client/src/components/trail/ChapterCard.jsx | Chapter details, Session list, Build, and checkpoint. |
| client/src/components/trail/WeeklyRhythm.jsx | Seven-day derived activity view. |
| client/src/components/trail/FocusAreas.jsx | Bounded uncleared mistakes. |
| client/src/pages/Dashboard.jsx | Compose Today, Trail, and support rail; no domain calculations. |
| client/src/components/ExamPanel.jsx | Chapter-checkpoint language, outcome feedback, and accessibility. |
| client/src/pages/ContinuationFlow.jsx | Completion summary, automatic balanced generation, preview, tweak, confirm. |
| client/src/pages/OnboardingFlow.jsx | Four-step framing and updated generation copy. |
| client/src/pages/CurriculumConfirmation.jsx | Track preview with outcome and Build summaries. |
| client/src/pages/ReviewQueue.jsx | New shell and retrieval-practice copy. |
| client/src/components/ReviewSession.jsx | New focus shell and feedback language. |
| client/src/pages/SettingsPage.jsx | Five settings sections and privacy explanation. |
| client/src/theme/themes.js | Preserve IDs; supply revised semantic token catalog. |
| client/src/theme/ThemeProvider.jsx | Apply the expanded token contract. |
| client/src/styles/*.css | Tokens, base, components, and motion layers. |
| client/src/index.css | Imports only after migration cleanup. |

Do not put all activity components inside SessionPlayer. Do not put dashboard derivation logic in React. Do not duplicate server validators in UI beyond lightweight user feedback.

## 11. Error, offline, and edge-state behavior

| Situation | User experience | Persistence rule |
|---|---|---|
| Activity provider unavailable | Inline calm error with Retry and Back to Trail. | No activity document and no progress start. |
| Malformed activity output | Explain that the Session could not be prepared; Retry. | No write. |
| Connection lost during generation | Preserve page and retry affordance. | Only a fully validated document can exist. |
| Connection lost during answer submission | Preserve local response and show Retry. | Server idempotency prevents duplicate completion. |
| Stale second tab submits an earlier block | Return latest state and explain that progress changed elsewhere. | Do not regress completed state. |
| Stored activity JSON is corrupt | Typed recovery error; do not silently fall back. | No mutation until explicit regeneration tooling exists. |
| Provider changes after generation | Existing Session uses frozen content. | Generator metadata remains historical. |
| Tutor fails | Activity remains fully usable. | Preserve tutor draft; no progress effect. |
| Written evaluator fails | Retryable feedback error. | No attempt increment and no state write. |
| Artifact evaluator fails | Existing retry behavior. | No artifact or completion write. |
| No reviews due | Calm confirmation and Continue Trail. | No synthetic item. |
| Completed Track; generation deferred | Completion page remains accessible. | No child Track. |
| localStorage unavailable | Theme works for session and says it is not saved. | Learning data unaffected. |

## 12. Testing strategy

### 12.1 Test layers

Pure validator tests:

- Outcome manifests.
- Activity documents.
- Public sanitization.
- Coverage ratios.
- Derived next action.
- Root Trail counting.

Database/state tests:

- Migration.
- Block ordering and idempotency.
- No stale overwrite.
- Structured completion.
- Strict three-state Session behavior.
- SRS and streak exactly once.

Route tests:

- Generation cache and failure atomicity.
- Private-key stripping.
- Objective and written submission.
- Artifact structured branch.
- Checkpoint outcome coverage.
- Balanced continuation and confirmation.
- Dashboard aggregates.
- Export/import.

Component tests:

- Every block type.
- Session resume and focus.
- Tutor sheet.
- Dashboard priority.
- Trail expansion.
- Checkpoint results.
- Continuation preview.
- Theme persistence.

Manual responsive and accessibility pass:

- 1440 × 900.
- 1024 × 768.
- 768 × 1024.
- 390 × 844.
- Keyboard only.
- 200 percent browser zoom.
- Reduced motion.
- High contrast and forced colors.
- Long titles, long translated-like copy, empty states, and every error state.

### 12.2 Required final commands

    npx vitest run --config ./server/vitest.config.js server
    cd client && npx vitest run --config ./vitest.config.js
    npm run build
    npm test

Expected: all commands exit 0. npm test intentionally repeats the suites and is the final package-level proof.

## 13. Rollout and migration

### Phase A: capability release

- Ship the announced one-way reset, schema, validators, runtime, and routes together on the overhaul branch.
- Reject pre-version-2 backups.
- Verify provider settings survive and all learning tables start clean.

### Phase B: structured Session release

- Route every Session into SessionPlayer.
- Delete the old chat-chunk, quiz, remediation, skip, and test-out components and routes.
- Observe local logs for typed activity-generation failures; never log learner answers or provider credentials.

### Phase C: mastery and continuation release

- Switch Chapter checkpoint copy and thresholds.
- Switch continuation to one balanced next Track.
- Delete the continuation-options endpoint and client.

### Phase D: full visual release

- Ship AppShell, new dashboard, focus flows, and all 16 themes.
- Remove the old CSS color bridge in the same change; do not carry a dual visual system.

### Phase E: cleanup

- Confirm no old client imports, endpoints, state-machine methods, or CSS compatibility rules remain.
- Keep dormant database columns/tables only when removing them would add risk without product value.

Rollback requires restoring a pre-cutover database snapshot together with pre-cutover code. There is no mixed-version or down-migration path.

## Chunk 1: Mastery contracts and persistence

### Task 1: Add the one-way cutover and backup format 2

**Files:**

- Modify: server/db.js
- Modify: server/routes/data.js
- Modify: server/__tests__/db.test.js
- Modify: server/__tests__/data-export-import.test.js

- [ ] **Step 1: Write failing migration tests.** Cover fresh canonical columns; migration-017 cutover deleting topics and streaks; cascades removing dependent learning rows; llm_settings preservation; repeated initialization; default empty activity_state; and Track deletion cascades after the cutover.
- [ ] **Step 2: Run the focused test.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/db.test.js

  Expected: FAIL because the two columns do not exist.
- [ ] **Step 3: Update canonical CREATE TABLE definitions and add migration 018 exactly as specified in section 5.1.** The migration adds missing columns, deletes topics and streaks, proves cascades, preserves llm_settings, and inserts its migration record in one transaction.
- [ ] **Step 4: Add failing backup-format-2 tests.** Assert the version marker; excluded activity answer keys; omitted pending checkpoints; sanitized completed checkpoints; reset representation for incomplete Sessions; preserved completed progress/artifacts/outcomes; rejection of versions 1, missing, and unknown; and all-or-nothing import on rejection.
- [ ] **Step 5: Implement explicit export projections and import normalization.** Do not rely on SELECT * or PRAGMA-derived export fields for private generated content. Never export credentials, activity answer keys, or pending checkpoint keys.
- [ ] **Step 6: Re-run both files.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/db.test.js server/__tests__/data-export-import.test.js

  Expected: PASS.
- [ ] **Step 7: Commit only these files.**

      git add server/db.js server/routes/data.js server/__tests__/db.test.js server/__tests__/data-export-import.test.js
      git commit -m "feat: persist structured session activities"

### Task 2: Implement the structured outcome contract

**Files:**

- Create: server/utils/outcome-manifest.js
- Create: server/__tests__/outcome-manifest.test.js
- Modify: server/utils/curriculum-draft.js
- Modify: server/routes/curriculum.js
- Modify: server/routes/lessons.js
- Modify: server/routes/reviews.js
- Modify: server/routes/exams.js
- Modify: server/routes/dashboard.js
- Modify: server/utils/course-lineage.js
- Modify: server/__tests__/curriculum-draft.test.js
- Modify: server/__tests__/curriculum.test.js
- Modify: server/__tests__/lessons.test.js
- Modify: server/__tests__/srs.test.js
- Modify: server/__tests__/exams.test.js
- Modify: server/__tests__/course-lineage.test.js
- Modify: server/__tests__/dashboard.test.js
- Modify: client/src/pages/CurriculumConfirmation.jsx
- Modify: client/src/__tests__/CurriculumFlow.test.jsx

- [ ] **Step 1: Write validator tests for every rule in section 5.2.** Include missing fields, duplicate IDs, lesson-to-Chapter mismatch, knowledge/skill absence, evidence mismatch, repeated lineage outcomes, initial-versus-continuation options, 80/20 boundaries, small-Track rounding, and exact structured error objects.
- [ ] **Step 2: Run the new test.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/outcome-manifest.test.js

  Expected: FAIL because the module does not exist.
- [ ] **Step 3: Implement pure normalization and validation.** Functions must not touch the database or call the LLM. Return structured errors with path, code, and message so route errors can identify the bad field.
- [ ] **Step 4: Implement strict object-only curriculum validation.** Replace requireTasks-for-every-lesson with exactly one or two required Builds per Chapter and no task_spec on Sessions that do not require a Build.
- [ ] **Step 5: Add outcomeTitles to outcome-manifest.js and update every active server consumer listed above.** Prompts use titles explicitly; lineage summaries preserve full structured IDs/titles/kinds/roles; dashboard responses expose objects. No code may rely on implicit object stringification.
- [ ] **Step 6: Update CurriculumConfirmation to render outcome.title and add object fixtures.** This keeps the branch runnable as soon as generation switches.
- [ ] **Step 7: Update curriculum prompt contracts.** Require stable IDs, kinds, roles, evidence arrays, Chapter coverage, and selected Build Sessions.
- [ ] **Step 8: Run focused server and client tests.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/outcome-manifest.test.js server/__tests__/curriculum-draft.test.js server/__tests__/curriculum.test.js server/__tests__/lessons.test.js server/__tests__/srs.test.js server/__tests__/exams.test.js server/__tests__/course-lineage.test.js server/__tests__/dashboard.test.js
      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/CurriculumFlow.test.jsx)

  Expected: PASS.
- [ ] **Step 9: Commit.**

      git add server/utils/outcome-manifest.js server/utils/curriculum-draft.js server/utils/course-lineage.js server/routes/curriculum.js server/routes/lessons.js server/routes/reviews.js server/routes/exams.js server/routes/dashboard.js server/__tests__/outcome-manifest.test.js server/__tests__/curriculum-draft.test.js server/__tests__/curriculum.test.js server/__tests__/lessons.test.js server/__tests__/srs.test.js server/__tests__/exams.test.js server/__tests__/course-lineage.test.js server/__tests__/dashboard.test.js client/src/pages/CurriculumConfirmation.jsx client/src/__tests__/CurriculumFlow.test.jsx
      git commit -m "feat: define mastery outcome contracts"

### Task 3: Define and sanitize activity documents

**Files:**

- Create: server/utils/activity-schema.js
- Create: server/__tests__/activity-schema.test.js

- [ ] **Step 1: Create one complete private fixture and exact public fixture, then write failing cases for every common field, all six type-specific schemas, all three answer-key schemas, every numeric cap, exact key parity, duplicate IDs, unsupported fields/types, unsafe content, invalid timing, and missing outcome coverage from section 5.3.**
- [ ] **Step 2: Write sanitizer and helper tests.** Deep-search the public fixture and assert no answerKey, correctOptionId, correctOrder, exemplar, criteria, or generator metadata survives. Test getBlock for found/missing IDs and isObjectiveBlock for all six types.
- [ ] **Step 3: Run the test.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activity-schema.test.js

  Expected: FAIL because the module does not exist.
- [ ] **Step 4: Implement parseActivityDocument and validateActivityDocument with strict allowlists and the exact return shape { valid, value } or { valid: false, code, path, error }.** Reject unknown top-level, block, item, step, option, criterion, and answer-key fields.
- [ ] **Step 5: Implement sanitizeActivityDocument, getBlock, and isObjectiveBlock.** The sanitizer builds a new public object rather than deleting keys from a private copy.
- [ ] **Step 6: Enforce the 128 KiB document cap and every collection/string/nesting cap before expensive traversal.**
- [ ] **Step 7: Re-run and commit.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activity-schema.test.js
      git add server/utils/activity-schema.js server/__tests__/activity-schema.test.js
      git commit -m "feat: validate structured activity documents"

## Chunk 2: Structured learning runtime

### Task 4: Build the transactional activity runtime

**Files:**

- Create: server/utils/activity-runtime.js
- Create: server/__tests__/activity-runtime.test.js
- Modify: server/utils/lesson-state-machine.js
- Modify: server/__tests__/lesson-state-machine.test.js
- Modify: server/utils/streak-tracker.js
- Modify: server/__tests__/streak.test.js

- [ ] **Step 1: Write failing runtime tests.** Cover first start, prerequisite denial, required ordering, informational completion, runtime-owned objective scoring, wrong retry, response caps, unknown IDs, locked future blocks, optional-block non-gating, canonical identical idempotency, different-response final conflict, stale conflict with latest state, strict stored-state corruption rejection, artifact gate, and completion eligibility.
- [ ] **Step 2: Add transaction tests.** Prove the final required block atomically commits passed, completed_at, SRS, streak, mistake update, and topic timestamp exactly once; inject a failure at each write and assert complete rollback. Add valid leap-day, invalid calendar date, and timezone-independent localDate cases to streak-tracker tests.
- [ ] **Step 3: Run focused tests.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activity-runtime.test.js server/__tests__/lesson-state-machine.test.js

  Expected: FAIL on missing runtime and practicing-to-passed behavior.
- [ ] **Step 4: Implement strict activity-state parsing and transactional single-block merges.** Parse state inside the transaction, validate it against the frozen document, score objective responses from the private answerKey, modify only the requested block, and return typed conflicts with latest sanitized state.
- [ ] **Step 5: Replace the lesson state machine with not_started, practicing, and passed, then implement completeActivitySessionIfEligible with completionContext.** No caller can submit a correct boolean or call a generic practicing-to-passed transition.
- [ ] **Step 6: Make final completion one atomic boundary and strengthen real-calendar localDate validation.** Reuse scheduleSrs and streak logic inside that boundary and guard every side effect against duplicates.
- [ ] **Step 7: Re-run and commit.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activity-runtime.test.js server/__tests__/lesson-state-machine.test.js server/__tests__/srs.test.js server/__tests__/streak.test.js
      git add server/utils/activity-runtime.js server/utils/lesson-state-machine.js server/utils/streak-tracker.js server/__tests__/activity-runtime.test.js server/__tests__/lesson-state-machine.test.js server/__tests__/streak.test.js
      git commit -m "feat: add deterministic activity runtime"

### Task 5: Add idempotent activity generation

**Files:**

- Create: server/routes/activities.js
- Create: server/__tests__/activities.test.js
- Modify: server/index.js

- [ ] **Step 1: Write route tests.** Cover not found, cross-topic lesson, locked prerequisite, cached response, generated response, private stripping, invalid output, oversized output, provider error, conditional-write race independent of the in-process map, one disconnected waiter, all waiters disconnected, and no database mutation on every failure. Assert one stored document and one progress row under races.
- [ ] **Step 2: Run the route test.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activities.test.js

  Expected: FAIL because the route is not mounted.
- [ ] **Step 3: Implement a bounded prompt builder and collector inside activities.js.** Include only the context listed in section 6.2, stop collecting above 128 KiB, put the activity JSON contract and pedagogy rules in the system message, and require plain JSON. Do not change the shared LLM client.
- [ ] **Step 4: Implement a reference-counted in-flight entry per lesson.** Each waiter detaches on disconnect; one disconnected waiter does not cancel shared work; when no waiters remain, abort before persistence; always delete the map entry in finally. The database conditional write remains the correctness boundary.
- [ ] **Step 5: Validate completely, then cache the document and initialize progress in one SQLite transaction.** Add generator metadata on the server rather than trusting provider fields. A start failure cannot leave a cached document without matching initial state.
- [ ] **Step 6: Mount the router under /api without disturbing body-size middleware.**
- [ ] **Step 7: Re-run and commit.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activities.test.js server/__tests__/llm-client.test.js
      git add server/routes/activities.js server/index.js server/__tests__/activities.test.js
      git commit -m "feat: generate and cache session activities"

### Task 6: Add activity completion and submission routes

**Files:**

- Modify: server/routes/activities.js
- Modify: server/__tests__/activities.test.js

- [ ] **Step 1: Add failing endpoint tests for complete and submit.** Exercise all types, ordering, invalid payloads, runtime-owned objective feedback, written rubric pass/fail, evaluator failure atomicity, canonical duplicate submit, final-block different-response conflict, stale conflict body, real local-date validation, transactional mistake creation, and response sanitization.
- [ ] **Step 2: Run the focused test.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activities.test.js

  Expected: FAIL because completion and submission handlers are not implemented.
- [ ] **Step 3: Expose runtime-owned informational completion and objective scoring through thin handlers.** Routes validate HTTP shape but never accept or compute a caller-controlled correct value.
- [ ] **Step 4: Implement bounded written evaluation.** Send one response, the public prompt, relevant outcomes, and rubric criteria. Require criterion IDs to match exactly before recording.
- [ ] **Step 5: Record the stable outcome/criterion mistake inside the same runtime transaction as the failed attempt.** A canonical retry returns the prior result and does not call logMistake again.
- [ ] **Step 6: Return current public state after every accepted mutation.** ACTIVITY_STATE_CONFLICT and BLOCK_ALREADY_FINAL responses include code and latestState; 400/404/422/502 errors never include private keys.
- [ ] **Step 7: Re-run and commit.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/activities.test.js server/__tests__/mistakes-log.test.js
      git add server/routes/activities.js server/__tests__/activities.test.js
      git commit -m "feat: score and persist session activities"

### Task 7: Cut lessons over to the single structured runtime

**Files:**

- Modify: server/routes/lessons.js
- Modify: server/routes/curriculum.js
- Modify: server/utils/lesson-state-machine.js
- Modify: server/__tests__/lessons.test.js
- Modify: server/__tests__/artifacts.test.js
- Modify: server/__tests__/curriculum.test.js
- Delete: server/utils/mixed-quiz.js
- Delete: server/utils/adaptive-difficulty.js
- Delete: server/__tests__/mixed-quiz.test.js
- Delete: server/__tests__/adaptive-difficulty.test.js
- Delete: server/__tests__/integration-mistakes-adaptive.test.js
- Delete: server/__tests__/quiz.test.js
- Delete: server/__tests__/remediation.test.js

- [ ] **Step 1: Add failing read tests.** GET returns a sanitized structured document/state or null document for an untouched Session; malformed stored JSON returns ACTIVITY_DOCUMENT_INVALID; no response exposes keys.
- [ ] **Step 2: Add complete tutor-context tests.** Verify relevant outcomes, public current block, current feedback, guiding-question instructions, 2,000-character cap, message persistence, foreign block rejection, answer-key exclusion, and zero learning-state mutation on successful or failed chat.
- [ ] **Step 3: Add artifact tests.** Gate on required blocks only; optional blocks do not gate; failed evaluation writes nothing; failed rubric remains practicing; pass calls the structured runtime; repeated pass is idempotent; final artifact completion performs all side effects exactly once.
- [ ] **Step 4: Run the new tests.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/lessons.test.js server/__tests__/artifacts.test.js server/__tests__/curriculum.test.js

  Expected: FAIL on structured-only read/artifact behavior and still-present legacy routes.
- [ ] **Step 5: Reduce lessons.js to GET Session, contextual tutor chat, and artifact GET/POST.** Delete chat-chunk continuation, per-Session quiz, retest, remediation, skip, and test-out handlers. Delete the duplicate curriculum test-out routes.
- [ ] **Step 6: Remove obsolete state-machine methods, adaptive-difficulty and mixed-quiz utilities, imports, and tests.** Keep unused historical database columns/tables dormant; do not add compatibility endpoints.
- [ ] **Step 7: Route artifact approval through the same atomic structured completion boundary as activity completion.**
- [ ] **Step 8: Run the full backend suite.**

      npx vitest run --config ./server/vitest.config.js server

  Expected: PASS.
- [ ] **Step 9: Commit.**

      git add server/routes/lessons.js server/routes/curriculum.js server/utils/lesson-state-machine.js server/utils/mixed-quiz.js server/utils/adaptive-difficulty.js server/__tests__/lessons.test.js server/__tests__/artifacts.test.js server/__tests__/curriculum.test.js server/__tests__/mixed-quiz.test.js server/__tests__/adaptive-difficulty.test.js server/__tests__/integration-mistakes-adaptive.test.js server/__tests__/quiz.test.js server/__tests__/remediation.test.js
      git commit -m "refactor: cut lessons over to structured sessions"

## Chunk 3: Session experience and checkpoint mastery

### Task 8: Add client API functions and Session routing

**Files:**

- Modify: client/src/api.js
- Create: client/src/pages/SessionPage.jsx
- Modify: client/src/App.jsx
- Modify: client/src/pages/CurriculumConfirmation.jsx
- Create: client/src/__tests__/activity-api.test.js
- Create: client/src/__tests__/SessionPage.test.jsx
- Modify: client/src/__tests__/App.test.jsx
- Modify: client/src/__tests__/CurriculumFlow.test.jsx
- Delete: client/src/components/LessonChat.jsx
- Delete: client/src/components/QuizPanel.jsx
- Delete: client/src/components/RemediationPanel.jsx
- Delete: client/src/__tests__/LessonChat.test.jsx
- Delete: client/src/__tests__/QuizPanel.test.jsx
- Delete: client/src/__tests__/RemediationPanel.test.jsx

- [ ] **Step 1: Write activity-api tests, then add ensureActivities, completeActivityBlock, submitActivityBlock, and the activityBlockId chat argument.** Cover JSON and non-JSON errors, code/retryable/latestState preservation, network failure, cached 200, generated 201, completion, and submission.
- [ ] **Step 2: Write SessionPage tests for initial loading, untouched generation, cached document, in-progress resume, completed Session summary, locked prerequisite, provider error with Retry and Back to Trail, connection-loss response preservation, and ACTIVITY_DOCUMENT_INVALID recovery.** Assert it never calls generation when a valid document already exists.
- [ ] **Step 3: Add cutover tests proving App routes SessionPage and curriculum preview has no test-out action.**
- [ ] **Step 4: Run the client tests.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/activity-api.test.js src/__tests__/SessionPage.test.jsx src/__tests__/App.test.jsx src/__tests__/CurriculumFlow.test.jsx)

  Expected: FAIL because the new API and SessionPage do not exist and legacy components still own the route.
- [ ] **Step 5: Implement SessionPage as the single Session route.** It owns one initial read, generation only when document is null, retry/recovery, and stable props for SessionPlayer.
- [ ] **Step 6: Remove old per-Session quiz, remediation, defer, test-out, and continue API functions; remove curriculum test-out UI; delete the three legacy components and tests.** Keep the chat API for TutorSidecar and artifact API for Builds.
- [ ] **Step 7: Re-run tests.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/activity-api.test.js src/__tests__/SessionPage.test.jsx src/__tests__/App.test.jsx src/__tests__/CurriculumFlow.test.jsx)

  Expected: PASS.
- [ ] **Step 8: Commit.**

      git add client/src/api.js client/src/App.jsx client/src/pages/SessionPage.jsx client/src/pages/CurriculumConfirmation.jsx client/src/components/LessonChat.jsx client/src/components/QuizPanel.jsx client/src/components/RemediationPanel.jsx client/src/__tests__/activity-api.test.js client/src/__tests__/SessionPage.test.jsx client/src/__tests__/App.test.jsx client/src/__tests__/CurriculumFlow.test.jsx client/src/__tests__/LessonChat.test.jsx client/src/__tests__/QuizPanel.test.jsx client/src/__tests__/RemediationPanel.test.jsx
      git commit -m "feat: add the structured session page"

### Task 9: Implement shared Session activity components

**Files:**

- Create: client/src/components/session/ActivityRenderer.jsx
- Create: client/src/components/session/ReadBlock.jsx
- Create: client/src/components/session/WorkedExampleBlock.jsx
- Create: client/src/components/session/ChoiceBlock.jsx
- Create: client/src/components/session/OrderingBlock.jsx
- Create: client/src/components/session/ShortAnswerBlock.jsx
- Create: client/src/components/session/ReflectionBlock.jsx
- Create: client/src/__tests__/ActivityBlocks.test.jsx

- [ ] **Step 1: Write behavior-first tests for every block.** Assert safe Markdown goes through MarkdownContent; worked-example steps reveal only in stored order before completion; choice uses a labeled radio group; ordering supports keyboard Move up/Move down without drag; short answer shows expected responseHint, live character count, min/max enforcement, and retry; reflection never uses correct/incorrect language; failed requests preserve input; feedback does not jump the page; unknown types are recoverable and cannot complete.
- [ ] **Step 2: Run the focused test.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/ActivityBlocks.test.jsx)

  Expected: FAIL because the components do not exist.
- [ ] **Step 3: Implement each block as a controlled component.** It receives block, persistedBlockState, busy, error, onComplete or onSubmit. It never calls fetch directly, and Markdown fields render through the existing MarkdownContent component.
- [ ] **Step 4: Make ActivityRenderer exhaustive.** Unknown type renders a recoverable error and never marks completion.
- [ ] **Step 5: Ensure feedback gets programmatic focus and uses aria-live polite.**
- [ ] **Step 6: Re-run and commit.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/ActivityBlocks.test.jsx)

  Expected: PASS.
- [ ] **Step 7: Commit.**

      git add client/src/components/session/ActivityRenderer.jsx client/src/components/session/ReadBlock.jsx client/src/components/session/WorkedExampleBlock.jsx client/src/components/session/ChoiceBlock.jsx client/src/components/session/OrderingBlock.jsx client/src/components/session/ShortAnswerBlock.jsx client/src/components/session/ReflectionBlock.jsx client/src/__tests__/ActivityBlocks.test.jsx
      git commit -m "feat: add interactive session blocks"

### Task 10: Build SessionPlayer and contextual tutor

**Files:**

- Create: client/src/components/session/SessionPlayer.jsx
- Create: client/src/components/session/TutorSidecar.jsx
- Create: client/src/components/session/SessionComplete.jsx
- Create: client/src/__tests__/SessionPlayer.test.jsx
- Create: client/src/__tests__/TutorSidecar.test.jsx
- Modify: client/src/pages/SessionPage.jsx
- Modify: client/src/components/ArtifactPanel.jsx
- Modify: client/src/__tests__/ArtifactPanel.test.jsx

- [ ] **Step 1: Write orchestration and responsive-layout tests.** Cover one active block, read-only earlier blocks, locked future step markers, textual progress, persisted resume, desktop main/sidecar regions, mobile sticky action safe-area class, mutation success, lost-network input preservation, exactly one active request, reduced-motion completion, intentional feedback focus, and ACTIVITY_STATE_CONFLICT explanation plus state restoration.
- [ ] **Step 2: Write complete tutor behavior tests.** Assert Ask your guide title; sticky desktop aside; closed-by-default mobile dialog; editable hint/example/why chips; 2,000-character cap; current block ID; successful and failed draft preservation; Retry; sessionStorage-only collapse preference; Escape close; trigger focus restoration; and mobile-sheet draft survival.
- [ ] **Step 3: Add ArtifactPanel handoff tests.** Introduce an onPassed callback fired only after a newly passing result. Assert fail, evaluator error, cancel/back, and existing passed display do not falsely fire it; SessionPlayer refetches the Session after onPassed before showing completion.
- [ ] **Step 4: Run focused tests.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/SessionPlayer.test.jsx src/__tests__/TutorSidecar.test.jsx src/__tests__/ArtifactPanel.test.jsx src/__tests__/SessionPage.test.jsx)

  Expected: FAIL because the orchestrator, tutor, and callback do not exist.
- [ ] **Step 5: Implement SessionPlayer with one mutation boundary and the layout/behavior contract from section 8.3.** Block components report intent; SessionPlayer calls the API, trusts only returned state, explains typed conflicts, and moves focus intentionally.
- [ ] **Step 6: Implement TutorSidecar and its accessible mobile dialog without automatic opening.**
- [ ] **Step 7: Add the backward-independent ArtifactPanel onPassed callback and refetch after pass.** Reuse the existing Build form and evaluator; do not duplicate them.
- [ ] **Step 8: Add SessionComplete with outcomes practiced, learner takeaway, review timing, and next dashboard action.**
- [ ] **Step 9: Re-run tests.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/SessionPlayer.test.jsx src/__tests__/TutorSidecar.test.jsx src/__tests__/ArtifactPanel.test.jsx src/__tests__/SessionPage.test.jsx)

  Expected: PASS.
- [ ] **Step 10: Commit.**

      git add client/src/components/session/SessionPlayer.jsx client/src/components/session/TutorSidecar.jsx client/src/components/session/SessionComplete.jsx client/src/pages/SessionPage.jsx client/src/components/ArtifactPanel.jsx client/src/__tests__/SessionPlayer.test.jsx client/src/__tests__/TutorSidecar.test.jsx client/src/__tests__/ArtifactPanel.test.jsx
      git commit -m "feat: build the structured session experience"

### Task 11: Make Chapter checkpoints outcome-aware

**Files:**

- Create: server/utils/checkpoint-format.js
- Create: server/__tests__/checkpoint-format.test.js
- Modify: server/routes/exams.js
- Modify: server/__tests__/exams.test.js
- Create: client/src/components/checkpoint/CheckpointIntro.jsx
- Create: client/src/components/checkpoint/CheckpointQuestion.jsx
- Create: client/src/components/checkpoint/CheckpointResults.jsx
- Modify: client/src/components/ExamPanel.jsx
- Modify: client/src/__tests__/ExamPanel.test.jsx

- [ ] **Step 1: Add pure checkpoint-format and route tests.** Require object outcomes; validated coverage of every core outcome; exact private envelope schema; public serialization on start, GET, retake, and partial retest; local objective scoring; bounded written rubric input/output; evaluator-failure atomicity; per-outcome evidence; failed-outcome IDs; overall 80 and core 60 rules; partial retest; and final Track completion. Reject arrays and unknown schema versions.
- [ ] **Step 2: Add complete UI tests.** Assert intro outcomes/count/time/autosave/pass rule; locked Continue learning; desktop navigator and answered count; mobile one-question flow; answer preservation; incomplete summary and focus on first missing answer; core versus supporting gaps; targeted review before partial retest; secondary full retake; keyboard completion; pass celebration; and no celebration on failure.
- [ ] **Step 3: Run focused tests.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/checkpoint-format.test.js server/__tests__/exams.test.js
      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/ExamPanel.test.jsx)

  Expected: FAIL on the missing checkpoint contract and new UI components.
- [ ] **Step 4: Implement checkpoint-format.js and persist the single envelope from section 6.6 inside exam_attempts.questions.** Parse only the declared schema, validate outcome coverage and exact key sets, and use one public serializer on every response. Do not add schema columns.
- [ ] **Step 5: Score objective answers locally, send only written answers with bounded rubric context to the LLM, reject mismatched criterion IDs, and commit the evaluated attempt only after the complete result validates.** Aggregate per-outcome evidence, then apply overall 80 and every-core-outcome 60 rules in code.
- [ ] **Step 6: Extract introduction, question, and result presentation into the three checkpoint components, keeping ExamPanel as the API/state orchestrator.** Implement every behavior from Step 2 and use Chapter checkpoint language while leaving API paths internal.
- [ ] **Step 7: Re-run tests.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/checkpoint-format.test.js server/__tests__/exams.test.js
      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/ExamPanel.test.jsx)

  Expected: PASS.
- [ ] **Step 8: Commit.**

      git add server/utils/checkpoint-format.js server/routes/exams.js server/__tests__/checkpoint-format.test.js server/__tests__/exams.test.js client/src/components/checkpoint/CheckpointIntro.jsx client/src/components/checkpoint/CheckpointQuestion.jsx client/src/components/checkpoint/CheckpointResults.jsx client/src/components/ExamPanel.jsx client/src/__tests__/ExamPanel.test.jsx
      git commit -m "feat: align chapter checkpoints with outcomes"

## Chunk 4: Continuous Trails and dashboard

### Task 12: Generate one balanced next Track

**Files:**

- Modify: server/routes/continuations.js
- Modify: server/utils/course-lineage.js
- Modify: server/__tests__/continuations.test.js
- Modify: server/__tests__/course-lineage.test.js
- Modify: server/__tests__/dashboard.test.js

- [ ] **Step 1: Write lineage tests for root-only active counting, exactly one balanced child, linear ancestry, structured summary fields, repeated outcome rejection, and atomic creation.**
- [ ] **Step 2: Write route tests for eligible generation, no lane body, 80/20 validation, theory/skill coverage, duplicate history, transient generation, tweak, confirm, concurrency, provider failure, and no partial child.**
- [ ] **Step 3: Run focused tests and confirm failure.**
- [ ] **Step 4: Update summaries to accept object/string outcomes.** Store bounded IDs, titles, kinds, roles, strengths, gaps, and artifact feedback; never raw chats.
- [ ] **Step 5: Replace option-based prompt behavior with balanced progression and delete the continuation-options endpoint.**
- [ ] **Step 6: Call createLinkedCourse with lane balanced-next and enforce one child per completed parent.**
- [ ] **Step 7: Change both root creation and linked creation capacity checks to the exact root-only rule.**
- [ ] **Step 8: Re-run and commit.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/continuations.test.js server/__tests__/course-lineage.test.js server/__tests__/dashboard.test.js
      git add server/routes/continuations.js server/utils/course-lineage.js server/__tests__/continuations.test.js server/__tests__/course-lineage.test.js server/__tests__/dashboard.test.js
      git commit -m "feat: generate balanced continuation tracks"

### Task 13: Redesign the continuation experience

**Files:**

- Modify: client/src/api.js
- Modify: client/src/pages/ContinuationFlow.jsx
- Modify: client/src/__tests__/ContinuationFlow.test.jsx

- [ ] **Step 1: Replace option API expectations with completion summary, automatic generation, preview, tweak, defer, and confirm tests.**
- [ ] **Step 2: Test refresh/re-entry, generation failure, retry, confirm failure, preserved draft, and navigation after success.**
- [ ] **Step 3: Update client API bodies to omit lane and preserve level/time overrides.**
- [ ] **Step 4: Implement the screens in section 8.7.** Do not persist the draft in localStorage; it is transient and recoverable by regeneration.
- [ ] **Step 5: Remove LaneOption and all choice language.**
- [ ] **Step 6: Re-run and commit.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/ContinuationFlow.test.jsx)
      git add client/src/api.js client/src/pages/ContinuationFlow.jsx client/src/__tests__/ContinuationFlow.test.jsx
      git commit -m "feat: simplify continuous trail progression"

### Task 14: Derive dashboard next action and rhythm

**Files:**

- Create: server/utils/dashboard-summary.js
- Create: server/__tests__/dashboard-summary.test.js
- Modify: server/routes/dashboard.js
- Modify: server/__tests__/dashboard.test.js

- [ ] **Step 1: Write pure tests for the exact next-action priority in section 8.2.** Include no curriculum, Session resume, checkpoint in progress, overdue reviews, first unlocked Session, ready checkpoint, completed Track, and all-locked invalid data.
- [ ] **Step 2: Write seven-day rhythm tests across Sessions, checkpoints, and reviews, with local-date boundaries and no duplicate day inflation.**
- [ ] **Step 3: Run and confirm failure.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/dashboard-summary.test.js server/__tests__/dashboard.test.js

- [ ] **Step 4: Implement pure derivation in dashboard-summary.js.** Route code fetches bounded rows and passes them in; it does not bury priority rules in SQL.
- [ ] **Step 5: Add nextAction, weeklyRhythm, normalized outcomes, Build markers, and lineage summaries to the dashboard response.** Preserve every existing response field.
- [ ] **Step 6: Re-run and commit.**

      npx vitest run --config ./server/vitest.config.js server/__tests__/dashboard-summary.test.js server/__tests__/dashboard.test.js
      git add server/utils/dashboard-summary.js server/routes/dashboard.js server/__tests__/dashboard-summary.test.js server/__tests__/dashboard.test.js
      git commit -m "feat: derive focused dashboard guidance"

### Task 15: Build the Mastery Trail dashboard

**Files:**

- Create: client/src/components/trail/TodayCard.jsx
- Create: client/src/components/trail/TrailMap.jsx
- Create: client/src/components/trail/ChapterCard.jsx
- Create: client/src/components/trail/WeeklyRhythm.jsx
- Create: client/src/components/trail/FocusAreas.jsx
- Modify: client/src/pages/Dashboard.jsx
- Delete: client/src/components/CompetenceGraph.jsx
- Create: client/src/__tests__/TrailMap.test.jsx
- Modify: client/src/__tests__/Dashboard.test.jsx
- Delete: client/src/__tests__/CompetenceGraph.test.jsx

- [ ] **Step 1: Add Today card tests for each server-provided action kind.** React must render, not recalculate, priority.
- [ ] **Step 2: Add Trail map tests for current expansion, completed collapse, locks, Build markers, checkpoint state, and linear lineage.**
- [ ] **Step 3: Add Dashboard tests for desktop information order, mobile DOM order, empty state, errors, topic switching, deletion protection, and completed Track continuation.**
- [ ] **Step 4: Run focused tests and confirm failure.**
- [ ] **Step 5: Implement the new components with semantic elements.** Use ordered lists for Trail sequence and buttons for expandable Chapter headers.
- [ ] **Step 6: Remove CompetenceGraph from Dashboard, verify rg finds no remaining import, then delete CompetenceGraph.jsx and its dedicated test.** TrailMap is the single dashboard visualization after this task.
- [ ] **Step 7: Re-run and commit.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/Dashboard.test.jsx src/__tests__/TrailMap.test.jsx)
      git add client/src/components/trail client/src/pages/Dashboard.jsx client/src/components/CompetenceGraph.jsx client/src/__tests__/Dashboard.test.jsx client/src/__tests__/TrailMap.test.jsx client/src/__tests__/CompetenceGraph.test.jsx
      git commit -m "feat: replace dashboard graph with a mastery trail"

## Chunk 5: Product shell, themes, and all remaining flows

### Task 16: Establish the new shell and semantic visual foundation

**Files:**

- Create: client/src/components/layout/AppShell.jsx
- Create: client/src/components/layout/FocusShell.jsx
- Create: client/src/styles/tokens.css
- Create: client/src/styles/base.css
- Create: client/src/styles/components.css
- Create: client/src/styles/motion.css
- Modify: client/src/index.css
- Modify: client/src/App.jsx
- Modify: client/src/components/AppHeader.jsx
- Create: client/src/__tests__/AppShell.test.jsx
- Modify: client/src/__tests__/AppHeader.test.jsx

- [ ] **Step 1: Write shell tests for desktop nav, mobile nav, current route, due count, focus header, safe return, and accessible menu.**
- [ ] **Step 2: Add CSS contract tests or a small static test that asserts every required token and reduced-motion override exists.**
- [ ] **Step 3: Implement styles in the four responsibility-specific files.**
- [ ] **Step 4: Build AppShell and FocusShell without route-specific data fetching.**
- [ ] **Step 5: Adapt or retire AppHeader after all existing imports move.**
- [ ] **Step 6: Delete the old Tailwind color bridge after AppShell and FocusShell adopt semantic styles.** Do not carry two visual systems into later tasks.
- [ ] **Step 7: Re-run and commit.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/AppShell.test.jsx src/__tests__/AppHeader.test.jsx src/__tests__/App.test.jsx)
      git add client/src/components/layout client/src/styles client/src/index.css client/src/App.jsx client/src/components/AppHeader.jsx client/src/__tests__/AppShell.test.jsx client/src/__tests__/AppHeader.test.jsx
      git commit -m "feat: establish the mastery trail shell"

### Task 17: Remaster all 16 cozy themes

**Files:**

- Modify: client/src/theme/themes.js
- Modify: client/src/theme/ThemeProvider.jsx
- Modify: client/src/components/ThemePicker.jsx
- Modify: client/src/__tests__/theme-presets.test.js
- Modify: client/src/__tests__/ThemeProvider.test.jsx
- Modify: client/src/__tests__/ThemePicker.test.jsx

- [ ] **Step 1: Expand catalog tests to require every token in section 9.2 and preserve all 16 IDs.**
- [ ] **Step 2: Add automated WCAG contrast calculations for text, accent contrast, borders, focus, and status pairs.**
- [ ] **Step 3: Update the palette anchors from section 9.3 and derive explicit tokens.** Do not rely on browser color-mix for critical contrast.
- [ ] **Step 4: Update ThemeProvider mapping and native color-scheme.** Invalid saved IDs still fall back to morning-mist; storage failures remain session-only.
- [ ] **Step 5: Redesign picker previews using canvas, surface, accent, text, and status swatches.** Keep name, mode, and selected text.
- [ ] **Step 6: Re-run and commit.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/theme-presets.test.js src/__tests__/ThemeProvider.test.jsx src/__tests__/ThemePicker.test.jsx)
      git add client/src/theme client/src/components/ThemePicker.jsx client/src/__tests__/theme-presets.test.js client/src/__tests__/ThemeProvider.test.jsx client/src/__tests__/ThemePicker.test.jsx
      git commit -m "feat: remaster cozy learning themes"

### Task 18: Redesign onboarding and Track preview

**Files:**

- Modify: client/src/pages/OnboardingFlow.jsx
- Modify: client/src/pages/CurriculumConfirmation.jsx
- Modify: client/src/setupQuestions.js only if labels need new product vocabulary
- Modify: client/src/__tests__/CurriculumFlow.test.jsx
- Modify: client/src/__tests__/setupQuestions.test.js
- Modify: client/src/__tests__/recovery-api.test.js

- [ ] **Step 1: Add tests for the four steps, placement skip/take, selected states, profile persistence, generation recovery, error retry, Track preview, outcome summaries, Build markers, and confirmation.**
- [ ] **Step 2: Implement the flow in section 8.8 without changing route URLs or recovery contracts.**
- [ ] **Step 3: Replace roadmap, course, module, and lesson copy with Trail, Track, Chapter, and Session where user-facing.**
- [ ] **Step 4: Ensure raw database vocabulary never leaks in error messages.**
- [ ] **Step 5: Re-run and commit.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/CurriculumFlow.test.jsx src/__tests__/setupQuestions.test.js src/__tests__/recovery-api.test.js)
      git add client/src/pages/OnboardingFlow.jsx client/src/pages/CurriculumConfirmation.jsx client/src/setupQuestions.js client/src/__tests__/CurriculumFlow.test.jsx client/src/__tests__/setupQuestions.test.js client/src/__tests__/recovery-api.test.js
      git commit -m "feat: redesign mastery trail onboarding"

### Task 19: Refresh reviews, Builds, settings, and system states

**Files:**

- Modify: client/src/pages/ReviewQueue.jsx
- Modify: client/src/components/ReviewSession.jsx
- Modify: client/src/components/ArtifactPanel.jsx
- Modify: client/src/pages/SettingsPage.jsx
- Modify: client/src/components/Skeleton.jsx
- Modify: client/src/components/OfflineIndicator.jsx
- Modify: client/src/components/ErrorBoundary.jsx
- Modify: client/src/__tests__/ReviewQueue.test.jsx
- Modify: client/src/__tests__/ReviewSession.test.jsx
- Modify: client/src/__tests__/ArtifactPanel.test.jsx
- Modify: client/src/__tests__/SettingsPage.test.jsx
- Modify: client/src/__tests__/SettingsPageExportImport.test.jsx
- Modify: client/src/__tests__/Skeleton.test.jsx
- Modify: client/src/__tests__/OfflineIndicator.test.jsx
- Modify: client/src/__tests__/ErrorBoundary.test.jsx

- [ ] **Step 1: Add or update tests for every behavior in sections 8.6, 8.9, 8.10, and 11.**
- [ ] **Step 2: Migrate each screen to AppShell or FocusShell and semantic tokens.**
- [ ] **Step 3: Preserve all current API behavior, file limits, import confirmation, provider setup, and recovery actions.**
- [ ] **Step 4: Make skeletons match their final screen geometry and disable shimmer under reduced motion.**
- [ ] **Step 5: Re-run the affected client tests.**

      (cd client && npx vitest run --config ./vitest.config.js src/__tests__/ReviewQueue.test.jsx src/__tests__/ReviewSession.test.jsx src/__tests__/ArtifactPanel.test.jsx src/__tests__/SettingsPage.test.jsx src/__tests__/SettingsPageExportImport.test.jsx src/__tests__/Skeleton.test.jsx src/__tests__/OfflineIndicator.test.jsx src/__tests__/ErrorBoundary.test.jsx)

  Expected: PASS.
- [ ] **Step 6: Commit.**

      git add client/src/pages/ReviewQueue.jsx client/src/components/ReviewSession.jsx client/src/components/ArtifactPanel.jsx client/src/pages/SettingsPage.jsx client/src/components/Skeleton.jsx client/src/components/OfflineIndicator.jsx client/src/components/ErrorBoundary.jsx client/src/__tests__/ReviewQueue.test.jsx client/src/__tests__/ReviewSession.test.jsx client/src/__tests__/ArtifactPanel.test.jsx client/src/__tests__/SettingsPage.test.jsx client/src/__tests__/SettingsPageExportImport.test.jsx client/src/__tests__/Skeleton.test.jsx client/src/__tests__/OfflineIndicator.test.jsx client/src/__tests__/ErrorBoundary.test.jsx
      git commit -m "feat: unify supporting mastery flows"

### Task 20: Complete semantic cleanup and regression QA

**Files:**

- Modify: client/src/index.css
- Modify: any remaining client component containing hard-coded theme colors
- Modify: README.md
- Modify: this plan only to check completed tasks during execution

- [ ] **Step 1: Find remaining hard-coded presentation colors.**

      rg -n "bg-(white|gray|indigo|green|red|amber|yellow|orange)|text-(gray|indigo|green|red|amber|yellow|orange)|border-(gray|indigo|green|red|amber|yellow|orange)" client/src --glob "*.jsx"

  Expected before cleanup: matches identify the remaining migration list.
- [ ] **Step 2: Replace every theme-dependent match with semantic components or classes.** Keep intentional code-syntax colors only when they also work in all themes.
- [ ] **Step 3: Assert the deleted Tailwind color override block has not been reintroduced.**
- [ ] **Step 4: Re-run the search.** Expected: no theme-dependent utility matches.
- [ ] **Step 5: Run all server tests.**

      npx vitest run --config ./server/vitest.config.js server

  Expected: PASS.
- [ ] **Step 6: Run all client tests.**

      (cd client && npx vitest run --config ./vitest.config.js)

  Expected: PASS.
- [ ] **Step 7: Build production assets.**

      npm run build

  Expected: exit 0 with no new warnings.
- [ ] **Step 8: Run package-level verification.**

      npm test

  Expected: exit 0.
- [ ] **Step 9: Complete the manual matrix from section 12.1.** Record failures as new tests before fixing them.
- [ ] **Step 10: Verify dirty-worktree isolation.**

      git status --short
      git diff --stat

  Expected: only intentional overhaul files remain.
- [ ] **Step 11: Update README product vocabulary, architecture summary, run instructions, and screenshots only after the UI is final.**
- [ ] **Step 12: Commit cleanup and documentation.**

      git add client/src README.md
      git commit -m "chore: complete mastery trail migration"

## 14. Final release checklist

- [ ] Every Session uses the structured runtime.
- [ ] New Sessions have no mandatory per-Session quiz.
- [ ] Every objective answer is scored without an LLM.
- [ ] No private answer key reaches the browser.
- [ ] Checkpoint pass is 80 percent plus critical-outcome floor.
- [ ] Required Builds gate only their owning Session.
- [ ] SRS scheduling and streak recording happen once.
- [ ] Track completion still depends on completed Chapters.
- [ ] Next Track generation presents one balanced plan.
- [ ] Active root Trail limit remains three.
- [ ] Every newly created Trail is linear with at most one next Track per parent.
- [ ] Export/import preserves structured activities.
- [ ] Dashboard makes the next action unmistakable.
- [ ] Session activity remains visually primary over tutor chat.
- [ ] Mobile has no horizontal page scroll at 390 px.
- [ ] Keyboard operation works for ordering and every assessment.
- [ ] Focus is visible in every theme.
- [ ] All 16 theme IDs still restore.
- [ ] Reduced motion is complete.
- [ ] Empty, loading, error, offline, stale-tab, and retry states are designed.
- [ ] No user-facing roadmap/course/module/lesson terminology remains.
- [ ] Full test suite and production build pass.

## 15. Explicitly deferred work

Do not add these during this implementation:

- Accounts, cloud sync, teams, cohorts, leaderboards, public profiles, or social challenges.
- A normalized skill graph or evidence ledger.
- Push notifications or email.
- Currency, shop, inventory, or random rewards.
- Authoring tools for humans.
- User-created activity blocks.
- Voice tutoring.
- Native mobile applications.
- Provider-specific activity formats.
- Multi-model grading ensembles.
- A new analytics warehouse.

Revisit a normalized mastery graph only when the product needs cross-Track prerequisite reasoning, credential-grade evidence, multi-user reporting, or concept-level adaptivity that cannot be expressed by the outcome manifests in this plan.
