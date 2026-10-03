# Playground V2 flow ledger

This ledger keeps the visual system mapped to the production ownership and API contracts. Prototype interactions are reference-only; each row names the real state machine that must remain authoritative.

| Flow / state | Production owner | API contract | Regression coverage | Browser scenario |
|---|---|---|---|---|
| Empty Trail and topic creation | `Dashboard`, `OnboardingFlow` | `GET /api/topics`, `POST /api/topics` | `Dashboard.test.jsx`, dashboard backend | empty dashboard → create topic |
| Active Trail / Today action | `Dashboard`, `TrailMap`, `TodayCard` | dashboard `nextAction` | `Dashboard.test.jsx`, `TrailMap.test.jsx` | Session, review, checkpoint and setup actions |
| Chapter expansion and locks | `ChapterCard`, `TrailMap` | dashboard chapter/session state | dashboard tests | current, complete and locked chapters |
| Onboarding destination | `OnboardingFlow` | topic create | `CurriculumFlow.test.jsx` | invalid, long, capacity and valid destination |
| Starting point and setup choices | `OnboardingFlow` | setup questions/profile values | `setupQuestions.test.js` | Beginner, Intermediate, Advanced, retry |
| Placement assessment | `OnboardingFlow` | placement start/submit/profile | placement and curriculum suites | written target/stretch answers, expiry, retry |
| Durable curriculum generation | `OnboardingFlow`, `curriculumStream.js` | 202 + SSE/poll recovery | curriculum-stream/recovery suites | disconnect, retry, stale job, saved draft |
| Curriculum preview/tweak/confirm | `CurriculumConfirmation` | draft/tweak/confirm | `CurriculumFlow.test.jsx`, curriculum backend | disclosure, tweak failure, confirm failure |
| Session loading/locked/error | `SessionPage` | lesson GET + access response | `SessionPage.test.jsx` | missing, locked, malformed, network error |
| Six activity formats | `SessionPlayer`, `ActivityRenderer`, block components | activities complete/submit | `ActivityBlocks.test.jsx`, activity runtime | keyboard choice/order/written/reflection |
| Held feedback and review | `SessionPlayer`, `SessionComplete` | one mutation per block | `SessionPlayer.test.jsx` | feedback hold → Continue, final handoff |
| Tutor guide | `TutorSidecar` | chat SSE | `TutorSidecar.test.jsx`, lessons backend | split chunks, error, retry, mobile focus |
| Practical Build | `ArtifactPanel`, `BuildExperience` | artifact submit/read | `ArtifactPanel.test.jsx`, artifacts backend | evidence, import, fail, revise, pass |
| Chapter checkpoint | `ExamPanel`, checkpoint surfaces | exam start/read/save/submit | `ExamPanel.test.jsx`, exams backend | autosave, pause, full submit |
| Targeted checkpoint retake | `ExamPanel`, checkpoint results | partial start/submit | checkpoint/exam suites | core/breadth repair and successive retest |
| Retrieval queue | `ReviewQueue` | review list/count/start | `ReviewQueue.test.jsx`, SRS backend | empty, due, overdue, retry |
| Retrieval session | `ReviewSession`, review controller | one complete batch submit | `ReviewSession.test.jsx`, SRS backend | answer, edit, submit failure, feedback |
| Continuation Track | `ContinuationFlow` | readiness/generate/tweak/confirm | `ContinuationFlow.test.jsx`, continuation backend | ineligible, generated, stale profile, conflict |
| Settings and themes | `SettingsPage`, `ThemeSwitcher` | settings/catalog/Codex APIs | settings/theme suites | 16 themes, storage failure, auth states |
| Backup export/restore | settings data controls, data route | backup v2 transaction | export/import suites | malformed/private/failed restore and retry |
| Offline/global recovery | `OfflineIndicator`, `ErrorBoundary`, `SupportPage` | health/recovery endpoints | offline/error/support suites | offline banner, safe details, return to Trail |

For every row, availability, completion, scores, scheduling and mastery effects come from the server response. Theme changes may replace presentation views, but must not remount the owning controller or discard drafts, answers, feedback, navigation, or pending recovery work.
