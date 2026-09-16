# Codex Subscription OAuth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local Codex subscription OAuth as an optional LLM provider, with model/reasoning controls, while preserving existing providers and guaranteeing that provider changes never rewrite saved course data or switch an in-flight operation.

**Architecture:** Keep the current Vercel AI adapters for OpenAI API-key, Anthropic API-key, and Fireworks. Use `@earendil-works/pi-ai` in-process for its Codex model catalog, OAuth lifecycle, refresh, and Responses streaming; register `openaiCodexProvider()` with `models.setProvider()` and adapt it behind the current LLM client contract. Persist its OAuth credential through an app-owned, cross-process-locked file store. Each learning action captures provider/model/effort/credential-generation once and passes that immutable snapshot through all LLM calls, including lazy stream iteration.

**Tech Stack:** Node ESM, Express, SQLite migrations, `@earendil-works/pi-ai` (pin a verified release; current inspected release is `0.85.1`, requiring Node `>=22.19`), `proper-lockfile`, Vercel AI SDK v4, React, Vitest, Supertest, React Testing Library.

---

## File map

| File | Responsibility |
|---|---|
| `server/llm/provider-catalog.js` | Canonical provider IDs, API-key model allowlists, Codex model metadata and supported effort lists. |
| `server/llm/codex-credential-store.js` | Pi `CredentialStore` adapter; app-data path, permissions, atomic writes, cross-process lock, flow epoch and credential generation. |
| `server/llm/codex-auth.js` | One `createModels()` runtime, OAuth `models.login()` flow orchestration, status/cancel, loopback peer plus local Origin/Host request guard, and async context for flow/generation pinning. |
| `server/llm/codex-adapter.js` | Map existing messages/options to Pi `Context`, map Pi stream/text completions back to the existing client result shape, and normalize Codex errors. |
| `server/utils/llm-config.js` | Resolve selected settings, provider-aware readiness, and immutable per-operation snapshots. |
| `server/llm/client.js` | Dispatch only `openai-codex` to the Pi adapter; keep existing Vercel paths unchanged. |
| `server/db.js` | Forward-only migration adding a provider-neutral reasoning-effort setting. |
| `server/routes/settings.js` | Provider catalog/readiness, settings validation/save, and thin OAuth endpoints. |
| `server/routes/{curriculum,lessons,exams,reviews}.js` | Capture one LLM config per user-triggered operation and pass it to helpers. |
| `server/routes/data.js` | Keep settings export/import compatible while excluding/rejecting credential-shaped data. |
| `client/src/components/CodexConnection.jsx` | Accessible connection flow, device/browser fallback prompts, status and disconnect. |
| `client/src/pages/SettingsPage.jsx` | Provider/model/effort selection and Codex connection section, preserving existing theme/data settings. |
| `client/src/api.js` | Typed fetch helpers for provider catalog, saved settings, and OAuth-flow actions/status. |
| `client/src/pages/OnboardingFlow.jsx` | Gate on provider-neutral readiness, retaining old response compatibility. |
| `server/__tests__/codex-credential-store.test.js` | Credential file, permissions, locking, epoch/generation and cross-process tests. |
| `server/__tests__/codex-auth.test.js` | OAuth interaction/flow, origin, cancellation, and secret-redaction tests. |
| `server/__tests__/codex-adapter.test.js` | Pi Context mapping, model/effort validation, stream and completion normalization. |
| `server/__tests__/provider-switch-course-invariance.test.js` | End-to-end course-data and in-flight-provider invariant. |
| `client/src/__tests__/CodexConnection.test.jsx` | Connection states and safe OAuth UI behavior. |

If a UI or backend file becomes unwieldy while executing, keep these boundaries and split by responsibility rather than adding unrelated refactors.

## Chunk 1: Provider-neutral configuration and persistence

### Task 1: Add a backward-compatible reasoning-effort migration

**Files:**
- Modify: `server/db.js`
- Test: `server/__tests__/db.test.js`
- Test: `server/__tests__/data-export-import.test.js`

- [x] **Step 1: Write failing migration tests**

  Add a test that creates an existing `llm_settings` row for a non-reasoning API-key model, reconstructs the pre-migration `llm_settings` table without the new column, removes only the new migration marker, reruns `initSchema()`, and checks that provider/model survive and `reasoning_effort` is `'none'`. Also test a valid older backup row containing only `{ id, provider, model, created_at }` imports with the new default.

  The essential assertions are:

  ```js
  const row = dbModule.get('SELECT provider, model, reasoning_effort FROM llm_settings WHERE id = ?', id)
  expect(row).toEqual({ provider: 'openai', model: 'gpt-4o', reasoning_effort: 'none' })
  ```

- [x] **Step 2: Run tests and verify the migration tests fail**

  Run: `npx vitest run server/__tests__/db.test.js server/__tests__/data-export-import.test.js`

  Expected: FAIL because `reasoning_effort` does not exist and older rows have no default.

- [x] **Step 3: Add migration 011**

  Append migration `011_add_llm_reasoning_effort` in `server/db.js`. In one transaction run:

  ```sql
  ALTER TABLE llm_settings
  ADD COLUMN reasoning_effort TEXT NOT NULL DEFAULT 'none';
  ```

  Record the migration only after the column operation succeeds. Do not catch and ignore this migration error. Existing provider/model rows and migration ordering must remain unchanged.

- [x] **Step 4: Run database and backup tests**

  Run: `npx vitest run server/__tests__/db.test.js server/__tests__/data-export-import.test.js`

  Expected: PASS; the migration is idempotent and old backups use the schema default.

### Task 2: Create the canonical provider/model catalog and provider-aware readiness

**Files:**
- Create: `server/llm/provider-catalog.js`
- Modify: `server/utils/llm-config.js`
- Test: `server/__tests__/llm-config.test.js`
- Modify: `server/__tests__/settings.test.js`

- [x] **Step 1: Write failing catalog/config tests**

  Create an isolated temporary-DB test for these behaviors:

  ```js
  expect(resolveLlmConfig()).toMatchObject({ provider: 'fireworks', ready: false, apiKeySet: false })
  expect(resolveLlmConfig()).toMatchObject({ provider: 'openai', ready: true, apiKeySet: true })
  expect(resolveLlmConfig()).toMatchObject({ provider: 'openai-codex', ready: true, apiKeySet: false, authType: 'oauth' })
  expect(JSON.stringify(resolveLlmConfig())).not.toContain('access-token-fixture')
  ```

  Mock the Codex auth status boundary so tests need no OAuth account. Verify unsupported provider/model/effort combinations fail before a generation starts. Keep `apiKeySet` meaning “API key exists”; add `ready` and sanitized `authStatus` for every provider.

- [x] **Step 2: Run the focused test to verify it fails**

  Run: `npx vitest run server/__tests__/llm-config.test.js server/__tests__/settings.test.js`

  Expected: FAIL because the Codex provider, catalog, generic readiness, and reasoning metadata do not exist.

- [x] **Step 3: Implement provider catalog and resolution**

  Keep current API-key provider IDs and model allowlists intact. Those existing models have no reasoning-effort option in the current adapters, so expose `reasoningEfforts: []` and persist the neutral `'none'` sentinel for them; this keeps every pre-existing provider/model selection valid after migration. Add `openai-codex` as a distinct provider. Derive Codex models and supported reasoning choices from `openaiCodexProvider().getModels()`; expose only `{ id, name, reasoning, reasoningEfforts }`. Never return credentials or account identifiers. Resolve selected provider/model/effort from SQLite and calculate readiness with API-key environment status or the app-owned Codex credential store. `requireLlmConfig()` throws a stable typed missing-auth error when the active provider is not ready. Unsupported effort values must be rejected before dispatch; do not silently turn legacy `'none'` into a Codex effort.

- [x] **Step 4: Re-run settings/config tests**

  Run: `npx vitest run server/__tests__/llm-config.test.js server/__tests__/settings.test.js`

  Expected: PASS with existing API-key behavior unchanged.

## Chunk 2: Credential store and OAuth lifecycle

### Task 3: Implement a protected Pi credential store

**Files:**
- Create: `server/llm/codex-credential-store.js`
- Create: `server/__tests__/codex-credential-store.test.js`
- Create: `server/__tests__/fixtures/codex-credential-store-worker.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Add failing storage contract tests**

  Instantiate the store with an injected temporary directory. Test `read`, `list`, `modify`, `delete`, no secret exposure through `list`, missing/corrupt file behavior, restrictive modes, atomic update, flow epoch, credential generation, and refusal of stale generation/flow writes. Include a cross-process test: two Node workers call `modify()` at a coordinated IPC barrier and increment one record; assert no lost update and exactly one serialized result. Do not use arbitrary sleeps; coordinate workers with IPC messages.

- [x] **Step 2: Run the new store test and verify it fails**

  Run: `npx vitest run server/__tests__/codex-credential-store.test.js`

  Expected: FAIL because the store and worker implementation do not exist.

- [x] **Step 3: Add the Pi AI and lock dependencies**

  Run: `npm install --save-exact @earendil-works/pi-ai@0.85.1 proper-lockfile`

  Expected: `package.json` and `package-lock.json` add exact Pi AI version and lock dependency. Stop and report a package/network error rather than replacing the dependency with an unreviewed protocol implementation. Existing README requires Node 25.9+, which satisfies Pi AI’s inspected Node `>=22.19` engine.

- [x] **Step 4: Implement the file store**

  Use OS user application data, not the repo or SQLite: `%LOCALAPPDATA%/roadmap-learning/codex-auth.json` on Windows, `~/Library/Application Support/roadmap-learning/codex-auth.json` on macOS, and `${XDG_DATA_HOME:-~/.local/share}/roadmap-learning/codex-auth.json` on Linux. Set directory/file permissions to owner-only (POSIX 0700/0600; Windows current-user ACL inheritance). Use `proper-lockfile` with bounded retries/stale recovery and atomic temp-file + fsync + rename writes. Serialize `CredentialStore.modify()` and `delete()` across processes.

  Keep `{ credential, flowEpoch, credentialGeneration }` in the file. `read()` returns only a credential matching the current async request context generation. `modify()` re-reads the latest file under lock; if running under OAuth-login context, commit only when the flow epoch still matches; if running under request context, require the captured generation to match. A completed login increments credential generation; refresh keeps generation but persists rotated refresh tokens; disconnect increments generation and flow epoch before deletion so stale login/refresh work cannot recreate credentials. Fail closed on file/lock corruption and return sanitized typed errors.

- [x] **Step 5: Run store tests**

  Run: `npx vitest run server/__tests__/codex-credential-store.test.js`

  Expected: PASS, including two-process serialization and no secret values in metadata/list results.

### Task 4: Drive Pi OAuth through local Settings endpoints

**Files:**
- Create: `server/llm/codex-auth.js`
- Create: `server/__tests__/codex-auth.test.js`
- Modify: `server/index.js`

- [x] **Step 1: Write failing OAuth-flow tests**

  Inject a fake Pi `Models` object into the auth manager. Assert `models.login('openai-codex', 'oauth', interaction)` is used in-process; no child process is started. Test browser selection, device-code selection, `auth_url`/`device_code` notification capture, manual-code prompt with explicit switch-to-device action, completion, cancellation, expiry, failed re-auth preserving old credentials, local UI Origin/API Host rejection, concurrent-flow epoch ordering, disconnect invalidation, and sanitized status responses. Assert OAuth URLs/codes/tokens are never logged or included in errors.

- [x] **Step 2: Run the OAuth test and verify it fails**

  Run: `npx vitest run server/__tests__/codex-auth.test.js`

  Expected: FAIL because no flow manager exists.

- [x] **Step 3: Implement Pi runtime and OAuth interaction manager**

  Create one server-side `createModels({ credentials })` runtime and register the provider with `models.setProvider(openaiCodexProvider())`. Model the flow as an in-memory state machine keyed by random flow ID with a maximum active flow count of one; a new start cancels/supersedes the old flow and persists a higher flow epoch. Provide `prompt` and `notify` callbacks, use the requested browser/device mode, and expose only safe UI events. Set `PI_OAUTH_CALLBACK_HOST` only after resolving `localhost` to exactly one loopback IP; if DNS is ambiguous or any address is non-loopback, start directly in device-code mode. Pi's pinned public API does not reliably report local callback-listener bind failures, so do not promise automatic detection: keep the browser flow in its manual-code stage and offer an explicit “Use device code instead” action that cancels that flow and starts a device-code flow. Bound all flow waits, honor AbortSignals, close listeners on every exit, redact auth URLs/codes, and preserve an existing credential until a new login commits successfully.

  Add methods for `isConnected()`, `startLogin(mode)`, `getFlowStatus(flowId)`, `submitManualCode(flowId, code)`, `cancelFlow(flowId)`, `disconnect()`, and `captureCredentialGeneration()`. Make every mutation require a validated local/same-origin request. The module owns OAuth state; Express routes must only delegate.

- [x] **Step 4: Run OAuth and store tests together**

  Run: `npx vitest run server/__tests__/codex-auth.test.js server/__tests__/codex-credential-store.test.js`

  Expected: PASS without real ChatGPT authorization or external network calls.

## Chunk 3: Codex model adapter and request-pinned routing

### Task 5: Adapt Pi model execution to the existing LLM client contract

**Files:**
- Create: `server/llm/codex-adapter.js`
- Modify: `server/llm/client.js`
- Modify: `server/__tests__/llm-client.test.js`
- Create: `server/__tests__/codex-adapter.test.js`

- [x] **Step 1: Write failing adapter/client tests**

  Use a fake `Models` provider and fake Pi event stream. Verify text-only `Context` mapping (system prompt, user/assistant order, content, timestamps), exact model ID, model-supported reasoning effort, `transport: 'sse'`, and request signal. Verify stream deltas become strings in the existing `textStream` contract, only a non-empty completion with a final `stop` reason is accepted, incomplete/aborted/empty results cannot reach persistence routes, OAuth `invalid_grant` errors request reconnection, and all existing provider adapter calls remain unchanged. First-byte and idle timeouts must abort the underlying stream and become typed safe errors.

- [x] **Step 2: Run focused LLM tests and verify Codex assertions fail**

  Run: `npx vitest run server/__tests__/llm-client.test.js server/__tests__/codex-adapter.test.js`

  Expected: FAIL for Codex dispatch and adapter behavior; existing provider assertions continue to pass.

- [x] **Step 3: Implement the adapter and dispatch**

  Use `models.streamSimple()` and `models.completeSimple()` with no tools. Use Pi’s `openai-codex` catalog and metadata, map only text messages, set Codex Responses transport to SSE (avoid implicit WebSocket transport), pass the selected reasoning effort and `AbortSignal`, and apply an explicit first-byte/idle timeout. The stream adapter must retain one Pi stream consumption path; do not iterate the Pi stream twice. Bind the captured credential-generation context around stream creation and every lazy iterator `next()`/`return()` call, since the existing `streamToSSE()` consumes `textStream` after `streamText()` has returned. Test disconnect/account replacement after stream creation but before its first read; it must fail safely and never read the replacement account. Keep legacy provider creation and Vercel AI SDK options intact. Normalize auth, account, model-access, rate-limit, timeout, malformed-response, and upstream-unavailable errors without including raw response bodies, headers, OAuth URLs, or secrets.

- [x] **Step 4: Run LLM client tests**

  Run: `npx vitest run server/__tests__/llm-client.test.js server/__tests__/codex-adapter.test.js`

  Expected: PASS for Codex and all previous providers.

### Task 6: Pin each top-level LLM operation to one config snapshot

**Files:**
- Modify: `server/utils/llm-config.js`
- Modify: `server/routes/curriculum.js`
- Modify: `server/routes/lessons.js`
- Modify: `server/routes/exams.js`
- Modify: `server/routes/reviews.js`
- Modify: related route tests under `server/__tests__/`

- [x] **Step 1: Add regression tests for multi-call snapshot behavior**

  In curriculum route tests, mock the resolver with provider A, make a helper-triggered settings change to B between sequential generation calls, and assert every call for the original operation receives provider A/model/effort A. Assert the next route operation gets provider B. Add the same snapshot assertion to one lesson stream and one exam/review generation route. Also test that disconnected-provider preflight leaves lesson progress/chunk/messages, quiz/retest state, and exam attempts unchanged, and that upstream/invalid-output failures do not strand transitions or skip chunks. Test curriculum regeneration failure preserves the prior draft and dependent learning rows.

- [x] **Step 2: Run affected route tests and verify the new assertions fail**

  Run: `npx vitest run server/__tests__/curriculum.test.js server/__tests__/lessons.test.js server/__tests__/exams.test.js server/__tests__/reviews.test.js`

  Expected: FAIL where helpers re-resolve global settings or routes still guard on `apiKeySet`.

- [x] **Step 3: Update route config handling**

  Resolve/require config once in each handler before its first LLM action and before any associated persistent mutation. Pass that immutable snapshot into `generateSetupQuestions(config, ...)`, `generateCurriculum(config, ...)`, and every stream/generate call. Replace only readiness checks with provider-neutral `ready`; never mutate course records as part of resolving or changing provider settings. Include the captured credential-generation ID for Codex operations so refreshed/reconnected credentials cannot silently switch accounts during the same operation. For lesson chat/remediation, build candidate history in memory and persist messages/state only after a clean stream; for continue, do not advance `current_chunk` until success; for quiz/retest/exam generation, do not transition state or create attempts until output parses and passes shape validation. Commit each successful operation's related message/state/chunk/attempt writes in one SQLite transaction so a database error cannot leave half-applied state. On curriculum regeneration, keep the previous modules/lessons until the learner confirms a fully received and validated replacement through the existing transactional `persistCurriculum()` path. Preserve successful endpoint semantics and expected user-submitted answer persistence.

- [x] **Step 4: Run all affected route tests**

  Run: `npx vitest run server/__tests__/curriculum.test.js server/__tests__/lessons.test.js server/__tests__/exams.test.js server/__tests__/reviews.test.js`

  Expected: PASS, with no handler/helper re-resolving provider/model midway through one operation.

## Chunk 4: Settings API, UI, onboarding, and backups

### Task 7: Add settings and OAuth API endpoints

**Files:**
- Modify: `server/routes/settings.js`
- Modify: `server/index.js`
- Modify: `server/__tests__/settings.test.js`

- [x] **Step 1: Add failing settings API tests**

  Cover `GET /api/settings` returning provider catalog, active provider/model/reasoning effort, `apiKeySet`, generic `ready`, safe Codex auth status, and no credential fields. Cover valid/invalid Codex model-effort pairs, saving Codex while disconnected (allowed and `ready: false`), save when connected, existing API-key providers, legacy `apiKey` rejection, OAuth start/status/manual-code/device retry/cancel/disconnect, bad Origin/Host, oversized or malformed input, and no credential changes after rejected settings saves.

- [x] **Step 2: Run settings tests and verify them failing**

  Run: `npx vitest run server/__tests__/settings.test.js`

  Expected: FAIL because provider catalog and OAuth route handlers are missing.

- [x] **Step 3: Implement thin, validated endpoints**

  Add `GET /api/settings` catalog/status; `POST /api/settings` saves provider/model/reasoning in one SQLite transaction after strict provider/model/effort validation. Selecting Codex while disconnected is allowed and reported as `ready: false`; connection readiness must not prevent saving that preference. Retain `apiKeySet` with its old API-key-only meaning and preserve existing API-key provider save behavior. Add OAuth start/status/manual-code/device-retry/cancel/disconnect handlers delegating to `codex-auth.js`. Require an actual loopback socket peer, an exact allowlist of local UI `Origin` values (the dev UI is `http://localhost:3201`), and expected local API `Host` values for every flow endpoint; forged headers from LAN clients must fail. These are cross-origin dev requests, so do not call them same-origin. Impose small body limits, rate-limit starts/manual submissions, return generic sanitized errors, and never log request query/body values. Do not make `/validate` perform a paid model request; it only reports local readiness.

- [x] **Step 4: Run settings tests**

  Run: `npx vitest run server/__tests__/settings.test.js`

  Expected: PASS while all existing provider validations remain green.

### Task 8: Build the Codex settings and connection UI

**Files:**
- Create: `client/src/components/CodexConnection.jsx`
- Create: `client/src/__tests__/CodexConnection.test.jsx`
- Modify: `client/src/api.js`
- Modify: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/__tests__/SettingsPage.test.jsx`

- [x] **Step 1: Write failing UI/API tests**

  Test rendering a fourth provider option, provider-driven model choices, showing reasoning only when model metadata supports it, the `none` sentinel for API-key models, connected/disconnected states, browser URL link opening, device-code copy/open behavior, manual-code submit/cancel, switching from browser manual-code to device-code flow, OAuth error/retry, disconnect confirmation, save disabling while pending, and unchanged appearance/data-management sections. Test API helpers target local Settings endpoints and surface sanitized server errors.

- [x] **Step 2: Run the new and existing settings page tests**

  Run: `cd client && npx vitest run --config ./vitest.config.js src/__tests__/CodexConnection.test.jsx src/__tests__/SettingsPage.test.jsx`

  Expected: FAIL for new Codex UI/API cases; existing appearance, import/export and theme controls remain present.

- [x] **Step 3: Implement API helpers and connection component**

  Add `getProviderCatalog`, `saveSettings({ provider, model, reasoningEffort })`, `startCodexLogin`, `getCodexLoginStatus`, `submitCodexManualCode`, `cancelCodexLogin`, `startCodexDeviceLogin`, and `disconnectCodex`. Put the OAuth state UI in `CodexConnection.jsx`; keep ephemeral auth URL, device code, and pasted manual code in component memory only. Open auth URLs with `noopener,noreferrer`, poll status only while a flow is active, stop polling and cancel on explicit user action/unmount, and never persist credentials or one-time codes in local/session storage. Drive options from server metadata, not a second hard-coded catalog. Preserve the existing Neumorphic classes, focus handling, import/export behavior, and theme picker.

- [x] **Step 4: Run frontend settings tests**

  Run: `cd client && npx vitest run --config ./vitest.config.js src/__tests__/CodexConnection.test.jsx src/__tests__/SettingsPage.test.jsx src/__tests__/SettingsPageExportImport.test.jsx`

  Expected: PASS; all previous settings and data-management interactions remain intact.

### Task 9: Gate onboarding on generic provider readiness

**Files:**
- Modify: `client/src/pages/OnboardingFlow.jsx`
- Modify: `client/src/__tests__/CurriculumFlow.test.jsx`

- [x] **Step 1: Add a failing onboarding readiness test**

  Assert `ready: true, apiKeySet: false` lets a connected Codex selection proceed; `ready: false` blocks generation; older API responses without `ready` still fall back to `apiKeySet`.

- [x] **Step 2: Run the focused frontend test**

  Run: `cd client && npx vitest run --config ./vitest.config.js src/__tests__/CurriculumFlow.test.jsx`

  Expected: FAIL because onboarding currently gates only on `apiKeySet`.

- [x] **Step 3: Update readiness handling**

  Use `settings.ready ?? settings.apiKeySet` and preserve current navigation/error states. Do not require an API key when Codex OAuth is connected.

- [x] **Step 4: Re-run onboarding test**

  Run: `cd client && npx vitest run --config ./vitest.config.js src/__tests__/CurriculumFlow.test.jsx`

  Expected: PASS for both modern and legacy settings responses.

### Task 10: Keep roadmap backup free of OAuth credentials

**Files:**
- Modify: `server/routes/data.js`
- Modify: `server/__tests__/data-export-import.test.js`

- [x] **Step 1: Add failing backup tests**

  Assert export includes selected provider/model/reasoning effort but no access/refresh token, account ID, auth URL, device code, or credential-store metadata. Assert import of token-shaped keys in `llm_settings` is rejected without changing any table; import of an old valid backup without reasoning effort still succeeds with `'none'`; unknown columns are rejected before SQL construction.

- [x] **Step 2: Run export/import tests and verify failures**

  Run: `npx vitest run server/__tests__/data-export-import.test.js`

  Expected: FAIL for credential-shaped input and new reasoning field assertions.

- [x] **Step 3: Harden settings-row import validation**

  Keep the existing top-level table allowlist. For each imported row, derive allowed columns from `PRAGMA table_info(<fixed allowlisted table>)`, reject unknown column names, and reject token/OAuth credential-shaped fields in `llm_settings` (continue discarding the legacy `api_key` field for old backup compatibility). Keep import transactional so any rejected row leaves all course/settings tables untouched. OAuth file data never participates in export/import.

- [x] **Step 4: Run export/import tests**

  Run: `npx vitest run server/__tests__/data-export-import.test.js`

  Expected: PASS for safe exports, old backups, and malicious/credential-shaped input rejection.

## Chunk 5: Course-switch proof, documentation, and full verification

### Task 11: Prove switching providers cannot alter a running course

**Files:**
- Create: `server/__tests__/provider-switch-course-invariance.test.js`
- Modify: `server/__tests__/curriculum.test.js`
- Modify: `server/__tests__/lessons.test.js`

- [x] **Step 1: Write a failing route-level invariance test**

  Seed topics, modules, lessons, progress, messages, SRS reviews, artifacts, quiz attempts, exam attempts, and mistakes; snapshot every learning table. Start a mocked lesson stream on provider A and block its text iterator on a promise gate. While blocked, save provider B through settings, then release the stream. Assert the first request used A's exact provider/model/effort/generation; the next request uses B; the stream's expected assistant message is the only intended history addition; topic/module/lesson IDs and ordering, progress, attempts, reviews, artifacts, and mistakes are unchanged. Repeat with the first stream failing and with provider change between two separate lesson chunks.

- [x] **Step 2: Run the route-level test and verify it fails**

  Run: `npx vitest run server/__tests__/provider-switch-course-invariance.test.js`

  Expected: FAIL if a handler/helper re-reads global settings during an operation or if provider settings mutate course tables.

- [x] **Step 3: Fix only snapshot/course-invariance defects**

  Ensure all route helpers consume the passed snapshot and no settings save calls course/progress mutations. Do not add provider/model fields to course tables or messages. No automatic regeneration, cancellation, or fallback is allowed when the active provider changes.

- [x] **Step 4: Re-run all provider-switch and route tests**

  Run: `npx vitest run server/__tests__/provider-switch-course-invariance.test.js server/__tests__/curriculum.test.js server/__tests__/lessons.test.js server/__tests__/exams.test.js server/__tests__/reviews.test.js`

  Expected: PASS for in-flight and subsequent operation behavior.

### Task 12: Document setup, limits, and fallback

**Files:**
- Modify: `README.md`

- [x] **Step 1: Add documentation assertions or focused text checks**

  Review README setup/provider sections and ensure stale instructions do not claim that API keys are entered in Settings or stored in SQLite. Record a manual checklist for Codex connect/disconnect and provider switching.

- [x] **Step 2: Update documentation**

  Document Codex local OAuth from Settings, supported models/reasoning levels, browser/device flow, local credential file location/permissions, disconnect semantics (local deletion, no remote revocation claim), no Codex/Pi CLI execution, private/unstable backend limitation, ChatGPT subscription quota vs separate API billing, and stable API-key alternatives. Explain provider switch behavior: saved course/progress/history stays; only future model-generated text may differ.

- [x] **Step 3: Check documentation and diff formatting**

  Run: `git diff --check`

  Expected: no whitespace errors. Do not commit while `.git` is read-only.

### Task 13: Full regression and release-readiness verification

**Files:**
- No new production files; verify the changed files above.

- [x] **Step 1: Run the complete backend suite**

  Run: `npm run test:backend`

  Expected: PASS, including existing API provider, route, migration, export/import, OAuth, and invariance suites.

- [x] **Step 2: Run the complete frontend suite**

  Run: `npm run test:frontend`

  Expected: PASS, including theme picker/design, settings, onboarding, and Codex flow tests.

- [x] **Step 3: Build the frontend**

  Run: `npm run build`

  Expected: Vite production build succeeds; server-only Pi/OAuth modules do not leak into the browser bundle.

- [x] **Step 4: Inspect final diff and repository status**

  Run: `git diff --check` and `git status --short`

  Expected: only Codex feature files plus the already-present UI work are modified; no credential file, database, `.env`, generated OAuth URL, or token artifact is present in the repo. Preserve all existing user changes.

## Completion criteria

- OpenAI API-key, Anthropic API-key, and Fireworks flows remain green and unchanged in configuration behavior.
- Codex OAuth runs through in-process Pi AI APIs and works without any Codex/Pi CLI executable.
- The user can choose a supported Codex model and reasoning effort; unsupported pairs fail before generation.
- OAuth data is app-local, owner-protected, atomically stored, lock-serialized, absent from DB backups and HTTP status, and safe across login/refresh/disconnect/account-switch races.
- Every LLM operation uses one provider/model/effort snapshot; later calls may use a newly selected provider.
- Provider switching alone leaves course IDs, lesson/module ordering, progress, chat history, attempts, reviews, artifacts, and mistake records unchanged.
- Backend tests, frontend tests, production build, and final diff checks pass.
