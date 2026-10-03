(function () {
  'use strict';

  const steps = ['destination', 'starting_point', 'learning_rhythm', 'preview'];
  const labels = ['Destination', 'Starting point', 'Learning rhythm', 'Track preview'];
  const stages = ['Reading your Trail', 'Balancing depth and breadth', 'Designing practice', 'Validating the Track'];
  const levels = [
    ['Beginner', 'A fresh start', 'Start with the foundations and build confidence.'],
    ['Intermediate', 'Some familiar ground', 'Connect what you know through guided practice.'],
    ['Advanced', 'Ready to go deeper', 'Sharpen your judgment with more demanding work.'],
  ];
  const times = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day'];
  const paces = [
    ['steady', 'Steady pace', 'A sustainable rhythm with room to reflect.'],
    ['balanced', 'Balanced pace', 'A mix of focused practice and breathing room.'],
    ['focused', 'Focused pace', 'Move through each week with extra momentum.'],
  ];
  const questions = [
    { id: 'q1', text: 'Which statement returns only customers based in Lahore?', options: ['SELECT * FROM customers WHERE city = \'Lahore\';', 'SELECT city FROM customers;', 'DELETE FROM customers WHERE city = \'Lahore\';'] },
    { id: 'q2', text: 'What can happen to your row count when you join customers to their orders?', options: ['Each customer always appears once.', 'A customer can appear once for each matching order.', 'All unmatched orders are deleted.'] },
    { id: 'q3', text: 'Explain how you would find customers who have never placed an order. What would you check before trusting the result?' },
  ];
  function data(P) {
    const defaults = { topicName: '', level: 'Beginner', selfReportedLevel: 'Beginner', time: '30 min/day', pace: 'steady', answers: {}, placementResult: null, error: '', choicesReady: true, providerReady: true, generationStatus: 'running', generationStage: 1, adjustmentOpen: false, adjustment: '', appliedAdjustment: '', previewVersion: 1 };
    if (!P.state.onboarding || typeof P.state.onboarding !== 'object') P.state.onboarding = {};
    const s = P.state.onboarding;
    Object.keys(defaults).forEach(key => { if (s[key] === undefined) s[key] = defaults[key]; });
    s.providerReady = Boolean(P.state.settings?.ready);
    if (!s.answers || typeof s.answers !== 'object') s.answers = {};
    return s;
  }

  function currentStep(P) {
    const aliases = { starting: 'starting_point', rhythm: 'learning_rhythm', generation: 'generating', placement_result: 'placement' };
    let step = aliases[P.params.step] || P.params.step || 'destination';
    if (!P.params.step && ['pending', 'error', 'resume', 'retrying', 'queued'].includes(P.params.scenario)) step = 'generating';
    if (!P.params.step && P.params.scenario === 'placement-result') step = 'placement';
    return [...steps, 'placement', 'generating'].includes(step) ? step : 'destination';
  }

  function applyScenario(P, s, step) {
    const key = step + ':' + (P.params.scenario || '');
    if (key === s._route) return;
    s._route = key;
    s.error = '';
    s.choicesReady = true;
    const scenario = P.params.scenario;
    if (step !== 'destination' && !s.topicName) s.topicName = 'SQL Foundations';
    if (scenario === 'provider-missing') { s.providerReady = false; if (P.state.settings) P.state.settings.ready = false; }
    if (scenario === 'choices-error') s.choicesReady = false;
    if (scenario === 'placement-error') s.error = 'The placement check could not be prepared. Please retry or skip it.';
    if (scenario === 'placement-result' || P.params.step === 'placement_result') s.placementResult = sampleResult(s, 'Intermediate');
    if (scenario === 'pending' || scenario === 'queued') { s.generationStatus = scenario === 'queued' ? 'queued' : 'running'; s.generationStage = 1; }
    if (scenario === 'retrying') { s.generationStatus = 'retrying'; s.generationStage = 2; }
    if (scenario === 'error') { s.generationStatus = 'failed'; s.error = 'The Track could not be prepared. Your choices are saved; try again when ready.'; }
    if (scenario === 'resume') s.generationStatus = 'paused';
    if (scenario === 'confirm-error') s.error = 'Your Track could not be added to the Trail. Please retry.';
    if (scenario === 'tweak-error') s.error = 'The Track could not be adjusted. Your current preview is still here.';
  }

  function sampleResult(s, recommended) {
    return { recommendedLevel: recommended, requestedLevel: s.selfReportedLevel || s.level, feedback: 'You can connect tables confidently. A little practice with missing matches will make your results more reliable.', gaps: ['Revisit how NULL behaves when a joined row is missing.'], scores: [{ title: 'Filtering a table', score: 100, feedback: 'You selected the matching rows without changing the data.' }, { title: 'Join cardinality', score: 80, feedback: 'Check whether one customer can have multiple orders.' }, { title: 'Missing matches', score: 65, feedback: 'Use a LEFT JOIN and check a non-nullable order key.' }] };
  }

  function outline(s) {
    const chapters = [
      { id: 1, title: 'Query Grove', description: s.previewVersion % 2 ? 'Turn data into answers, one useful query at a time.' : 'A refreshed path through selecting, filtering, and sorting data.', outcomes: [['core', 'Select the columns needed for a report'], ['core', 'Filter rows with an inclusive boundary'], ['core', 'Sort results for a clear report'], ['breadth', 'Explain a query in plain language']], sessions: [
        { id: 101, title: 'Think in tables', time: 15, outcomes: ['Identify rows, columns, and a primary key'], prerequisites: [], type: 'Read · Practice' },
        { id: 102, title: 'Find the interesting rows', time: 20, outcomes: ['Use SELECT and WHERE to answer a specific question'], prerequisites: ['Think in tables'], type: 'Practice · Explain' },
        { id: 103, title: 'The boundary matters', time: 12, outcomes: ['Use >= 100 to keep exactly 100', 'Sort the matching rows by total_spent descending', 'Explain the different jobs of WHERE and ORDER BY'], prerequisites: ['Find the interesting rows'], type: 'Read · Worked example · Choice · Ordering · Short answer · Reflection' },
        { id: 104, title: 'Build a customer report', time: 15, outcomes: ['Deliver names and cities for customers who spent at least 100', 'Verify that June, Amina, and Theo remain in descending spend order'], prerequisites: ['The boundary matters'], type: 'Build', build: 'A filtered and sorted customer report, with the SQL and checks for customers who spent exactly 100 or 0.' },
      ] },
      { id: 2, title: 'Report Workshop', description: 'Connect tables, group results, and explain useful reports.', outcomes: [['core', 'Choose INNER JOIN or LEFT JOIN for a question'], ['core', 'Check join cardinality and missing matches'], ['breadth', 'Explain how table relationships shape analysis']], sessions: [
        { id: 201, title: 'Every match tells a story', time: 20, outcomes: ['Explain one-to-many relationships and repeated rows'], prerequisites: ['Build a customer report'], type: 'Explain · Reflect' },
        { id: 202, title: 'Keep the missing matches', time: 20, outcomes: ['Use LEFT JOIN and IS NULL to find absent relationships'], prerequisites: ['Every match tells a story'], type: 'Practice · Quiz' },
        { id: 203, title: 'Build a customer order report', time: 30, outcomes: ['Create a report that handles customers with no orders', 'Verify the report against sample records'], prerequisites: ['Keep the missing matches'], type: 'Build', build: 'A customer order report with an explanation of the join and a check for missing matches.' },
      ] },
      { id: 3, title: 'Reliable Reports', description: 'Validate your queries and communicate what the result means.', outcomes: [['core', 'Aggregate data at the intended grain'], ['core', 'Explain and validate a useful analytical result']], sessions: [
        { id: 301, title: 'Count, group, and compare', time: 20, outcomes: ['Use GROUP BY and aggregate functions'], prerequisites: ['Build a customer order report'], type: 'Read · Practice' },
        { id: 302, title: 'Check before you conclude', time: 20, outcomes: ['Spot duplicate counts and explain limitations'], prerequisites: ['Count, group, and compare'], type: 'Explain · Reflect' },
        { id: 303, title: 'Build a small business insight', time: 30, outcomes: ['Deliver a clear business insight backed by a validated query'], prerequisites: ['Check before you conclude'], type: 'Build', build: 'A short analysis, the SQL behind it, and evidence that the result answers the question.' },
      ] },
    ];
    if (s.appliedAdjustment) chapters[1].sessions.splice(2, 0, { id: 204, title: 'Extra practice: check the missing matches', time: 15, outcomes: ['Explain and verify missing matches in a small query'], prerequisites: ['Keep the missing matches'], type: 'Practice · Reflect', request: s.appliedAdjustment });
    return chapters;
  }

  function head(P, eyebrow, title, description) {
    return `<header class="page-head"><div><p class="eyebrow">${P.escape(eyebrow)}</p><h1>${P.escape(title)}</h1><p class="muted">${P.escape(description)}</p></div></header>`;
  }

  function button(P, label, action, variant, extra) {
    return `<button type="button" class="button ${variant || 'secondary'}" data-setup-action="${P.escape(action)}" ${extra || ''}>${P.escape(label)}</button>`;
  }

  function nav(P, s, step) {
    const active = step === 'placement' ? 1 : step === 'generating' ? 3 : steps.indexOf(step);
    return `<nav class="steps setup-steps" aria-label="Learning path setup">${labels.map((label, i) => `<button type="button" class="choice ${i === active ? 'is-selected' : ''}" data-setup-step="${steps[i]}" ${i === active ? 'aria-current="step"' : ''}><span class="pill">${i < active ? P.icon('check') : i + 1}</span><span>${label}</span></button>`).join('')}</nav>`;
  }

  function sidebar(P, s, step) {
    const e = P.escape;
    const pace = (paces.find(p => p[0] === s.pace) || paces[0])[1];
    return `<aside class="stack setup-aside" aria-label="Your Trail setup"><article class="card stack"><div class="row">${P.icon('leaf')}<span class="eyebrow">Your Trail</span></div><h2>${e(s.topicName || 'A little curiosity. A clear direction.')}</h2><p class="muted">A finite Track with useful outcomes, practical Builds, and room to reflect.</p><div class="divider"></div><div class="setup-summary"><span class="muted">Starting point</span><button type="button" class="button quiet" data-setup-step="starting_point">${e(s.level)}</button><span class="muted">Study window</span><button type="button" class="button quiet" data-setup-step="learning_rhythm">${e(s.time)}</button><span class="muted">Pace</span><span>${e(pace)}</span></div>${s.placementResult ? `<span class="pill">${P.icon('check')} Placement check complete</span>` : ''}</article><article class="card stack"><div class="row">${P.icon('flag')}<h3>A path with an ending</h3></div><p class="muted">Learn an idea. Try it. Make something useful. Revisit it at your Chapter checkpoint.</p><div class="row setup-cycle" aria-label="Learn, practice, build">${P.icon('book')}<span>Learn</span>${P.icon('arrow')}${P.icon('table')}<span>Practice</span>${P.icon('arrow')}${P.icon('spark')}<span>Build</span></div></article>${step !== 'destination' ? button(P, 'Back to my Trails', 'dashboard', 'quiet') : ''}</aside>`;
  }

  function destination(P, s) {
    return `${head(P, 'A fresh Trail', 'What do you want to be able to do?', 'Choose a destination such as React, Calculus, negotiation, or Japanese. We will shape a finite Track around it.')}<section class="panel stack"><div class="row setup-feature">${P.icon('leaf')}<div><p class="eyebrow">Begin with a destination</p><h2>Let curiosity choose the direction.</h2></div></div><form id="setup-destination-form" class="stack" novalidate><label class="field" for="setup-destination">Your learning destination<input class="input" id="setup-destination" name="destination" value="${P.escape(s.topicName)}" placeholder="For example, SQL Foundations" maxlength="100" autocomplete="off" ${s.error ? 'aria-invalid="true" aria-describedby="setup-error"' : ''}></label><div class="row setup-suggestions" aria-label="Sample destinations">${['SQL Foundations', 'React', 'Japanese', 'Negotiation'].map(topic => `<button type="button" class="choice" data-setup-topic="${P.escape(topic)}">${P.escape(topic)}</button>`).join('')}</div><button type="submit" class="button primary">Set my destination ${P.icon('arrow')}</button><p class="muted">Keep it focused. You can explore another destination when this Track is complete.</p></form></section>`;
  }

  function starting(P, s) {
    return `${head(P, 'Step 2 of 4', 'Choose your starting point', 'A quick self-report is enough. You can take the placement check if you would like a second signal.')}<section class="panel stack">${!s.choicesReady ? `<div class="empty-state"><h2>We could not load your starting choices.</h2><p class="muted">Your destination is saved.</p>${button(P, 'Retry choices', 'retry-choices')}</div>` : `<fieldset class="stack"><legend>What is your starting point?</legend><div class="grid-3">${levels.map(level => `<button type="button" class="choice setup-level ${s.level === level[0] ? 'is-selected' : ''}" data-setup-level="${level[0]}" aria-pressed="${s.level === level[0]}">${P.icon(level[0] === 'Beginner' ? 'leaf' : level[0] === 'Intermediate' ? 'book' : 'spark')}<strong>${level[0]}</strong><span>${level[1]}</span><span class="muted">${level[2]}</span></button>`).join('')}</div></fieldset><div class="card stack"><div class="row">${P.icon('hint')}<h3>Would you like to verify that starting point?</h3></div><p class="muted">A short check helps choose a useful starting depth. You can keep your self-reported level afterward.</p><div class="row">${button(P, 'Take a placement check', 'start-placement')}${button(P, 'Skip placement check', 'skip-placement', 'primary')}</div></div>`}${button(P, 'Back to destination', 'back-destination', 'quiet')}</section>`;
  }

  function placement(P, s) {
    const e = P.escape;
    const r = s.placementResult;
    return `${head(P, 'A second signal', 'Optional placement check', 'Your answers help us choose a useful starting depth. This is only a recommendation.')}<section class="panel stack">${r ? `<div class="alert success" role="status"><div class="row">${P.icon('check')}<h2>A good starting point is ${e(r.recommendedLevel)}</h2></div><p>Your self-reported level was ${e(r.requestedLevel)}.</p></div><p class="muted">${e(r.feedback)}</p><p class="muted">Sample check result · this recommendation is simulated locally.</p><div class="card stack"><h3>A little more practice here</h3><ul class="outcome-list">${r.gaps.map(g => `<li>${e(g)}</li>`).join('')}</ul></div><div class="stack" aria-label="Question feedback">${r.scores.map(score => `<article class="card"><div class="row"><strong>${e(score.title)}</strong><span class="pill">${score.score}%</span></div><p class="muted">${e(score.feedback)}</p></article>`).join('')}</div><div class="row">${button(P, 'Continue with ' + r.recommendedLevel, 'accept-placement', 'primary')}${button(P, 'Keep my self-reported level', 'skip-placement')}</div>${button(P, 'Try the check again', 'start-placement', 'quiet')}` : s.error && P.params.scenario === 'placement-error' ? `<p class="muted">Your starting choices are safe.</p><div class="row">${button(P, 'Retry placement check', 'retry-placement', 'primary')}${button(P, 'Skip this check', 'skip-placement')}</div>` : `<form id="setup-placement-form" class="stack" novalidate>${questions.map((q, index) => `<fieldset class="card stack"><legend>${index + 1}. ${e(q.text)}</legend>${q.options ? q.options.map((option, i) => `<label class="choice setup-answer"><input type="radio" name="${q.id}" value="${i}" ${String(s.answers[q.id]) === String(i) ? 'checked' : ''}><span>${e(option)}</span></label>`).join('') : `<textarea class="textarea" name="${q.id}" rows="4" maxlength="2000" aria-label="${e(q.text)}" placeholder="Explain your reasoning in your own words…">${e(s.answers[q.id] || '')}</textarea>`}</fieldset>`).join('')}<div class="row"><button type="submit" class="button primary">Check my starting point ${P.icon('arrow')}</button>${button(P, 'Skip this check', 'skip-placement', 'quiet')}</div></form><p class="muted">Sample placement questions for SQL Foundations. The recommendation is simulated locally.</p>`}</section>`;
  }

  function rhythm(P, s) {
    const minutes = { '15 min/day': 15, '30 min/day': 30, '1 hour/day': 60, '2+ hours/day': 120 }[s.time] || 30;
    const weekly = minutes * 7;
    return `${head(P, 'Step 3 of 4', 'Set your learning rhythm', 'Choose a daily study window and a pace that feels sustainable. You can adjust your schedule for future Tracks.')}<section class="panel stack"><fieldset class="stack"><legend>Daily study time</legend><div class="row">${times.map(time => `<button type="button" class="choice ${s.time === time ? 'is-selected' : ''}" data-setup-time="${time}" aria-pressed="${s.time === time}">${time}</button>`).join('')}</div></fieldset><fieldset class="stack"><legend>Preferred pace</legend><div class="grid-3">${paces.map(pace => `<button type="button" class="choice setup-level ${s.pace === pace[0] ? 'is-selected' : ''}" data-setup-pace="${pace[0]}" aria-pressed="${s.pace === pace[0]}">${P.icon(pace[0] === 'steady' ? 'leaf' : 'spark')}<strong>${pace[1]}</strong><span class="muted">${pace[2]}</span></button>`).join('')}</div></fieldset><article class="card stack"><div class="row"><h3>A week at your rhythm</h3><span class="pill">${weekly >= 60 ? (weekly / 60).toFixed(1).replace(/\.0$/, '') + ' hours' : weekly + ' minutes'} / week</span></div><div class="setup-week" aria-label="Daily study window across a sample week">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => `<div class="stat"><span class="muted">${day}</span><span class="pill">${P.icon(index === 5 ? 'hint' : index === 6 ? 'leaf' : 'book')}</span><small>${minutes >= 120 ? '120+' : minutes}m</small></div>`).join('')}</div><p class="muted">A visual guide to your daily window. Practice and reflection both count as learning.</p></article><div class="row">${button(P, 'Back', 'back-starting')}${button(P, 'Build my Track', 'build-track', 'primary', !s.providerReady ? 'disabled' : '')}</div></section>`;
  }

  function generation(P, s) {
    const pending = ['running', 'queued', 'retrying'].includes(s.generationStatus);
    const count = Math.max(0, Math.min(4, s.generationStage));
    return `${head(P, 'Step 4 of 4', pending ? 'Designing your Track…' : 'Your Track is ready to resume', pending ? 'We are shaping practice around your destination and available time. You can leave and return while it continues.' : 'Your setup is saved. Resume preparation or check whether a saved preview is ready.')}<section class="panel stack"><div class="row setup-feature">${P.icon('spark')}<div><h2>${P.escape(s.topicName)}</h2><p class="muted">${P.escape(s.level)} · ${P.escape(s.time)}</p></div><span class="pill">${s.generationStatus === 'retrying' ? 'Retrying · attempt 2 of 3' : s.generationStatus === 'queued' ? 'Queued' : pending ? 'In progress' : 'Choices saved'}</span></div><div class="progress-track" role="progressbar" aria-label="Track design progress" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${count}"><span style="width:${count * 25}%"></span></div><ol class="stack setup-stage-list">${stages.map((stage, i) => `<li class="card row">${P.icon(i < count ? 'check' : i === count ? 'spark' : 'leaf')}<span>${stage}</span><span class="muted">${i < count ? 'Complete' : i === count && pending ? 'In progress' : 'Up next'}</span></li>`).join('')}</ol>${!pending ? `<div class="row">${button(P, 'Resume Track generation', 'resume-generation', 'primary')}${button(P, 'Check again', 'check-generation')}</div>` : `<div class="row">${button(P, 'Check Track status', 'check-generation')}${button(P, 'Return to my Trails', 'dashboard', 'quiet')}</div>`}<details class="card"><summary>Prototype controls · sample only</summary><p class="muted">Advance the local fixture to explore preparation and recovery. No provider is called.</p><div class="row">${button(P, 'Complete sample generation', 'finish-generation', 'primary')}${button(P, 'Advance design stage', 'advance-generation')}${button(P, 'Simulate interruption', 'fail-generation')}</div>${s.previewVersion > 1 ? button(P, 'Return to saved preview', 'saved-preview', 'quiet') : ''}</details></section>`;
  }

  function preview(P, s) {
    const e = P.escape;
    const chapters = outline(s);
    const pace = (paces.find(p => p[0] === s.pace) || paces[0])[1];
    return `${head(P, 'Track preview', (s.topicName || 'SQL Foundations') + ' Track preview', 'This Track focuses on the outcomes you will use most, then adds a smaller breadth set to connect them to the wider field.')}<p class="pill">9 outcomes · 7 core · 2 breadth</p><div class="grid-3"><article class="card stat">${P.icon('book')}<strong>3 Chapters</strong><p class="muted">Each ends with a checkpoint that revisits its core outcomes.</p></article><article class="card stat">${P.icon('leaf')}<strong>${e(s.time)}</strong><p class="muted">${e(pace)} · room to revisit important ideas.</p></article><article class="card stat">${P.icon('spark')}<strong>3 practical Builds</strong><p class="muted">Apply the outcomes in useful, concrete work.</p></article></div>${s.appliedAdjustment ? `<div class="alert success" role="status">${P.icon('check')} Preview adjusted: ${e(s.appliedAdjustment)}<p class="muted">The sample adds an extra practice Session in Chapter 2. Your request is saved locally.</p></div>` : ''}<details class="card"><summary>A little wider context · 2 breadth outcomes</summary><ul class="outcome-list">${chapters.flatMap(ch => ch.outcomes.filter(o => o[0] === 'breadth')).map(o => `<li>${e(o[1])}</li>`).join('')}</ul></details><div class="stack" aria-label="Track outline">${chapters.map((chapter, i) => `<details class="panel setup-chapter" ${i === 0 ? 'open' : ''}><summary><span class="eyebrow">Chapter ${i + 1}</span><strong>${e(chapter.title)}</strong><span class="muted">${chapter.sessions.length} Sessions · ${chapter.outcomes.length} outcomes ${chapter.sessions.some(session => session.build) ? '· 1 Build' : ''}</span></summary><div class="stack setup-chapter-body"><p class="muted">${e(chapter.description)}</p><ul class="outcome-list">${chapter.outcomes.map(o => `<li><span class="pill">${o[0] === 'breadth' ? 'Breadth' : 'Core'}</span> ${e(o[1])}</li>`).join('')}</ul>${chapter.sessions.map((session, index) => `<details class="card setup-session"><summary><span class="muted">Session ${index + 1}</span><strong>${e(session.title)}</strong><span class="row"><span class="muted">About ${session.time} min</span>${session.build ? `<span class="pill">${P.icon('spark')} Build</span>` : ''}</span></summary><div class="stack setup-session-body"><h4>Outcomes</h4><ul class="outcome-list">${session.outcomes.map(o => `<li>${e(o)}</li>`).join('')}</ul>${session.prerequisites.length ? `<h4>Session prerequisites</h4><ul class="outcome-list">${session.prerequisites.map(o => `<li>${e(o)}</li>`).join('')}</ul>` : ''}<p class="muted">${e(session.type)}</p>${session.request ? `<p class="muted">Your focus: ${e(session.request)}</p>` : ''}${session.build ? `<div class="alert success"><strong>Build:</strong> ${e(session.build)}<p>Submit your work, review feedback, and revise until the core outcomes are demonstrated.</p></div>` : ''}</div></details>`).join('')}<div class="row">${P.icon('flag')}<span class="muted">Chapter checkpoint after all Sessions and required Builds</span></div></div></details>`).join('')}</div><section class="panel stack" aria-label="Confirm Track">${s.adjustmentOpen ? `<form id="setup-adjust-form" class="stack" novalidate><label class="field" for="setup-adjustment">What would you like to adjust?<textarea class="textarea" id="setup-adjustment" name="adjustment" rows="3" maxlength="2000" placeholder="For example, give me more practice with missing matches">${e(s.adjustment)}</textarea></label><div class="row"><button type="submit" class="button primary">Apply adjustments</button>${button(P, 'Refresh preview', 'regenerate')}${button(P, 'Cancel', 'cancel-adjustment', 'quiet')}</div></form>` : `<div class="row">${button(P, 'Add to my Trail', 'confirm', 'primary')}${button(P, 'Adjust plan', 'adjust')}${button(P, 'Not now', 'back-rhythm', 'quiet')}</div>`}<p class="muted">You can begin with one Session. This Track has a clear finish and a next step when you are ready.</p></section>`;
  }

  function render(P) {
    const s = data(P);
    const step = currentStep(P);
    applyScenario(P, s, step);
    const views = { destination, starting_point: starting, placement, learning_rhythm: rhythm, generating: generation, preview };
    return `<div class="setup-view stack"><style>.setup-view .setup-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:26px;align-items:start}.setup-view .setup-main{min-width:0}.setup-view .setup-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.setup-view .setup-steps button{display:flex;align-items:center;gap:10px;text-align:left}.setup-view .setup-summary{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.setup-view .setup-level{display:flex;flex-direction:column;align-items:flex-start;gap:10px;text-align:left;min-height:155px}.setup-view .setup-answer{display:flex;gap:12px;align-items:center}.setup-view .setup-answer span{overflow-wrap:anywhere}.setup-view .setup-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.setup-view .setup-feature{align-items:center}.setup-view .setup-feature>svg{width:46px;height:46px;flex-shrink:0}.setup-view .setup-feature>div{flex:1}.setup-view .setup-chapter>summary,.setup-view .setup-session>summary{display:flex;flex-wrap:wrap;align-items:center;gap:12px;cursor:pointer}.setup-view .setup-chapter>summary strong,.setup-view .setup-session>summary strong{flex:1;min-width:150px}.setup-view .setup-chapter-body,.setup-view .setup-session-body{padding-top:20px}.setup-view .setup-stage-list{padding-left:0;list-style:none}.setup-view .setup-stage-list li>span:first-of-type{flex:1}.setup-view .setup-cycle{flex-wrap:wrap;font-size:.8rem}.setup-view fieldset{min-width:0;margin:0;padding:0;border:0}.setup-view legend{margin-bottom:12px;font-weight:600}.setup-view .setup-suggestions{flex-wrap:wrap}.setup-view .setup-aside .button{white-space:normal}@media(max-width:1100px){.setup-view .setup-layout{grid-template-columns:minmax(0,1fr)}.setup-view .setup-aside{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.setup-view .setup-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.setup-view .setup-aside{display:flex}.setup-view .setup-week{gap:3px}.setup-view .setup-week .stat{padding:7px 2px}.setup-view .setup-week .pill{padding:5px}.setup-view .setup-session>summary{align-items:flex-start}.setup-view .setup-stage-list li{flex-wrap:wrap}.setup-view .setup-stage-list li>span:last-of-type{width:100%;padding-left:30px}}</style>${nav(P, s, step)}<div class="setup-layout"><main class="setup-main stack">${!s.providerReady ? `<div class="alert warning" role="alert">Connect an AI provider in Settings before creating a Track. ${P.button('Open Settings', 'settings', {}, 'quiet')}<p class="muted">Sample-only provider state.</p>${button(P, 'Use configured sample', 'configure-sample', 'secondary')}</div>` : ''}${s.error ? `<div class="alert danger" id="setup-error" role="alert">${P.escape(s.error)}</div>` : ''}${views[step](P, s)}</main>${sidebar(P, s, step)}</div></div>`;
  }

  function bind(P) {
    const s = data(P);
    const goStep = step => { s.error = ''; P.go('onboarding', { step }); };
    P.on('[data-setup-step]', 'click', event => goStep(event.currentTarget.dataset.setupStep));
    P.on('[data-setup-topic]', 'click', event => { s.topicName = event.currentTarget.dataset.setupTopic; P.refresh(); P.q('#setup-destination')?.focus(); });
    P.on('#setup-destination', 'input', event => { s.topicName = event.currentTarget.value; P.save(); });
    P.on('#setup-destination-form', 'submit', event => {
      event.preventDefault();
      const value = String(P.q('#setup-destination')?.value || '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim();
      if (!value || value.length > 100) { s.error = !value ? 'Please enter a destination for your learning Trail.' : 'That destination is too long. Use 100 characters or fewer.'; P.refresh(); P.q('#setup-destination')?.focus(); return; }
      s.topicName = value;
      goStep('starting_point');
    });
    P.on('[data-setup-level]', 'click', event => { s.level = event.currentTarget.dataset.setupLevel; s.selfReportedLevel = s.level; s.placementResult = null; s.error = ''; P.refresh(); });
    P.on('[data-setup-time]', 'click', event => { s.time = event.currentTarget.dataset.setupTime; P.refresh(); });
    P.on('[data-setup-pace]', 'click', event => { s.pace = event.currentTarget.dataset.setupPace; P.refresh(); });
    P.on('#setup-placement-form input', 'change', event => { s.answers[event.currentTarget.name] = event.currentTarget.value; P.save(); });
    P.on('#setup-placement-form textarea', 'input', event => { s.answers[event.currentTarget.name] = event.currentTarget.value; P.save(); });
    P.on('#setup-placement-form', 'submit', event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      questions.forEach(q => { s.answers[q.id] = String(values.get(q.id) || ''); });
      if (questions.some(q => !s.answers[q.id].trim())) { s.error = 'Please answer every placement question.'; P.refresh(); return; }
      const score = Number(s.answers.q1 === '0') + Number(s.answers.q2 === '1');
      s.placementResult = sampleResult(s, score === 2 ? 'Intermediate' : 'Beginner');
      s.error = '';
      P.refresh();
    });
    P.on('#setup-adjustment', 'input', event => { s.adjustment = event.currentTarget.value; P.save(); });
    P.on('#setup-adjust-form', 'submit', event => {
      event.preventDefault();
      const request = String(P.q('#setup-adjustment')?.value || '').trim();
      if (!request) { s.error = 'Describe the adjustment you would like to make.'; P.refresh(); P.q('#setup-adjustment')?.focus(); return; }
      s.appliedAdjustment = request.slice(0, 2000);
      s.adjustment = '';
      s.adjustmentOpen = false;
      s.error = '';
      P.refresh();
      P.toast('Sample preview adjusted. Your request is saved.');
    });
    P.on('[data-setup-action]', 'click', event => {
      const action = event.currentTarget.dataset.setupAction;
      if (action === 'dashboard') { if (currentStep(P) === 'generating' && P.state.trailStage !== 'active') P.state.trailStage = 'generating'; P.go('trail'); return; }
      if (action === 'back-destination') return goStep('destination');
      if (action === 'back-starting') return goStep('starting_point');
      if (action === 'back-rhythm') return goStep('learning_rhythm');
      if (action === 'retry-choices') { s.choicesReady = true; s.error = ''; }
      if (action === 'configure-sample') { s.providerReady = true; if (P.state.settings) P.state.settings.ready = true; P.toast('The sample provider is ready.'); }
      if (action === 'start-placement' || action === 'retry-placement') { s.answers = {}; s.placementResult = null; return goStep('placement'); }
      if (action === 'skip-placement') { s.level = s.selfReportedLevel || s.level; return goStep('learning_rhythm'); }
      if (action === 'accept-placement') { s.level = s.placementResult?.recommendedLevel || s.level; return goStep('learning_rhythm'); }
      if (action === 'build-track' || action === 'regenerate') {
        if (!s.providerReady) { s.error = 'Connect an AI provider in Settings before creating a Track.'; P.refresh(); return; }
        if (action === 'regenerate') s.previewVersion += 1;
        s.generationStatus = 'running'; s.generationStage = 1; s.adjustmentOpen = false;
        P.state.trailStage = 'generating';
        return goStep('generating');
      }
      if (action === 'resume-generation') { s.generationStatus = 'running'; s.error = ''; P.toast('Sample Track generation resumed.'); }
      if (action === 'advance-generation' || action === 'check-generation') {
        if (s.generationStatus === 'paused' || s.generationStatus === 'failed') { s.generationStatus = 'running'; s.error = ''; P.toast('Saved setup found. Sample preparation resumed.'); }
        else { s.generationStage += 1; if (s.generationStage >= 4) { s.generationStatus = 'ready'; P.state.trailStage = 'draft'; return goStep('preview'); } P.toast('Sample Track status updated.'); }
      }
      if (action === 'finish-generation' || action === 'saved-preview') { s.generationStatus = 'ready'; s.generationStage = 4; P.state.trailStage = 'draft'; return goStep('preview'); }
      if (action === 'fail-generation') { s.generationStatus = 'failed'; s.error = 'The Track could not be prepared. Your choices are saved; try again when ready.'; }
      if (action === 'adjust') { s.adjustmentOpen = true; s.error = ''; }
      if (action === 'cancel-adjustment') { s.adjustmentOpen = false; s.error = ''; }
      if (action === 'confirm') {
        P.state.trailStage = 'active';
        P.state.priorTrack = { title: P.state.trailTitle, completedSessions: [...P.state.completedSessions], checkpointPassed: P.state.checkpointPassed };
        P.state.trailTitle = s.topicName || 'SQL Foundations';
        P.state.completedSessions = [];
        P.state.checkpointPassed = false;
        delete P.state.session;
        delete P.state.checkpoint;
        s.error = '';
        P.save();
        P.celebrate();
        P.toast('Your Track is ready. Begin with your next Session.');
        P.go('trail');
        return;
      }
      P.refresh();
      if (action === 'adjust') P.q('#setup-adjustment')?.focus();
    });
    P.on('.setup-chapter, .setup-session', 'toggle', () => P.save());
  }

  window.FullAppViews = window.FullAppViews || {};
  window.FullAppViews.onboarding = { title: 'Set up your Trail', render, bind };
})();
