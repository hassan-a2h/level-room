# Mastery Trail — full-app Playground prototype

Open http://localhost:3212/full-app/ . Use **Explore all screens** for direct access to each flow and its sample states. The header theme control switches every screen, activity, table, and dialog.

Five themes: Playground (light), Midnight (dark), Ocean (dark), Lavender (light), Ember (dark).

This is an interactive, temporary HTML design prototype using fictional data. It extends the approved V2 visual language across the existing application. It does not modify the application, connect to its APIs, read its database, or accept credentials.

## Module mapping

| Existing app | Prototype |
| --- | --- |
| Dashboard, TopicSwitcher, TodayCard, TrailMap, ChapterCard, WeeklyRhythm, FocusAreas | Trail dashboard: next action, active/prior Track, tactile Sessions, Chapter prerequisites, weekly activity, due practice, focus areas, empty/error/setup recovery |
| OnboardingFlow | Destination, self-reported starting point, optional placement and recommendation, study window/pace, generation, interruption/recovery, provider readiness |
| CurriculumConfirmation | Core/breadth outcomes, expandable Chapters/Sessions, prerequisites, Build previews, adjustments, regeneration, confirmation |
| SessionPage, SessionPlayer, ActivityRenderer | Read, worked example, choice, ordering, short answer, reflection, saved progress, completed-step review, retry state, completion |
| TutorSidecar | Contextual guide prompts, message input, sample responses, collapsed view |
| ArtifactPanel | Evidence and SQL/file submission modes, rubric, submitted work, assessment dimensions, revision, passing result, required Build completion |
| ExamPanel and checkpoint components | Locked/ready intro, saved questions, outcome scores, 80% overall / 60% core gates, full and targeted retakes |
| ReviewQueue, ReviewSession | Due/overdue/cumulative items, queue filters, empty/error states, retrieval answers, feedback, pause/resume, summary, next schedule |
| ContinuationFlow | Track completion, strengths/gaps and Builds, readiness gate, deepen/broaden, learner level/time, generation, preview, adjustments, stale preview, confirmation/new Track |
| SettingsPage, ThemeProvider | Five complete themes, provider/model and simulated connection, local preferences, fixture export/import confirmation, reset |

## Connected walkthrough

The initial sample starts with Sessions 101 and 102 mastered. Continue Session 103 through six activities. For the choice, include the boundary with `>= 100`. Order SELECT → FROM → WHERE → ORDER BY, then write the query and leave a takeaway.

Session 104 is a required Build. Submit a draft, inspect the rubric, revise, and finish the Session. The Chapter checkpoint opens only after all four Sessions are mastered. Passing it opens the next Chapter preview; it does not prematurely complete the whole Track.

The **Track complete** shortcut under Explore all screens demonstrates the later continuation flow. This shortcut is a preview of a completed Track, rather than a change to the normal readiness rule. Confirming setup or continuation starts a new Track with fresh progress and keeps the prior Track summary.

## Prototype limits

Generation, tutoring, grading, and scheduling are simulated with bounded local fixtures. Later Chapters are outcome previews, and the sample activities demonstrate reusable formats rather than an entire production curriculum. Remote-service failures and background/network behavior are not implemented. The visual experiments, skill stars, chapter scenery, guide character, and celebrations are proposed UX improvements.

Only the prototype's own sessionStorage key is used. It works without browser storage. Export/import accepts only this prototype's validated JSON envelope and asks before replacing sample progress. Sample data never includes credentials.

## Run and verify

Serve the parent folder:

    python3 -m http.server 3212 --bind 127.0.0.1 --directory /tmp/roadmap-ux-concepts-2026-10-03

`browser-check.cjs` exercises the linked workflows and review fixes, renders every coverage shortcut, captures five theme previews, and checks responsive widths. It uses the existing local Playwright/Chromium installation. `verification.json` records the last result. Screenshots live beside these files.
