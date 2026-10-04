<p align="center">
  <img src="assets/brand/levelroom/levelroom-social-preview.png" alt="Levelroom — build skills by doing">
</p>

<h1 align="center">Levelroom</h1>

<p align="center"><strong>Build skills by doing.</strong></p>

A local-first learning app that turns a learner’s goal into a guided Trail. AI helps shape a personal plan and tutor explanations; structured practice, explicit outcomes, and scored Chapter checkpoints keep mastery—not chat volume—at the center. Progress is organized as Tracks, Chapters, and Sessions, with saved Builds, spaced Reviews, and a calm, customizable visual experience.


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

- **Guided onboarding:** Choose a goal, level, available time, and preferences; review and confirm the generated Track before learning.
- **Mastery Trail dashboard:** See the next useful action, Chapter outcomes, Session progress, checkpoints, Reviews, and a gentle return path.
- **Structured Sessions:** Learn through varied activities with immediate deterministic feedback; optional tutor chat supports rather than replaces practice.
- **Chapter checkpoints:** Demonstrate outcomes with saved assessments; pass rules include an overall threshold and critical-outcome floor.
- **Builds:** Create and submit practical work when a Session requires it, with rubric feedback and a clear retry path.
- **Spaced Reviews and streaks:** Revisit due skills with encouraging continuity cues that never gate learning.
- **Track continuation:** Extend a completed Track with a balanced, outcome-aware next plan.
- **Sixteen cozy themes:** Eight light and eight dark palettes, persisted locally and expressed through semantic design tokens.
- **Data export/import:** Back up and restore current learning data; legacy quiz-format imports are intentionally rejected.
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
   cd roadmap-learning
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

Optional LLM selection overrides are read at runtime:

```bash
LLM_PROVIDER=openai-codex
LLM_MODEL=gpt-5.6-luna
LLM_REASONING_EFFORT=xhigh
```

Each saved Settings field takes precedence over its corresponding environment variable independently. Missing or empty saved fields fall through to the environment, then to the provider-aware defaults. With no saved selection or overrides, new sessions use Codex, `gpt-5.6-luna`, and `xhigh` reasoning. Environment values are trimmed; provider, model, and reasoning identifiers remain case-sensitive.

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
2. The default is `gpt-5.6-luna` with `xhigh` reasoning; you may select another available Codex model and one of its listed reasoning levels.
3. Select **Connect with browser**. If local browser callback setup is unavailable, or the browser flow cannot finish, use the device-code or manual-code option.
4. Return to the app and save the provider settings.

This integration uses the Pi AI provider's in-process OAuth and Responses implementation. It uses a ChatGPT/Codex subscription and does not require or accept an OpenAI API key. OpenAI does not document a general-purpose third-party OAuth API for this flow; the integration depends on an unofficial/private backend path and may stop working as OpenAI changes it. It is intended for personal local use. If OAuth is not connected or unavailable, connect it in Settings or switch to OpenAI API, Anthropic API, or Fireworks API credentials.

Pi OAuth credentials are stored separately from SQLite and JSON backups in an app-owned, owner-protected file:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/roadmap-learning/codex-auth.json`
- macOS: `~/Library/Application Support/roadmap-learning/codex-auth.json`
- Windows: `%LOCALAPPDATA%\roadmap-learning\codex-auth.json`

Disconnect removes the local credential data. It does not claim to revoke the authorization remotely. Backups include the selected provider, model, and reasoning level, but never OAuth tokens or account metadata; restoring a Codex selection on another machine requires signing in there.

Switching providers changes the model used for future AI operations. It does not change saved Trails, Session order, progress, chat history, checkpoint attempts, Reviews, Builds, or mistakes. New generated text can differ by model.

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

Runs the backend suite covering API routes, database operations, structured activity and checkpoint logic, SRS scheduling, streak tracking, and LLM client adapters.

### Frontend tests only

```bash
npm run test:frontend
```

Runs the frontend suite covering React components, user interactions, themes, and API integration.

### Lint & Typecheck

```bash
npm run lint      # Placeholder: no linter is configured yet
npm run typecheck # Placeholder: no type checker is configured yet
```

Both scripts currently report that no tool is configured; they are not substitutes for the test suite.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (localhost:3201)             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Mastery Trail│  │ Session UI   │  │ Review Queue │  │
│  │  (React)     │  │  (React)     │  │  (React)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼────────────────────────────────────┐
│              Express API Server (port 3200)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ /topics  │ │ /sessions│ │ /reviews │ │ /llm     │  │
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

- **AI where useful:** LLMs generate and explain content; fixed answer keys and validators score objective activity/checkpoint responses consistently.
- **Structured runtime:** Sessions store ordered activities, answers, and completion state. Chapter checkpoints persist attempts and outcome-level results.
- **Local-first:** A single SQLite database stores learning state; themes are saved in browser storage. No accounts or cloud sync.
- **Provider-agnostic AI:** `server/llm/` hosts configured model integrations; tutor responses can stream over Server-Sent Events.
- **Canonical progress states:** Sessions use `not_started`, `practicing`, and `passed`; Chapter completion depends on its checkpoint, not a quiz or bypass state.

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
│   │   │   ├── trail/          # Track, Chapter, and Session navigation
│   │   │   ├── SessionActivities.jsx
│   │   │   ├── TutorChat.jsx
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

Core SQLite tables include:

| Table | Purpose |
|-------|---------|
| `topics` | Learning Trails and learner/course metadata |
| `modules` | Chapters, outcomes, ordering, and checkpoint status |
| `lessons` | Structured Sessions, activity blocks, outcomes, and prerequisites |
| `progress` | Session state and structured activity answers |
| `messages` | Optional tutor chat history per Session |
| `srs_queue` | Spaced repetition items with interval index and due dates |
| `exam_attempts` | Saved Chapter checkpoint attempts and outcome evaluations |
| `artifacts` | Artifact submissions with rubric scores and feedback |
| `course_links` | Parent/continuation Trail relationships and learning lanes |
| `llm_settings` | Selected provider, model, and reasoning effort; credentials stay outside SQLite |
| `mistakes_log` | Tracked misconceptions per topic |
| `streaks` | Current streak, max streak, last active date |
| `streak_events` | Idempotent learning activity events used to record streaks |

Foreign key constraints are enforced. Deleting a topic cascades to all related rows.

## API Overview

Key API endpoints (all prefixed with `/api`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET/POST | `/settings` | Load/save LLM settings |
| GET | `/topics` | List all topics |
| POST | `/topics` | Create new topic |
| GET | `/topics/:id/dashboard` | Mastery Trail with Tracks, Chapters, Sessions, and next action |
| POST | `/topics/:id/curriculum/generate` | Generate curriculum via SSE |
| POST | `/topics/:id/curriculum/confirm` | Confirm and persist curriculum |
| GET | `/topics/:id/lessons/:lid` | Load Session metadata, activities, and saved state |
| POST | `/topics/:id/lessons/:lid/activities/answer` | Save and score a structured activity answer |
| POST | `/topics/:id/lessons/:lid/chat` | Send an optional tutor message (SSE response) |
| POST | `/topics/:id/lessons/:lid/artifact` | Submit a required or optional Build |
| GET/POST | `/topics/:id/modules/:mid/exam` | Load or submit the Chapter checkpoint |
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
