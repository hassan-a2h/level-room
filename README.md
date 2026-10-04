<p align="center">
  <img src="assets/brand/levelroom/levelroom-social-preview.png" alt="Levelroom — build skills by doing">
</p>

<h1 align="center">Levelroom</h1>

<p align="center"><strong>Build skills by doing.</strong></p>

<p align="center">
  Turn a goal into a living learning trail: practice, build, get feedback, and keep moving.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#the-learning-loop">Learning loop</a> ·
  <a href="#development">Development</a> ·
  <a href="#architecture">Architecture</a>
</p>

## Why Levelroom?

Most learning tools stop at explanations. Levelroom is designed around the part that makes knowledge stick: doing the work.

- **Start with intent.** Describe what you want to learn, your current level, and the time you have.
- **Follow a living trail.** The app turns that intent into Tracks, Chapters, outcomes, and Sessions.
- **Practice in context.** Activities give immediate, deterministic feedback. Tutor chat is available when you need a nudge.
- **Prove the skill.** Builds and Chapter checkpoints turn progress into evidence.
- **Keep the thread.** Spaced Reviews, mistakes, streaks, and continuation trails make returning easy.

The app is local-first: learning state lives in SQLite on your machine, themes stay in the browser, and there is no account or cloud sync requirement.

## The learning loop

```text
Goal → Trail → Session → Build → Checkpoint → Review → Next useful step
```

Levelroom keeps this loop visible. A learner can always see what they are working toward, what counts as done, and what to do next.

## Quick start

Requires Node.js 25.9+ and npm 11.12+.

```bash
git clone https://github.com/hassan-a2h/level-room.git
cd level-room
npm install
npm run dev
```

Open [http://localhost:3201](http://localhost:3201). The API runs on port `3200`.

Run the test suite before making changes:

```bash
npm test
```

## Providers

Choose a provider in **Settings**. API-key providers read credentials from the environment; keys are never stored in the learning database.

| Provider | Environment variable | Notes |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | API billing; model selection in Settings |
| Anthropic | `ANTHROPIC_API_KEY` | API billing; model selection in Settings |
| Fireworks | `FIREWORKS_API_KEY` | API billing; model selection in Settings |
| OpenAI Codex subscription | — | Experimental local OAuth flow; no API key required |

Create a `.env` file only when using an API-key provider:

```bash
DB_PATH=./data/app.db
OPENAI_API_KEY=your-key
```

`DB_PATH`, `PORT`, and `CLIENT_PORT` are optional. Saved provider settings take precedence over environment defaults. Codex OAuth credentials are kept outside SQLite and are never included in exports.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and Vite client together |
| `npm run dev:server` | Start only the Express API on `3200` |
| `npm run dev:client` | Start only the Vite client on `3201` |
| `npm run build` | Build the production client |
| `npm test` | Run backend and frontend tests |
| `npm run verify:ui` | Run linting, tests, build, asset checks, and browser checks |
| `npm run themes:check` | Verify generated theme assets are current |

For a persistent local process, install the helper once and use:

```bash
./scripts/install-learning
learning start
learning status
learning stop
```

## Architecture

```text
React + Vite browser
        │ HTTP / SSE
        ▼
Express API ─── provider adapters ─── OpenAI / Anthropic / Fireworks / Codex
        │
        ▼
SQLite learning state
```

The important boundary is deliberate:

- **AI generates and explains.** It can shape curricula, activities, and tutor responses.
- **The runtime decides.** Answer keys, validators, session state, checkpoint rules, review scheduling, and streak events are deterministic.
- **The database records evidence.** Sessions, outcomes, builds, checkpoint attempts, reviews, and mistakes remain inspectable and resumable.

## Repository map

```text
client/              React application, routes, themes, and browser tests
server/              Express API, SQLite access, runtime rules, and provider adapters
scripts/             Local process helper, theme generation, and asset checks
docs/design/         Approved visual-system and interaction references
docs/plans/          Product and implementation plans
assets/brand/        Levelroom logo, banners, and README-ready visuals
data/                Runtime SQLite files (ignored by Git)
```

## Product surfaces

The main flows are mapped one-to-one in the app:

- onboarding and curriculum confirmation
- Trail dashboard and next-action navigation
- structured Sessions with activities and tutor support
- Builds with rubric feedback and retry paths
- Chapter checkpoints with outcome-level results
- Reviews, mistakes, streaks, and continuation Trails
- Settings, provider connection, theme selection, and data export/import

## Troubleshooting

**`better-sqlite3` fails to build**

Install SQLite development tools for your platform, then run `npm install` again.

**The client cannot reach the learning engine**

Make sure the API is running on port `3200`. `npm run dev` starts both services.

**Curriculum generation does not finish**

Check the selected provider and its environment credential, then inspect the browser console for the failed request.

## Documentation

- [Multi-theme visual system](docs/design/multi-theme-system.md)
- [UI overhaul implementation plan](docs/plans/2026-09-27-multi-theme-ui-overhaul-implementation.md)
- [Brand kit and README assets](assets/brand/levelroom/README.md)

## License

MIT
