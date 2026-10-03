# Full-app Playground Prototype Plan

Goal: Extend the approved V2 look into a connected HTML prototype of every existing app flow, with five complete themes.

Scope: Temporary local prototype; fixture data only. Preserve Trail → Track → Chapter → Session terminology, session completion, Build assessment, chapter checkpoint rules, due reviews, and continuation. Proposed XP rewards are explicitly identified in the coverage view.

Architecture: One static HTML shell, shared semantic CSS tokens, a small hash router and fixture state, and three independently authored view modules. Everything runs locally without dependencies or app API calls.

Files:
- index.html: Accessible common shell, dialogs, mobile navigation, theme control.
- app.css: V2 visual language, semantic light/dark/ocean/lavender/ember themes, responsive views and reduced motion.
- app.js: Shared helpers, fixture state, hash routes, Trail dashboard, coverage view, interactions.
- setup.js: Destination, starting point/placement, learning rhythm, generation/recovery, Track preview/tweak/confirm.
- learning.js: All six activity types, tutor, session resume, Build submit/revise/pass, checkpoint intro/questions/results/retakes.
- practice.js: Review queue/session/results, Track completion/continuation preview, settings/themes/export/import.
- browser-check.cjs: Connected workflow checks, theme switching, narrow-screen layout, browser errors and local-state recovery.
- README.md: Launch instructions and mapping of prototypes to actual components.

Execution:
1. Audit each existing flow and retain its important state branches.
2. Author common theme tokens and view interface, then build independent flow groups concurrently.
3. Connect setup → Trail → Session → Build → checkpoint → reviews → continuation, preserving back/resume paths.
4. Add a coverage drawer with direct entries for every module and important sample state.
5. Verify connected interactions, five themes, mobile widths, keyboard dialogs, reduced motion and fixture reset.
6. Deliver the running preview and a concise explanation of coverage and prototype limitations.

Shared view interface:
- Modules register window.FullAppViews.<name> = { title, render(P), bind(P) }.
- Names: onboarding, session, checkpoint, reviews, review, continuation, settings.
- P.state.<module> is initialized by the module if missing. Fixtures must remain JSON serializable.
- P.params contains current URL query parameters as a plain object.
- P.go(name, params={}) navigates. Root names trail, coverage are also available.
- P.refresh() renders current view and saves sample state; P.save() only saves.
- P.q(selector), P.on(selector, event, handler) query/bind DOM safely.
- P.escape(value) escapes HTML; P.icon(name) returns an inline SVG.
- P.button(label, view, params={}, variant='primary') returns a navigation button.
- P.toast(message), P.celebrate(), P.setTheme(name) provide shared effects.
- P.dialog(title, bodyHTML, bindCallback) opens a native dialog; P.closeDialog() closes it.
- P.themes = [{id:'grove',name:'Playground',mode:'light'}, {id:'midnight',name:'Midnight',mode:'dark'}, {id:'tide',name:'Ocean',mode:'dark'}, {id:'lilac',name:'Lavender',mode:'light'}, {id:'ember',name:'Ember',mode:'dark'}].
- Templates use shared CSS classes: page-head, eyebrow, muted, panel, card, grid-2, grid-3, stack, row, button primary/secondary/quiet, field, input, textarea, select, choice, pill, progress-track, alert success/warning/danger, steps, empty-state, stat, divider, activity-layout, workbench, table-wrap, outcome-list.
- All submitted text must be escaped; never use credentials, real storage or app APIs.
- data-go='<view>' + data-params='<escaped JSON>' is globally handled by the root router. Modules bind all other controls themselves.
- Parent owns shared files. Setup owns setup.js only; learning owns learning.js only; practice owns practice.js only. Modules can append a namespaced style block returned in their template only if shared CSS cannot express a view.
