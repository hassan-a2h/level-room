# Durable Roadmap Generation and Text-Only Placement Plan

**Goal:** Make roadmap generation survive failures, reloads, and slow providers; replace easy placement multiple-choice questions with rigorous free-response evaluation.

**Architecture:** Roadmap generation becomes a persisted background job with live status events and recovery polling. Placement remains synchronous but generates six scenario-based free-response prompts and derives scores from validated per-question evaluations.

**Tech:** Express, SQLite, React, SSE, Vitest.

## Key changes

- Add a `curriculum_generation_jobs` migration and service.
  - One active job per topic; states: `queued`, `running`, `retrying`, `completed`, `failed`.
  - Persist attempt count, renewable lease, bounded deadline, non-secret provider/model snapshot, sanitized error code/message, and timestamps.
  - Migrate any currently `generating` topics into resumable queued jobs on startup.
  - Resume stranded jobs after a server restart; atomically claim jobs so duplicate clicks or stale workers cannot overwrite a newer result.

- Replace the long-held generation POST response with a fast `202` job response.
  - `POST /curriculum/generate` and `/regenerate` enqueue or return the existing active job.
  - Add a status/event endpoint that immediately sends the current state, emits changes, and sends heartbeat comments.
  - Extend recovery payloads with generation ID, state, attempt, max attempts, retry timing, and terminal error.
  - The client subscribes to live events; if disconnected, it polls recovery until a terminal state. Reloading resumes observation, never cancels the job.
  - Update the generation copy to say it can take a few minutes and show useful states such as “Generating”, “Retrying (2 of 3)”, “Validating”, and “Saved”.

- Harden provider execution in a dedicated job runner.
  - Retry every explicitly retryable provider or draft failure—including malformed/empty JSON, incomplete streams, timeout, rate limiting, and temporary provider unavailability.
  - Use three total attempts with short jittered backoff; do not retry authentication, configuration, cancellation, or validation failures that are deterministically invalid.
  - Apply an intentional per-attempt deadline and a bounded overall job deadline; renew the lease only while work is progressing.
  - Keep the current task-backed 3–5 module course contract. Persist a curriculum only after the complete response passes strict validation.
  - Log job ID, topic ID, provider/model, attempt, duration, state transition, and error code—never prompt content, responses, API keys, or OAuth credentials.

- Make placement assessment creation text-only.
  - Generate exactly six `objective` prompts: five target-level practical scenarios and one stretch scenario.
  - Remove multiple-choice options and answer keys from all newly generated assessments; require prompts to elicit a decision, reasoning, trade-off, example, or diagnostic process.
  - Keep rendering/submission support for already-pending historical multiple-choice assessments so an in-progress learner is not blocked.
  - Keep free-response length limits, but score weak or terse answers by evidence rather than imposing an artificial word-count gate.

- Make placement scoring evidence-based.
  - Require the evaluator to return one score and concise feedback for every persisted question ID.
  - Validate exact ID coverage, score bounds, and response shape; derive target score from the five target responses and stretch score from the stretch response server-side.
  - Preserve existing level thresholds and the rule that stretch performance cannot compensate for inadequate target-level competence.
  - Update the placement UI to use six textareas with clear “explain your reasoning” guidance and concise per-question feedback in the result.

## Test plan

- Test job creation, duplicate-start idempotency, retry success, retry exhaustion, non-retryable failure, validated draft persistence, stale-worker protection, restart recovery, and no persistence after invalid output.
- Test status-event initial snapshot, heartbeats, terminal events, lost-event recovery polling, reload/resume behavior, and duplicate click handling.
- Test lease renewal and deadlines through injected clock/scheduler controls and emitted state conditions—no arbitrary test sleeps.
- Test text-only placement schema enforcement, five-target/one-stretch calibration, rubric-based per-question aggregation, malformed evaluator output, and preservation of historical pending multiple-choice assessments.
- Update frontend tests for all-text placement, generation statuses, automatic recovery, and manual retry only after a terminal failure.
- Rebuild `better-sqlite3` against the active Node version before running backend tests; the current binary targets a different Node ABI.

## Assumptions

- The existing course size and task detail remain intact; reliability, not reducing curriculum quality, is the priority.
- Three total automatic attempts balance recovery with quota protection.
- Background jobs are process-local workers backed by SQLite durability; no external queue service is introduced.
- Provider settings may change between attempts, but secrets and OAuth credentials are never persisted in job records.
