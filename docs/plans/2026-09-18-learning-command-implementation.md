# Learning Command Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe global `learning start|status|stop` command for the local roadmap-learning app.

**Architecture:** A repo-owned Bash command owns lifecycle state, a separate supervisor remains the process-group leader while `npm run dev` runs, and an installer writes a wrapper to `~/.local/bin/learning`. Runtime metadata is owner-protected and validated by PID, PGID, start ticks, command line, and repository path before any signal is sent.

**Tech Stack:** Bash, Linux process utilities (`setsid`, `flock`, `ps`, `ss`, `curl`), Node’s built-in test runner, existing npm/Vite/Express scripts.

---

## File map

- Create `scripts/learning`: command parsing, runtime metadata, locking, health probes, lifecycle state, safe signaling.
- Create `scripts/learning-supervisor`: process-group leader that starts `npm run dev` and cleans up its child on termination.
- Create `scripts/install-learning`: generates the absolute-path wrapper in `~/.local/bin/learning`.
- Create `scripts/learning-command.test.js`: deterministic command-level tests using temporary runtime directories and fixture processes.
- Modify `README.md`: document installation and the three commands near development startup instructions.

## Chunk 1: Test contract and command scaffolding

### Task 1: Add the failing command tests

**Files:**
- Create: `scripts/learning-command.test.js`

- [ ] **Step 1: Write the test list:** usage and missing dependency/exit 2, stopped status/exit 0, already-stopped stop/exit 0, malformed metadata safety, stale metadata cleanup, healthy process status, duplicate start/exit 0, port conflicts/exit 3, degraded/crashed/orphaned/unmanaged states/exit 1, installer wrapper generation, and stop behavior.
- [ ] **Step 2: Define `LEARNING_RUNTIME_DIR` as a test seam only; tests set it to an owner-only temporary directory while production defaults remain exactly `${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/learning-roadmap-learning-$UID`.
- [ ] **Step 3: Add tests for usage and stopped status using the temporary runtime directory, asserting exact state labels and exit codes.
- [ ] **Step 4: Add malformed and stale metadata fixtures with live unrelated `sleep` processes; assert start/status/stop never signal them and stale metadata is removed safely.
- [ ] **Step 5: Run `node --test scripts/learning-command.test.js` and verify it fails because `scripts/learning` does not exist.

### Task 2: Implement the minimal command foundation

**Files:**
- Create: `scripts/learning`

- [ ] **Step 1: Add strict shell setup, command parsing, repository resolution, usage output, and exit-code handling.
- [ ] **Step 2: Add runtime-directory creation/realpath/owner/mode/symlink checks, mode-600 metadata/log paths, and the test override seam. The test list must cover a runtime symlink, wrong owner where permitted by the fixture, group/other permissions, and failed realpath validation.
- [ ] **Step 3: Add `flock` acquisition and atomic `process.meta` helpers with exact PID, PGID, start-ticks, repository, and start-time fields.
- [ ] **Step 4: Run `node --test scripts/learning-command.test.js` and verify usage/stopped/malformed-metadata tests pass.

## Chunk 2: Lifecycle implementation

### Task 3: Add the supervisor process boundary

**Files:**
- Create: `scripts/learning-supervisor`
- Modify: `scripts/learning`
- Modify: `scripts/learning-command.test.js`

- [ ] **Step 1: Add tests for metadata identity validation and duplicate starts.
- [ ] **Step 2: Run `node --test --test-name-pattern='identity|duplicate' scripts/learning-command.test.js` and verify those tests fail for missing supervisor behavior.
- [ ] **Step 3: Implement the supervisor trap/child lifecycle and safe `setsid` launch.
- [ ] **Step 4: Implement PID/PGID/start-tick/command-line validation, create `app.log` with mode 600, and redirect all supervisor output to it.
- [ ] **Step 5: Run `node --test --test-name-pattern='identity|duplicate' scripts/learning-command.test.js` and verify identity and duplicate-start tests pass.

### Task 4: Implement start and status

**Files:**
- Modify: `scripts/learning`
- Modify: `scripts/learning-command.test.js`

- [ ] **Step 1: Add tests for listener conflicts, all status states, precedence, bounded probes, malformed/stale start recovery, partial startup, missing dependencies/exit 2, and unhealthy occupied ports/exit 3.
- [ ] **Step 2: Run `node --test --test-name-pattern='status|probe|conflict|dependency|stale' scripts/learning-command.test.js` and verify those tests fail for missing start/status behavior.
- [ ] **Step 3: Implement dependency preflight, fixed-port conflict detection, and shared probes with no redirects, 2-second per-request timeout, backend HTTP 200 plus JSON `status: ok`, and frontend HTTP 2xx/3xx handling.
- [ ] **Step 4: Implement start polling every 250ms with a 30-second condition deadline, degraded cleanup, mode-600 `app.log`, and log-path reporting.
- [ ] **Step 5: Implement status states: stopped, starting, running, degraded, crashed, stale, orphaned, unmanaged, and conflict.
- [ ] **Step 6: Run `node --test --test-name-pattern='status|probe|conflict|dependency|stale' scripts/learning-command.test.js` and verify all start/status tests pass.

### Task 5: Add safe stop behavior

**Files:**
- Modify: `scripts/learning`
- Modify: `scripts/learning-command.test.js`

- [ ] **Step 1: Add tests for graceful stop, forced stop, already-stopped stop, PID reuse protection, and orphaned-supervisor refusal.
- [ ] **Step 2: Run `node --test --test-name-pattern='stop|orphan|PID' scripts/learning-command.test.js` and verify they fail for missing stop behavior.
- [ ] **Step 3: Implement TERM polling every 250ms for 10 seconds, revalidated KILL fallback with a 2-second deadline, metadata cleanup, and orphan safety.
- [ ] **Step 4: Run `node --test --test-name-pattern='stop|orphan|PID' scripts/learning-command.test.js` and verify all stop tests pass.

## Chunk 3: Global installation and documentation

### Task 6: Add installer and README usage

**Files:**
- Create: `scripts/install-learning`
- Modify: `README.md`
- Modify: `scripts/learning-command.test.js`

- [ ] **Step 1: Add a test that installs into temporary `HOME` and `PATH` directories, including a repository path containing spaces, and verifies the generated wrapper can execute from `/tmp` and reports a moved checkout.
- [ ] **Step 2: Run `node --test --test-name-pattern='installer|wrapper' scripts/learning-command.test.js` and verify it fails because the installer does not exist.
- [ ] **Step 3: Implement creation of `~/.local/bin`, atomic wrapper generation, shell quoting, executable permissions, stale-checkout messaging, and PATH guidance.
- [ ] **Step 4: Document `./scripts/install-learning` and `learning start|status|stop` without changing existing npm startup instructions.
- [ ] **Step 5: Run shell syntax checks and the full focused test file.

## Final verification

- [ ] Run `for file in scripts/learning scripts/learning-supervisor scripts/install-learning; do bash -n "$file"; done`.
- [ ] Run `node --test scripts/learning-command.test.js`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Perform the real smoke test from outside the checkout: `./scripts/install-learning`, `cd /tmp`, `learning start`, `learning status`, `learning stop`, and `learning status` again.
- [ ] Before implementation, save `git status --short` to `/tmp/learning-command-baseline.txt`; after implementation, compare it with final `git status --short` and confirm only the planned files were added/modified while all pre-existing paths remain unchanged.
- [ ] Review `git diff -- scripts/learning scripts/learning-supervisor scripts/install-learning scripts/learning-command.test.js README.md` and confirm no existing user changes were overwritten.
