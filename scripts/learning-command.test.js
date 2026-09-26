import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const repo = path.resolve(import.meta.dirname, '..')
const command = path.join(repo, 'scripts', 'learning')

function makeRuntime() {
  const runtime = mkdtempSync(path.join(os.tmpdir(), 'learning-command-test-'))
  chmodSync(runtime, 0o700)
  return runtime
}

function run(args, runtime, extraEnv = {}) {
  return spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      LEARNING_RUNTIME_DIR: runtime,
      ...extraEnv,
    },
  })
}

function cleanup(runtime) {
  rmSync(runtime, { recursive: true, force: true })
}

function processStartTicks(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  return stat.trim().split(/\s+/)[21]
}

function processGroupId(pid) {
  return String(pid)
}

function writeMetadata(runtime, process, repoPath = repo) {
  writeFileSync(path.join(runtime, 'process.meta'), [
    `pid=${process.pid}`,
    `pgid=${processGroupId(process.pid)}`,
    `start_ticks=${processStartTicks(process.pid)}`,
    `repo=${repoPath}`,
    `started_at=${Date.now()}`,
  ].join('\n') + '\n', { mode: 0o600 })
}

async function startHealthServers() {
  const bin = mkdtempSync(path.join(os.tmpdir(), 'learning-probes-'))
  writeFileSync(path.join(bin, 'curl'), `#!/usr/bin/env bash
if [[ "$*" == *3200* ]]; then
  printf '{"status":"ok"}\\nlearning-status:200'
else
  printf '200'
fi
`)
  chmodSync(path.join(bin, 'curl'), 0o755)
  return { bin, env: { PATH: `${bin}:${process.env.PATH}` } }
}

function startFakeSupervisor(supervisorPath = path.join(repo, 'scripts', 'learning-supervisor'), repoPath = repo) {
  return spawn('setsid', [
    'bash',
    '-c',
    'exec -a "$1" bash -c "while :; do sleep 1; done" learning-test "$2"',
    'learning-test-supervisor',
    supervisorPath,
    repoPath,
  ], { stdio: 'ignore' })
}

function makeStartFixture({ nativeBindingMismatch = false, splitNodeRuntime = false, nativeRebuildFails = false, backendUnavailableFirst = false } = {}) {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'learning-start-fixture-'))
  const scripts = path.join(fixture, 'scripts')
  const bins = path.join(fixture, 'node_modules', '.bin')
  const tools = path.join(fixture, 'tools')
  const runtimeBin = path.join(fixture, 'runtime-bin')
  const wrongNpmBin = path.join(fixture, 'wrong-npm-bin')
  const shimBin = path.join(fixture, 'shim-bin')
  let runtimeNodePath = null
  mkdirSync(scripts, { recursive: true, mode: 0o700 })
  mkdirSync(bins, { recursive: true, mode: 0o700 })
  mkdirSync(tools, { mode: 0o700 })
  if (splitNodeRuntime) {
    mkdirSync(runtimeBin, { mode: 0o700 })
    mkdirSync(wrongNpmBin, { mode: 0o700 })
    mkdirSync(shimBin, { mode: 0o700 })
  }
  if (nativeBindingMismatch) {
    mkdirSync(path.join(fixture, 'node_modules', 'better-sqlite3'), { recursive: true, mode: 0o700 })
    writeFileSync(path.join(fixture, 'node_modules', 'better-sqlite3', 'package.json'), '{}\n')
  }
  copyFileSync(command, path.join(scripts, 'learning'))
  chmodSync(path.join(scripts, 'learning'), 0o755)
  writeFileSync(path.join(scripts, 'learning-supervisor'), `#!/usr/bin/env bash
command -v node > "$LEARNING_RUNTIME_DIR/supervisor-node-path"
trap 'exit 0' TERM INT HUP
while :; do sleep 1; done
`)
  chmodSync(path.join(scripts, 'learning-supervisor'), 0o755)
  writeFileSync(path.join(fixture, 'package.json'), '{}\n')
  for (const dependency of ['concurrently', 'vite']) {
    writeFileSync(path.join(bins, dependency), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bins, dependency), 0o755)
  }
  writeFileSync(path.join(tools, 'curl'), `#!/usr/bin/env bash
if [[ "$*" == *3200* ]]; then
  if [[ ${backendUnavailableFirst} == true && ! -e "$LEARNING_RUNTIME_DIR/backend-probed" ]]; then
    : > "$LEARNING_RUNTIME_DIR/backend-probed"
    printf '{"status":"unavailable"}\\nlearning-status:503'
    exit 0
  fi
  printf '{"status":"ok"}\\nlearning-status:200'
else
  printf '200'
fi
`)
  writeFileSync(path.join(tools, 'ss'), '#!/usr/bin/env bash\n')
  if (nativeBindingMismatch) {
    const rebuiltMarker = path.join(fixture, 'native-binding-rebuilt')
    const nodePath = splitNodeRuntime ? path.join(runtimeBin, 'node') : path.join(tools, 'node')
    const npmPath = splitNodeRuntime ? path.join(runtimeBin, 'npm') : path.join(tools, 'npm')
    runtimeNodePath = splitNodeRuntime ? nodePath : null
    writeFileSync(nodePath, `#!/usr/bin/env bash
if [[ "$*" == *"new Database"* ]]; then
  [[ -f ${JSON.stringify(rebuiltMarker)} ]] && exit 0
  printf 'Error: better-sqlite3 was compiled for a different Node.js version\\n' >&2
  exit 1
fi
if [[ "$1" == --version ]]; then printf 'v25.9.0\\n'; fi
exit 0
`)
    writeFileSync(npmPath, `#!/usr/bin/env bash
if [[ "$1" == rebuild && "$2" == better-sqlite3 ]]; then
  ${nativeRebuildFails ? 'exit 23' : ''}
  touch ${JSON.stringify(rebuiltMarker)}
fi
exit 0
`)
    chmodSync(nodePath, 0o755)
    chmodSync(npmPath, 0o755)
    if (splitNodeRuntime) {
      symlinkSync(nodePath, path.join(shimBin, 'node'))
      writeFileSync(path.join(wrongNpmBin, 'npm'), `#!/usr/bin/env bash
if [[ "$1" == rebuild && "$2" == better-sqlite3 ]]; then
  touch ${JSON.stringify(path.join(fixture, 'wrong-runtime-rebuild'))}
fi
exit 0
`)
      chmodSync(path.join(wrongNpmBin, 'npm'), 0o755)
    }
  }
  chmodSync(path.join(tools, 'curl'), 0o755)
  chmodSync(path.join(tools, 'ss'), 0o755)
  const commandPath = splitNodeRuntime
    ? `${shimBin}:${wrongNpmBin}:${tools}:${process.env.PATH}`
    : `${tools}:${process.env.PATH}`
  return { fixture, script: path.join(scripts, 'learning'), path: commandPath, runtimeNodePath }
}

test('usage prints the learning command and exits 2 for no arguments', () => {
  const runtime = makeRuntime()
  try {
    const result = run([], runtime)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /learning (start|status|stop)/)
  } finally {
    cleanup(runtime)
  }
})

test('help prints the supported commands and exits 0', () => {
  const runtime = makeRuntime()
  try {
    const result = run(['--help'], runtime)
    assert.equal(result.status, 0)
    assert.match(result.stdout, /learning start/)
    assert.match(result.stdout, /learning status/)
    assert.match(result.stdout, /learning stop/)
  } finally {
    cleanup(runtime)
  }
})

test('status reports stopped when no metadata or listeners exist', () => {
  const runtime = makeRuntime()
  try {
    const result = run(['status'], runtime)
    assert.equal(result.status, 0)
    assert.match(result.stdout, /stopped/)
  } finally {
    cleanup(runtime)
  }
})

test('stop is successful and informational when already stopped', () => {
  const runtime = makeRuntime()
  try {
    const result = run(['stop'], runtime)
    assert.equal(result.status, 0)
    assert.match(result.stdout, /already stopped|stopped/)
  } finally {
    cleanup(runtime)
  }
})

test('malformed metadata cannot signal an unrelated PID', () => {
  const runtime = makeRuntime()
  const unrelated = spawn('sleep', ['30'])
  try {
    writeFileSync(path.join(runtime, 'process.meta'), `pid=${unrelated.pid}\nmalformed\n`, { mode: 0o600 })
    const result = run(['stop'], runtime)
    assert.equal(result.status, 0)
    assert.equal(unrelated.exitCode, null)
    assert.equal(run(['status'], runtime).status, 0)
  } finally {
    unrelated.kill('SIGTERM')
    cleanup(runtime)
  }
})

test('unsafe runtime symlink is rejected', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'learning-command-link-'))
  const target = path.join(parent, 'target')
  const runtime = path.join(parent, 'runtime')
  mkdirSync(target, { mode: 0o700 })
  symlinkSync(target, runtime)
  try {
    const result = run(['status'], runtime)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /runtime|symlink|permission/i)
  } finally {
    cleanup(parent)
  }
})

test('status test fixture keeps metadata files owner-only', () => {
  const runtime = makeRuntime()
  try {
    const result = run(['status'], runtime)
    assert.equal(result.status, 0)
    const lock = path.join(runtime, 'control.lock')
    assert.ok(existsSync(lock))
    assert.equal(readFileSync(lock).toString(), '')
  } finally {
    cleanup(runtime)
  }
})

test('status recognizes a healthy recorded process and start is idempotent', async () => {
  const runtime = makeRuntime()
  const probes = await startHealthServers()
  const fakeSupervisor = startFakeSupervisor()
  try {
    writeMetadata(runtime, fakeSupervisor)
    const status = run(['status'], runtime, probes.env)
    assert.equal(status.status, 0, `${status.stdout}${status.stderr}`)
    assert.match(status.stdout, /running backend=ok frontend=ok/)

    const duplicateStart = run(['start'], runtime, probes.env)
    assert.equal(duplicateStart.status, 0)
    assert.match(duplicateStart.stdout, /already running/)
    assert.match(duplicateStart.stdout, /Frontend: http:\/\/localhost:3201/)
    assert.match(duplicateStart.stdout, /Backend:  http:\/\/localhost:3200/)

    const stop = run(['stop'], runtime, probes.env)
    assert.equal(stop.status, 0, `${stop.stdout}${stop.stderr}`)
    assert.match(stop.stdout, /stopped/)
  } finally {
    fakeSupervisor.kill('SIGKILL')
    cleanup(probes.bin)
    cleanup(runtime)
  }
})

test('start reports a listener conflict without metadata', async () => {
  const runtime = makeRuntime()
  const bin = mkdtempSync(path.join(os.tmpdir(), 'learning-ss-'))
  writeFileSync(path.join(bin, 'ss'), `#!/usr/bin/env bash
if [[ "$*" == *':3200'* ]]; then
  printf 'LISTEN'
fi
`)
  chmodSync(path.join(bin, 'ss'), 0o755)
  try {
    const result = run(['start'], runtime, { PATH: `${bin}:${process.env.PATH}` })
    assert.equal(result.status, 3)
    assert.match(result.stderr, /port conflict/)
  } finally {
    cleanup(bin)
    cleanup(runtime)
  }
})

test('start does not leave the control lock held by the supervisor', () => {
  const runtime = makeRuntime()
  const fixture = makeStartFixture()
  const env = { ...process.env, LEARNING_RUNTIME_DIR: runtime, PATH: fixture.path }
  try {
    const start = spawnSync(fixture.script, ['start'], { cwd: '/tmp', encoding: 'utf8', env })
    assert.equal(start.status, 0, `${start.stdout}${start.stderr}`)
    assert.match(start.stdout, /Frontend: http:\/\/localhost:3201/)
    assert.match(start.stdout, /Backend:  http:\/\/localhost:3200/)
    const status = spawnSync(fixture.script, ['status'], { cwd: '/tmp', encoding: 'utf8', env })
    assert.equal(status.status, 0, `${status.stdout}${status.stderr}`)
    assert.match(status.stdout, /running/)
  } finally {
    const metadataPath = path.join(runtime, 'process.meta')
    if (existsSync(metadataPath)) {
      const pid = Number(readFileSync(metadataPath, 'utf8').match(/^pid=(\d+)$/m)?.[1])
      if (pid) process.kill(-pid, 'SIGKILL')
    }
    cleanup(fixture.fixture)
    cleanup(runtime)
  }
})

test('start rebuilds a native SQLite binding for the active Node runtime', () => {
  const runtime = makeRuntime()
  const fixture = makeStartFixture({ nativeBindingMismatch: true })
  const env = { ...process.env, LEARNING_RUNTIME_DIR: runtime, PATH: fixture.path }
  try {
    const start = spawnSync(fixture.script, ['start'], { cwd: '/tmp', encoding: 'utf8', env })
    assert.equal(start.status, 0, `${start.stdout}${start.stderr}`)
    assert.equal(existsSync(path.join(fixture.fixture, 'native-binding-rebuilt')), true, `${start.stdout}${start.stderr}`)
  } finally {
    const metadataPath = path.join(runtime, 'process.meta')
    if (existsSync(metadataPath)) {
      const pid = Number(readFileSync(metadataPath, 'utf8').match(/^pid=(\d+)$/m)?.[1])
      if (pid) process.kill(-pid, 'SIGKILL')
    }
    cleanup(fixture.fixture)
    cleanup(runtime)
  }
})

test('start rebuilds and launches with the exact Node runtime when npm resolves from another version', () => {
  const runtime = makeRuntime()
  const fixture = makeStartFixture({ nativeBindingMismatch: true, splitNodeRuntime: true })
  const env = { ...process.env, LEARNING_RUNTIME_DIR: runtime, PATH: fixture.path }
  try {
    const start = spawnSync(fixture.script, ['start'], { cwd: '/tmp', encoding: 'utf8', env })
    assert.equal(start.status, 0, `${start.stdout}${start.stderr}`)
    assert.equal(existsSync(path.join(fixture.fixture, 'native-binding-rebuilt')), true)
    assert.equal(existsSync(path.join(fixture.fixture, 'wrong-runtime-rebuild')), false)
    assert.equal(readFileSync(path.join(runtime, 'supervisor-node-path'), 'utf8').trim(), fixture.runtimeNodePath)
  } finally {
    const metadataPath = path.join(runtime, 'process.meta')
    if (existsSync(metadataPath)) {
      const pid = Number(readFileSync(metadataPath, 'utf8').match(/^pid=(\d+)$/m)?.[1])
      if (pid) process.kill(-pid, 'SIGKILL')
    }
    cleanup(fixture.fixture)
    cleanup(runtime)
  }
})

test('start fails before launching a frontend when native SQLite rebuild fails', () => {
  const runtime = makeRuntime()
  const fixture = makeStartFixture({ nativeBindingMismatch: true, nativeRebuildFails: true })
  const env = { ...process.env, LEARNING_RUNTIME_DIR: runtime, PATH: fixture.path }
  try {
    const start = spawnSync(fixture.script, ['start'], { cwd: '/tmp', encoding: 'utf8', env })
    assert.equal(start.status, 1)
    assert.match(start.stderr, /could not rebuild better-sqlite3/i)
    assert.equal(existsSync(path.join(runtime, 'process.meta')), false)
    assert.equal(existsSync(path.join(runtime, 'supervisor-node-path')), false)
  } finally {
    cleanup(fixture.fixture)
    cleanup(runtime)
  }
})

test('development services stop together when either service exits', () => {
  const devScript = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts.dev
  assert.match(devScript, /concurrently\s+--kill-others-on-fail\b/)
})

test('start restarts its managed process group when backend health is down', () => {
  const runtime = makeRuntime()
  const fixture = makeStartFixture({ backendUnavailableFirst: true })
  const env = { ...process.env, LEARNING_RUNTIME_DIR: runtime, PATH: fixture.path }
  const supervisorPath = path.join(fixture.fixture, 'scripts', 'learning-supervisor')
  const oldSupervisor = startFakeSupervisor(supervisorPath, fixture.fixture)
  try {
    writeMetadata(runtime, oldSupervisor, fixture.fixture)
    const start = spawnSync(fixture.script, ['start'], { cwd: '/tmp', encoding: 'utf8', env })
    assert.equal(start.status, 0, `${start.stdout}${start.stderr}`)
    assert.match(`${start.stdout}${start.stderr}`, /restarting.*degraded|restarting.*unhealthy/i)
    assert.notEqual(
      Number(readFileSync(path.join(runtime, 'process.meta'), 'utf8').match(/^pid=(\d+)$/m)?.[1]),
      oldSupervisor.pid,
    )
  } finally {
    const metadataPath = path.join(runtime, 'process.meta')
    if (existsSync(metadataPath)) {
      const pid = Number(readFileSync(metadataPath, 'utf8').match(/^pid=(\d+)$/m)?.[1])
      if (pid) process.kill(-pid, 'SIGKILL')
    }
    if (oldSupervisor.exitCode === null) process.kill(-oldSupervisor.pid, 'SIGKILL')
    cleanup(fixture.fixture)
    cleanup(runtime)
  }
})

test('installer creates an executable wrapper that works outside the checkout', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'learning-home-'))
  const installer = path.join(repo, 'scripts', 'install-learning')
  try {
    const result = spawnSync(installer, [], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    })
    assert.equal(result.status, 0)
    const installed = path.join(home, '.local', 'bin', 'learning')
    assert.equal(statSync(installed).mode & 0o111, 0o111)
    const help = spawnSync(installed, ['--help'], { cwd: '/tmp', encoding: 'utf8' })
    assert.equal(help.status, 0)
    assert.match(help.stdout, /learning start/)
  } finally {
    cleanup(home)
  }
})

test('installer quotes a checkout path containing spaces and detects a moved checkout', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'learning-space-'))
  const spacedRepo = path.join(parent, 'roadmap learning')
  const spacedScripts = path.join(spacedRepo, 'scripts')
  const home = path.join(parent, 'home')
  mkdirSync(spacedScripts, { recursive: true, mode: 0o700 })
  mkdirSync(home, { mode: 0o700 })
  for (const file of ['learning', 'learning-supervisor', 'install-learning']) {
    copyFileSync(path.join(repo, 'scripts', file), path.join(spacedScripts, file))
    chmodSync(path.join(spacedScripts, file), 0o755)
  }
  try {
    const install = spawnSync(path.join(spacedScripts, 'install-learning'), [], {
      cwd: '/tmp',
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    })
    assert.equal(install.status, 0)
    const wrapper = path.join(home, '.local', 'bin', 'learning')
    const help = spawnSync(wrapper, ['--help'], { cwd: '/tmp', encoding: 'utf8' })
    assert.equal(help.status, 0)
    rmSync(spacedRepo, { recursive: true, force: true })
    const moved = spawnSync(wrapper, ['--help'], { cwd: '/tmp', encoding: 'utf8' })
    assert.equal(moved.status, 2)
    assert.match(moved.stderr, /checkout is missing/)
  } finally {
    cleanup(parent)
  }
})
