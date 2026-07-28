# Learning Command Design

## Goal

Provide a single `learning` command that controls the local roadmap-learning
development app from any working directory. It must start the existing Vite
frontend and Express backend, report useful live status, and stop only this
app's processes.

## User interface

```bash
learning start
learning status
learning stop
```

The command will print actionable errors for unsupported commands, missing
dependencies, and lifecycle conflicts. A duplicate start and stopping an
already-stopped app are successful informational no-ops.

The command is scoped to Linux/bash, matching the current development
environment. Exit codes are stable: `0` means the requested state was reached
(including an already-running start or already-stopped stop), `2` means usage
or dependency failure, `3` means a port or lifecycle conflict, and `1` means
the app is crashed, degraded, or could not reach the requested state.

## Architecture

- `scripts/learning` is the repo-owned implementation and remains the source
  of truth.
- `~/.local/bin/learning` is a generated executable wrapper installed by a
  repo-owned installer, so the command is available from any directory. The
  wrapper contains the shell-quoted absolute repository path and can print a
  useful stale-checkout error if the repository moves. Run
  `./scripts/install-learning` again to update it. The installer creates
  `~/.local/bin` if needed and reports when that directory is not on `PATH`.
- The running app is launched as one isolated process group using the existing
  `npm run dev` script. Existing npm scripts and service ports remain
  unchanged.
- A repo-owned supervisor is the process-group leader and launches the
  existing `npm run dev` command as its child. Runtime metadata is stored in an
  owner-protected directory named
  `${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/learning-roadmap-learning-$UID`, with
  `control.lock`, `process.meta`, and `app.log` files. The selected runtime
  directory is created with mode 700, rejected if it is a symlink or not owned
  by the current user, and metadata/log files use mode 600. Metadata is written
  to a same-directory temporary file and atomically renamed.
- `process.meta` records the supervisor PID, process group ID, supervisor start
  ticks, repository path, and start time. No credentials or environment-file
  contents are read or displayed; the launched app may continue to load its
  normal environment through `dotenv/config`.

All backend and frontend probes use the same contract for `start` and
`status`: `curl` has a 2-second maximum request time, follows no redirects,
and treats connection failure or a non-success HTTP status as unhealthy. The
backend URL is `http://127.0.0.1:3200/health` and must additionally contain
JSON `status: ok`; the frontend URL is `http://127.0.0.1:3201/` and must return
HTTP 2xx or 3xx.

## Lifecycle behavior

### Start

1. Resolve the configured repository path from the generated wrapper and validate the
   repository, `package.json`, `scripts/learning-supervisor`, `npm`, `node`,
   `setsid`, `flock`, `curl`, `ss`, `ps`, and `kill` are available. It also
   requires the local `node_modules/.bin/concurrently` and
   `node_modules/.bin/vite` executables; no command may trigger an npm network
   install.
2. Acquire `control.lock` with `flock`; this serializes start, status, and
   stop without stale lock directories.
3. If recorded process identity is valid and alive, report `already running`
   and exit 0. If metadata is stale or malformed, remove only the metadata
   file under the lock, without signaling anything, and continue. Malformed
   metadata is never used to derive a PID or PGID.
4. Refuse to start if either 3200 or 3201 is already listening, preventing a
   health response from an unrelated service from being mistaken for this app.
5. Launch the supervisor with `setsid`, record its PID/PGID/start ticks, and
   poll every 250ms for at most 30 seconds. Success requires the supervisor to
   remain alive and both shared-contract probes to pass.
6. On timeout or child-process failure, report `degraded`, show the log path,
   terminate the recorded process group safely, and return exit 1.

### Status

Status validates the recorded PID, PGID, supervisor start ticks, repository
path, and supervisor command line rather than matching arbitrary Node
processes. It reports one of `stopped`, `starting`, `running`, `degraded`,
`crashed`, `stale`, `orphaned`, `unmanaged`, or `conflict`, plus backend and
frontend checks. State precedence is: no metadata and no listeners=`stopped`;
invalid metadata=`stale`; valid supervisor with both checks passing=`running`;
valid supervisor within the 30-second startup window=`starting`; valid
supervisor outside that window=`degraded`; dead supervisor with no app
listeners=`crashed`; dead supervisor with app listeners=`orphaned`; healthy
services without our metadata=`unmanaged`; and one or both occupied ports
without a valid app supervisor=`conflict`. A conflict includes an occupied but
unhealthy port. Stale metadata is removed under the lock without signaling
anything.

### Stop

Stop sends `TERM` to the recorded process group only after revalidating PID,
PGID, start ticks, repository path, and supervisor command line. It polls every
250ms for at most 10 seconds; if the group remains alive, it sends `KILL` to
that same revalidated group and polls for 2 more seconds. The supervisor traps
TERM/INT/HUP and terminates its npm child so normal shutdown does not orphan
descendants. If the supervisor is already gone while descendants remain, stop
reports `orphaned` and refuses to signal the process group because its identity
can no longer be proven. If identity cannot be revalidated, it removes metadata
without signaling. It exits 0 when stopped and exits 1 if processes remain after
the forced-stop deadline.

## Safety and edge cases

- No broad `pkill`, port-based process killing, or matching of unrelated Node
  processes; only the recorded and revalidated supervisor process group may be
  signaled.
- Start is idempotent when this app is already running.
- Stop is harmless when the app is already stopped.
- A stale, malformed, or reused metadata file cannot cause an unrelated
  process to be killed; PID, PGID, start-ticks, command-line, and repository
  checks are required before signaling.
- Concurrent starts, stops, and status checks are serialized with `flock`.
- Dependencies must already be installed; the command never runs `npm install`
  or accesses the network. It explicitly checks
  `node_modules/.bin/concurrently` and `node_modules/.bin/vite` before launch.
- The runtime directory is resolved with `realpath`, and both newly created and
  existing directories must be owned by the current user and have no group or
  other permissions after tightening to mode 700. If ownership, permissions,
  or path resolution cannot be safely established, the command exits 2.
- Existing user modifications and application data remain untouched.

## Verification

- Shell syntax checks for the command, installer, and supervisor scripts.
- Deterministic fixture checks for command parsing, malformed/stale metadata,
  PID reuse protection, port collisions, partial startup, duplicate starts,
  graceful stops, forced stops, orphaned supervisors, broken wrappers, unsafe
  runtime directories, and hung health probes.
- Manual smoke test: `learning start`, `learning status`, `learning stop`, and
  a second `learning status` after stopping.
- Existing application tests are not changed; the existing `npm run dev`
  behavior remains the integration path for the two services.
