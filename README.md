# Mastery Roadmap

An LLM-powered personal learning engine that transforms static roadmaps into an adaptive, mastery-driven experience. Enter any topic — React, Calculus, Negotiation, Japanese — and an AI tutor designs a personalized curriculum, teaches chunk-by-chunk, gates progress with formative assessments, and schedules spaced reviews. No prebuilt templates, no auth, no accounts — just one learner, one database, and one AI tutor.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the App](#running-the-app)
- [Environment Variables](#environment-variables)
- [LLM Provider Setup](#llm-provider-setup)
- [Testing](#testing)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Overview](#api-overview)
- [Common Issues](#common-issues)
- [License](#license)

## Features

- **Adaptive Curriculum Generation:** Enter any topic and the LLM builds a personalized learning path with modules, lessons, and skill checks.
- **Competence Graph:** Visual skill tree showing lesson states (not started, practicing, passed, skipped, tested out) with prerequisite linkage.
- **Lesson Chat with SSE Streaming:** Real-time conversation with the AI tutor using Socratic method by default.
- **Formative Assessments:** "Check Your Understanding" quizzes with weighted scoring (Recall=1, Explain/Apply/Diagnose=2, Transfer=3).
- **Remediation & Retest:** Failed quizzes trigger targeted re-teaching and shorter retests focused on missed concepts.
- **Artifact Submission:** Submit code/text/design/math solutions reviewed against a 4-point rubric.
- **Module Exams:** Comprehensive exams (12-25 questions) unlock after all MVP lessons are passed.
- **Spaced Repetition:** Adaptive SRS scheduling with intervals (1d, 3d, 7d, 14d, 30d) and acceleration/regression.
- **Streak Tracking:** Consecutive-day activity tracking with backlog detection after 7+ days inactive.
- **Mistakes Log & Adaptive Difficulty:** Recurring errors tracked; difficulty auto-adjusts based on performance.
- **Data Export/Import:** Full JSON backup and restore of all learning data.
- **Codex Subscription Provider (Experimental):** In-process OAuth sign-in with browser and device-code flows, model and reasoning choices, and local disconnect.
- **Responsive Design:** Usable from 375px mobile to 1280px+ desktop.
- **Error Boundaries & Offline Indicators:** Friendly error UI and backend connectivity monitoring.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + React Router + Tailwind CSS |
| Backend | Express 4 + better-sqlite3 |
| LLM | Vercel AI SDK for API-key providers; in-process Pi AI provider for experimental Codex subscription sign-in |
| Testing | Vitest + Supertest + React Testing Library |
| Styling | Tailwind CSS v4 |

## Prerequisites

- **Node.js** v25.9.0 or later
- **npm** v11.12.1 or later
- **SQLite** v3.53.0 or later (system-wide, for `better-sqlite3` compilation)
- An API key from an API-billed provider or a ChatGPT account eligible for Codex sign-in (see [LLM Provider Setup](#llm-provider-setup))

## Setup

1. **Clone or navigate to the project directory:**

   ```bash
   cd /home/clive/batcave/roadmap-learning
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

   This installs all frontend and backend dependencies, including native `better-sqlite3` bindings.

3. **Verify the setup:**

   ```bash
   npm test
   ```

   All backend and frontend tests should pass.

## Running the App

### Development (both frontend + backend)

```bash
npm run dev
```

This starts both services concurrently:
- **Backend API:** `http://localhost:3200`
- **Frontend dev server:** `http://localhost:3201`

### Quick control from any directory

Install the `learning` command once from the repository:

```bash
./scripts/install-learning
```

Then control both development services without changing directories:

```bash
learning start
learning status
learning stop
```

The command tracks only this checkout's process group. Logs and lifecycle
metadata are stored outside the repository. If `~/.local/bin` is not already
on `PATH`, the installer prints the required shell export.

### Backend only

```bash
npm run dev:server
```

Runs the Express API on port 3200.

### Frontend only

```bash
npm run dev:client
```

Runs the Vite dev server on port 3201.

### Production build

```bash
npm run build
```

Builds the frontend into `dist/`. The backend can serve static files from this directory if configured.

## Environment Variables

The app reads configuration from environment variables at runtime. Create a `.env` file in the project root (it is already in `.gitignore`):

```bash
# Required: path to the SQLite database file
DB_PATH=./data/app.db

# Optional: override default ports
PORT=3200          # backend API port
CLIENT_PORT=3201   # frontend dev server port
```

API keys stay outside the learning database. Set any API-key provider credentials in the environment before starting the server:

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
FIREWORKS_API_KEY=your-fireworks-api-key
```

The Settings page reports whether each environment variable is present; it never accepts or returns key values. A connected Codex subscription can be used without an API key.

## LLM Provider Setup

Choose a provider in the app's Settings page (`http://localhost:3201/settings`). API-key providers use their respective platform API billing. Codex subscription sign-in uses the ChatGPT/Codex plan quota where eligible; OpenAI API-key billing is separate.

### OpenAI
1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Set `OPENAI_API_KEY` in the environment before starting the server
3. In Settings, select **OpenAI API key** as the provider
4. Choose a model: `gpt-4o`, `gpt-4o-mini`, or `o3-mini`, then click **Save Settings**

### Anthropic
1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Set `ANTHROPIC_API_KEY` in the environment before starting the server
3. In Settings, select **Anthropic API key** as the provider
4. Choose a model: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, or `claude-3-haiku-20240307`, then click **Save Settings**

### Fireworks
1. Get an API key from [fireworks.ai](https://fireworks.ai)
2. Set `FIREWORKS_API_KEY` in the environment before starting the server
3. In Settings, select **Fireworks API key** as the provider
4. Choose a model: `accounts/fireworks/models/llama-v3p1-70b-instruct`, `accounts/fireworks/models/llama-v3p1-8b-instruct`, or the Kimi router, then click **Save Settings**

### OpenAI Codex subscription (experimental)

1. In Settings, choose **OpenAI Codex subscription**.
2. Select an available Codex model and one of its listed reasoning levels.
3. Select **Connect with browser**. If local browser callback setup is unavailable, or the browser flow cannot finish, use the device-code or manual-code option.
4. Return to the app and save the provider settings.

This integration uses the Pi AI provider's in-process OAuth and Responses implementation. It does not invoke Codex CLI or Pi CLI and does not use an OpenAI API key. OpenAI does not document a general-purpose third-party OAuth API for this flow; the integration depends on an unofficial/private backend path and may stop working as OpenAI changes it. It is intended for personal local use. If it is unavailable, switch to OpenAI API, Anthropic API, or Fireworks API credentials.

Pi OAuth credentials are stored separately from SQLite and JSON backups in an app-owned, owner-protected file:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/roadmap-learning/codex-auth.json`
- macOS: `~/Library/Application Support/roadmap-learning/codex-auth.json`
- Windows: `%LOCALAPPDATA%\roadmap-learning\codex-auth.json`

Disconnect removes the local credential data. It does not claim to revoke the authorization remotely. Backups include the selected provider, model, and reasoning level, but never OAuth tokens or account metadata; restoring a Codex selection on another machine requires signing in there.

Switching providers changes the model used for future AI operations. It does not change saved roadmaps, lesson order, progress, chat history, attempts, spaced-repetition records, artifacts, or mistakes. New generated text can differ by model.

## Testing

### Run all tests

```bash
npm test
```

This runs backend tests first, then frontend tests.

### Backend tests only

```bash
npm run test:backend
```

Runs the backend suite covering API routes, database operations, state machine logic, SRS scheduling, streak tracking, and LLM client adapters.

### Frontend tests only

```bash
npm run test:frontend
```

Runs the frontend suite covering React components, user interactions, themes, and API integration.

### Lint & Typecheck

```bash
npm run lint      # Currently a no-op; ESLint can be added
npm run typecheck # Currently a no-op; TypeScript can be added
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (localhost:3201)             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Dashboard  │  │ Lesson Chat  │  │ Review Queue │  │
│  │  (React)     │  │  (React)     │  │  (React)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼────────────────────────────────────┐
│              Express API Server (port 3200)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ /topics  │ │ /lessons │ │ /reviews │ │ /llm     │  │
│  │  Router  │ │  Router  │ │  Router  │ │  Client  │  │
│  └──────────┘ └──────────┘ └──────────┘ └────┬─────┘  │
│                                               │        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐      │        │
│  │   DB     │ │  SRS     │ │  State   │      │        │
│  │ (SQLite) │ │ Scheduler│ │ Machine  │      │        │
│  └──────────┘ └──────────┘ └──────────┘      │        │
│                                               │        │
└───────────────────────────────────────────────┼────────┘
                                                  │ HTTP
┌─────────────────────────────────────────────────▼────────┐
│              External LLM APIs                           │
│   OpenAI    │   Anthropic    │   Fireworks              │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Local-first:** All data lives in a single SQLite file. No cloud sync, no accounts.
- **Provider-agnostic LLM client:** The `server/llm/client.js` adapter unifies OpenAI, Anthropic, and Fireworks behind a single interface.
- **SSE streaming:** All LLM chat responses stream via Server-Sent Events for real-time UX.
- **State machine discipline:** Lesson progress uses exact states (`not_started`, `practicing`, `quiz_pending`, `remediating`, `passed`, `tested_out`, `skipped`) with atomic transitions.
- **No auth / no sessions:** Single user per instance. The app is designed for personal, local use.

## Project Structure

```
roadmap-learning/
├── client/                    # Vite React frontend
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx            # React entry point
│   │   ├── App.jsx             # Root router + error boundary + offline indicator
│   │   ├── api.js              # Frontend API client (fetch wrappers)
│   │   ├── index.css           # Tailwind + custom animations
│   │   ├── components/         # Reusable React components
│   │   │   ├── CompetenceGraph.jsx
│   │   │   ├── LessonChat.jsx
│   │   │   ├── QuizPanel.jsx
│   │   │   ├── RemediationPanel.jsx
│   │   │   ├── ArtifactPanel.jsx
│   │   │   ├── ExamPanel.jsx
│   │   │   ├── ReviewSession.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── OfflineIndicator.jsx
│   │   │   └── Skeleton.jsx
│   │   └── pages/              # Route-level pages
│   │       ├── Dashboard.jsx
│   │       ├── OnboardingFlow.jsx
│   │       ├── CurriculumConfirmation.jsx
│   │       ├── SettingsPage.jsx
│   │       └── ReviewQueue.jsx
│   └── __tests__/              # Frontend component tests (Vitest + RTL)
├── server/                     # Express backend
│   ├── index.js                # Express app bootstrap
│   ├── db.js                   # SQLite schema, migrations, query helpers
│   ├── llm/
│   │   └── client.js           # Provider-agnostic LLM adapter
│   ├── routes/                 # Express route modules
│   │   ├── settings.js
│   │   ├── dashboard.js
│   │   ├── curriculum.js
│   │   ├── lessons.js
│   │   ├── exams.js
│   │   ├── reviews.js
│   │   ├── streak.js
│   │   └── data.js
│   ├── utils/                  # Business logic modules
│   │   ├── lesson-state-machine.js
│   │   ├── srs-scheduler.js
│   │   ├── streak-tracker.js
│   │   ├── mistakes-log.js
│   │   └── adaptive-difficulty.js
│   └── __tests__/              # Backend API tests (Vitest + Supertest)
├── data/                       # SQLite database file (created at runtime)
├── package.json
└── README.md
```

## Database Schema

The SQLite database contains 10 tables:

| Table | Purpose |
|-------|---------|
| `topics` | Learning roadmaps with metadata (level, time commitment, tone) |
| `modules` | Topic modules with skill outcomes |
| `lessons` | Individual lessons with depth, time, outcomes, prerequisites |
| `progress` | Lesson state machine (state, quiz scores, chunk progress) |
| `messages` | Chat history per lesson |
| `srs_queue` | Spaced repetition items with interval index and due dates |
| `quiz_attempts` | Persisted quiz questions, answers, and evaluations |
| `artifacts` | Artifact submissions with rubric scores and feedback |
| `llm_settings` | Provider, model, and encrypted API key |
| `mistakes_log` | Tracked misconceptions per topic |
| `streaks` | Current streak, max streak, last active date |

Foreign key constraints are enforced. Deleting a topic cascades to all related rows.

## API Overview

Key API endpoints (all prefixed with `/api`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET/POST | `/settings` | Load/save LLM settings |
| GET | `/topics` | List all topics |
| POST | `/topics` | Create new topic |
| GET | `/topics/:id/dashboard` | Topic dashboard with modules + lessons |
| POST | `/topics/:id/curriculum/generate` | Generate curriculum via SSE |
| POST | `/topics/:id/curriculum/confirm` | Confirm and persist curriculum |
| GET | `/topics/:id/lessons/:lid` | Load lesson metadata + chat history |
| POST | `/topics/:id/lessons/:lid/chat` | Send chat message (SSE response) |
| POST | `/topics/:id/lessons/:lid/quiz` | Start quiz |
| POST | `/topics/:id/lessons/:lid/quiz/submit` | Submit quiz answers |
| POST | `/topics/:id/lessons/:lid/artifact` | Submit artifact |
| GET/POST | `/topics/:id/modules/:mid/exam` | Module exam |
| GET/POST | `/reviews` | Review queue and session management |
| GET/POST | `/streak` | Streak data and event recording |
| GET/POST | `/data/export` / `/data/import` | Backup and restore |

## Common Issues

### `better-sqlite3` compilation fails
Ensure you have SQLite development headers installed system-wide. On Arch Linux:
```bash
sudo pacman -S sqlite
```

### Frontend shows "Cannot reach the learning engine"
The backend on port 3200 is not running. Start it with `npm run dev:server` or `npm run dev`.

### Curriculum generation hangs indefinitely
Check that your API key is valid and the selected provider is reachable. Open the browser console for network errors.

### No topics appear after onboarding
The curriculum confirmation step must be completed. Click **Accept & Start** on the confirmation screen to persist the curriculum.

## License

MIT
