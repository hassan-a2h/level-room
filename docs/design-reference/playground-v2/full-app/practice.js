(function () {
  'use strict';
  const V = window.FullAppViews = window.FullAppViews || {};
  const clone = value => JSON.parse(JSON.stringify(value));
  const today = '2026-10-03';
  const reviewItems = [
    { id: 'joins', title: 'Join without losing rows', chapter: 'Query Grove', track: 'SQL Foundations', due: '2026-10-01', overdue: true, cumulative: false },
    { id: 'aggregate', title: 'Group, count, and explain', chapter: 'Query Grove', track: 'SQL Foundations', due: today, overdue: false, cumulative: false },
    { id: 'cumulative', title: 'Connect the whole Track', chapter: 'SQL Foundations · all Chapters', track: 'SQL Foundations', due: today, overdue: false, cumulative: true }
  ];
  const questions = [
    { id: 'q1', item: 'joins', chapter: 'Query Grove', title: 'Join without losing rows', text: 'You need every customer, including customers with no orders. Which join would you choose, and why?', hints: ['left', 'all customer', 'every customer', 'null'], model: 'Use a LEFT JOIN from customers to orders. It keeps every customer; unmatched order columns become NULL.' },
    { id: 'q2', item: 'aggregate', chapter: 'Query Grove', title: 'Group, count, and explain', text: 'What is the difference between WHERE and HAVING when you group orders by customer?', hints: ['before', 'after', 'group', 'aggregate'], model: 'WHERE filters individual rows before grouping. HAVING filters groups after aggregate values have been computed.' },
    { id: 'q3', item: 'cumulative', chapter: 'Whole Track', title: 'Connect the whole Track', text: 'A LEFT JOIN returns a customer with no orders. Why does COUNT(orders.id) return zero while COUNT(*) can return one?', hints: ['null', 'row', 'count', 'non-null'], model: 'COUNT(orders.id) counts non-NULL order IDs, so an unmatched customer has zero. COUNT(*) counts the retained joined row, including its NULL order values.' }
  ];
  const providers = [
    { id: 'openai', name: 'OpenAI API', auth: 'key', models: ['Balanced demo model', 'Fast demo model'] },
    { id: 'anthropic', name: 'Anthropic API', auth: 'key', models: ['Balanced demo model', 'Fast demo model'] },
    { id: 'gemini', name: 'Google Gemini API', auth: 'key', models: ['Balanced demo model', 'Fast demo model'] },
    { id: 'openai-codex', name: 'Codex subscription', auth: 'signin', models: ['Codex demo model'] }
  ];
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  const rhythms = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day'];
  function reviewFixture() {
    return { items: clone(reviewItems), filter: 'all', phase: 'question', active: false, index: 0, answers: {}, feedback: {}, history: [], error: '', notice: '' };
  }
  function continuationFixture() {
    return { phase: 'gated', direction: 'deepen', level: 'Intermediate', rhythm: '30 min/day', draft: null, draftProfile: null, adjustment: '', error: '', confirmed: false };
  }
  function settingsFixture() {
    return { provider: '', model: '', reasoning: 'medium', ready: false, saved: false, error: '', notice: '' };
  }
  function init(P) {
    if (!P.state.reviews) P.state.reviews = reviewFixture();
    if (!P.state.continuation) P.state.continuation = continuationFixture();
    if (!P.state.settings) P.state.settings = settingsFixture();
  }
  function e(P, value) { return P.escape(value == null ? '' : String(value)); }
  function btn(label, id, variant = 'primary', disabled = false) {
    return `<button type="button" class="button ${variant}" id="${id}"${disabled ? ' disabled' : ''}>${label}</button>`;
  }
  function header(P, eyebrow, title, description, action = '') {
    return `<div class="page-head"><div><p class="eyebrow">${e(P, eyebrow)}</p><h1>${e(P, title)}</h1><p class="muted">${e(P, description)}</p></div>${action}</div>`;
  }
  function alert(P, text, kind = 'warning') { return text ? `<div class="alert ${kind}" role="${kind === 'danger' ? 'alert' : 'status'}">${e(P, text)}</div>` : ''; }
  function progress(value, max, label) {
    return `<div class="progress-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><span style="display:block;width:${Math.max(0, Math.min(100, value / max * 100))}%;height:100%;background:var(--accent);border-radius:inherit"></span></div>`;
  }
  function opts(P, choices, selected) { return choices.map(value => `<option${value === selected ? ' selected' : ''}>${e(P, value)}</option>`).join(''); }
  function scenario(P, module, apply) {
    init(P);
    const name = P.params.scenario || '';
    const key = `${module}:${name}`;
    if (P.state[module]._scenario !== key) {
      P.state[module]._scenario = key;
      if (name) apply(name, P.state[module]);
    }
  }
  function startReview(P) {
    const r = P.state.reviews;
    if (!r.items.length) return P.go('reviews', { scenario: 'empty' });
    Object.assign(r, { active: true, index: 0, phase: 'question', answers: {}, feedback: {}, error: '', sessionQuestions: clone(questions), notice: '' });
    P.save();
    P.go('review');
  }
  function finishReview(P) {
    const r = P.state.reviews;
    const qs = r.sessionQuestions || questions;
    const score = Math.round(qs.reduce((n, q) => n + (r.feedback[q.id]?.score || 0), 0) / qs.length);
    const remembered = qs.filter(q => r.feedback[q.id]?.score >= 80).length;
    r.result = { score, remembered, total: qs.length, passed: score >= 80, next: score >= 80 ? '2026-10-10' : '2026-10-04', accelerated: score >= 80, rows: qs.map(q => ({ chapter: q.chapter, title: q.title, score: r.feedback[q.id]?.score || 0, next: r.feedback[q.id]?.score >= 80 ? '2026-10-10' : '2026-10-04' })) };
    r.history.push(clone(r.result));
    r.items = [];
    r.active = false;
    r.phase = 'summary';
    P.save();
    P.refresh();
  }
  V.reviews = {
    title: 'Retrieval practice',
    render(P) {
      scenario(P, 'reviews', (name, r) => {
        if (name === 'empty') r.items = [];
        if (name === 'error') r.error = 'Practice could not be loaded. Try again to reload the sample queue.';
        if (name === 'start-error') { r.items = clone(reviewItems); r.error = ''; r.startError = true; }
        if (name === 'due' || name === 'overdue' || name === 'cumulative') { r.items = clone(reviewItems); r.error = ''; r.startError = false; r.filter = name === 'due' ? 'all' : name; }
      });
      const r = P.state.reviews;
      const overdue = r.items.filter(i => i.overdue).length;
      const items = r.items.filter(i => r.filter === 'all' || (r.filter === 'overdue' ? i.overdue : i.cumulative));
      let body = '';
      if (P.params.scenario === 'error' && r.error) body = `<section class="panel empty-state"><span aria-hidden="true">↻</span><h2>Practice could not be loaded</h2><p class="muted">Your learning progress is still here.</p>${btn('Try again', 'queue-retry')}</section>`;
      else if (!r.items.length) body = `<section class="panel empty-state"><span aria-hidden="true">🌿</span><h2>No retrieval practice due today</h2><p class="muted">Your queue is clear. Continue your Trail, and practice will return when it is ready.</p>${P.button('Continue Trail', 'trail')}</section>${r.history.length ? `<section class="card"><h3>Next scheduled practice</h3><p class="muted">${e(P, r.history.at(-1).next)} · ${r.history.at(-1).accelerated ? 'Your next review is spaced further.' : 'A shorter interval gives these ideas another chance to settle.'}</p></section>` : ''}`;
      else body = `<section class="panel row"><div><h2>${r.items.length} retrieval items ready</h2><p class="muted">A little recall now makes your next Session easier.</p></div>${btn(r.active ? 'Resume retrieval practice' : 'Start retrieval practice', 'review-start')}</section><div class="row" role="group" aria-label="Filter practice"><button type="button" class="button ${r.filter === 'all' ? 'primary' : 'secondary'}" data-review-filter="all" aria-pressed="${r.filter === 'all'}">All due (${r.items.length})</button><button type="button" class="button ${r.filter === 'overdue' ? 'primary' : 'secondary'}" data-review-filter="overdue" aria-pressed="${r.filter === 'overdue'}">Overdue (${overdue})</button><button type="button" class="button ${r.filter === 'cumulative' ? 'primary' : 'secondary'}" data-review-filter="cumulative" aria-pressed="${r.filter === 'cumulative'}">Cumulative</button></div><div class="stack" role="list" aria-label="Reviews due">${items.length ? items.map(i => `<article class="card row" role="listitem"><div><p class="eyebrow">Track · ${e(P, i.track)}</p><h3>${e(P, i.title)}</h3><p class="muted">Chapter · ${e(P, i.chapter)}</p><p class="muted">${i.overdue ? 'Ready to revisit from' : 'Scheduled for'} ${e(P, i.due)}</p></div><div class="stack"><span class="pill">${i.overdue ? 'Overdue · no penalty' : 'Due today'}</span>${i.cumulative ? '<span class="pill">Cumulative review</span>' : ''}</div></article>`).join('') : '<div class="card empty-state"><p>No items in this filter.</p></div>'}</div>`;
      return `<div class="stack">${header(P, 'Keep it growing', 'Retrieval practice', 'Remember, connect, and carry your learning forward.', P.button('Back to Trail', 'trail', {}, 'quiet'))}${alert(P, r.error, 'danger')}${alert(P, r.notice, 'success')}${body}<p class="muted">Sample queue · October 3, 2026. Practice feedback and scheduling are simulated.</p></div>`;
    },
    bind(P) {
      P.on('#queue-retry', 'click', () => { Object.assign(P.state.reviews, { items: clone(reviewItems), error: '' }); P.go('reviews'); });
      P.on('#review-start', 'click', () => {
        const r = P.state.reviews;
        if (r.startError) { r.startError = false; r.error = 'Could not start practice. Your queue is still here; try again.'; return P.refresh(); }
        if (r.active) { r.error = ''; return P.go('review'); }
        startReview(P);
      });
      document.querySelectorAll('[data-review-filter]').forEach(button => button.addEventListener('click', () => { P.state.reviews.filter = button.dataset.reviewFilter; P.refresh(); }));
    }
  };
  V.review = {
    title: 'Review session',
    render(P) {
      scenario(P, 'reviews', (name, r) => {
        if (name === 'missing') { r.active = false; r.phase = 'question'; return; }
        r.active = true; r.index = 0; r.phase = 'question'; r.sessionQuestions = clone(questions); r.error = ''; r.answers = {}; r.feedback = {};
        if (name === 'feedback') { r.phase = 'feedback'; r.answers.q1 = 'A LEFT JOIN keeps all customers and returns NULL for unmatched orders.'; r.feedback.q1 = { score: 100, label: 'Remembered', explanation: questions[0].model }; }
        if (name === 'summary') { r.feedback = { q1: { score: 100 }, q2: { score: 100 }, q3: { score: 50 } }; r.phase = 'summary'; r.active = false; r.result = { score: 83, remembered: 2, total: 3, passed: true, next: '2026-10-10', accelerated: true, rows: questions.map((q, i) => ({ chapter: q.chapter, title: q.title, score: i === 2 ? 50 : 100, next: i === 2 ? '2026-10-04' : '2026-10-10' })) }; }
        if (name === 'save-error') { r.answers.q1 = 'A LEFT JOIN keeps every customer.'; r.error = 'Could not save this answer. Your response is still here. Try again.'; }
      });
      const r = P.state.reviews;
      if (r.phase === 'summary' && r.result) {
        const result = r.result;
        return `<div class="stack">${header(P, 'Practice complete', result.passed ? 'Ready to continue' : 'Revisit when ready', 'Every answer helps shape what you practice next.')}<section class="panel"><div class="grid-3"><div class="stat"><strong>${result.score}%</strong><span>Overall recall</span></div><div class="stat"><strong>${result.remembered}/${result.total}</strong><span>Remembered</span></div><div class="stat"><strong>${e(P, result.next.slice(5))}</strong><span>Next retrieval practice</span></div></div><div class="divider"></div>${alert(P, result.accelerated ? 'Next review spaced further for remembered ideas.' : 'More practice scheduled for tomorrow. You can keep learning at your own pace.', result.passed ? 'success' : 'warning')}<h3>By Chapter</h3><div class="stack">${result.rows.map(row => `<div class="card row"><div><strong>${e(P, row.chapter)}</strong><p class="muted">${e(P, row.title)} · next ${e(P, row.next)}</p></div><span class="pill">${row.score}%</span></div>`).join('')}</div><div class="row">${P.button('Continue Trail', 'trail')}${P.button('Back to review queue', 'reviews', {}, 'secondary')}</div></section><p class="muted">Demo feedback · this sample uses a simple keyword rubric to demonstrate the review flow.</p></div>`;
      }
      if (!r.active || !r.sessionQuestions?.length) return `<div class="stack">${header(P, 'Retrieval practice', 'No active review session', 'Start a session from your queue to continue.')}<section class="panel empty-state">${P.button('Back to review queue', 'reviews')}</section></div>`;
      const qs = r.sessionQuestions;
      const q = qs[Math.min(r.index, qs.length - 1)];
      const fb = r.feedback[q.id];
      const content = r.phase === 'feedback' && fb ? `<section class="panel stack" aria-live="polite"><span class="pill">${e(P, fb.label)}</span><h2>${fb.score >= 80 ? 'That idea is taking root.' : 'One more connection to make.'}</h2><p>${e(P, fb.explanation)}</p><div class="card"><p class="eyebrow">Your answer</p><p>${e(P, r.answers[q.id])}</p></div><p class="muted">Demo feedback · practice is for learning; this does not affect your Chapter checkpoint.</p>${btn(r.index === qs.length - 1 ? 'See practice summary' : 'Next question', 'review-next')}</section>` : `<section class="panel stack"><div class="row"><span class="pill">${e(P, q.chapter)}</span><span class="muted">${e(P, q.title)}</span></div><h2>${e(P, q.text)}</h2><form id="review-form" class="stack"><label class="field" for="review-answer">Your answer<textarea class="textarea" id="review-answer" rows="5" maxlength="3000" placeholder="Recall it in your own words…" required>${e(P, r.answers[q.id] || '')}</textarea></label><div class="row"><p class="muted">Try recalling before looking back.</p><button class="button primary" id="review-submit" type="submit"${!r.answers[q.id]?.trim() ? ' disabled' : ''}>Submit answer</button></div></form></section>`;
      return `<div class="stack">${header(P, 'Retrieval practice', `Question ${r.index + 1} of ${qs.length}`, 'Small acts of recall. Stronger roots.', btn('Back to queue', 'review-cancel', 'quiet'))}<section class="card stack">${progress(r.index + 1, qs.length, 'Review question progress')}<p class="muted">${qs.length} questions · covering two Chapter reviews and one cumulative review.</p></section>${alert(P, r.error, 'danger')}${content}</div>`;
    },
    bind(P) {
      const r = P.state.reviews;
      P.on('#review-answer', 'input', event => { const q = r.sessionQuestions[r.index]; r.answers[q.id] = event.target.value; P.q('#review-submit').disabled = !event.target.value.trim(); P.save(); });
      P.on('#review-form', 'submit', event => {
        event.preventDefault();
        const q = r.sessionQuestions[r.index];
        const answer = (P.q('#review-answer')?.value || '').trim();
        if (!answer) return;
        r.answers[q.id] = answer;
        const count = q.hints.filter(hint => answer.toLowerCase().includes(hint)).length;
        const score = count >= 2 ? 100 : count === 1 ? 50 : 0;
        r.feedback[q.id] = { score, label: score === 100 ? 'Remembered' : score > 0 ? 'Almost' : 'Revisit', explanation: q.model };
        r.phase = 'feedback'; r.error = ''; P.refresh();
      });
      P.on('#review-next', 'click', () => { if (r.index === r.sessionQuestions.length - 1) return finishReview(P); r.index += 1; r.phase = 'question'; P.refresh(); });
      P.on('#review-cancel', 'click', () => P.dialog('Leave this practice session?', '<p>Your unfinished answers stay in this prototype so you can resume. The review schedule changes only after completing practice.</p><div class="row">' + btn('Keep practicing', 'review-keep', 'secondary') + btn('Return to queue', 'review-leave') + '</div>', () => {
        P.on('#review-keep', 'click', () => P.closeDialog());
        P.on('#review-leave', 'click', () => { P.closeDialog(); r.notice = 'Practice paused. Resume whenever you are ready.'; P.save(); P.go('reviews'); });
      }));
    }
  };
  function draftFor(c) {
    const deepen = c.direction === 'deepen';
    return { title: deepen ? 'SQL in the Wild' : 'From Queries to Data Stories', minutes: c.rhythm === '15 min/day' ? 120 : c.rhythm === '30 min/day' ? 180 : 240, chapters: [
      { title: deepen ? 'Reliable queries' : 'Data with a point of view', summary: deepen ? 'Window functions, clear query plans, and readable transformations.' : 'Choose meaningful measures and turn query results into a useful visual story.', core: deepen ? 'Explain and write a window function' : 'Define metrics that answer a real question', breadth: deepen ? 'Read a simple query plan' : 'Choose a chart for the evidence', build: deepen ? 'A trustworthy customer report' : 'A small customer insight dashboard', sessions: 4 },
      { title: deepen ? 'From query to product' : 'A reproducible analysis', summary: 'Connect robust SQL to practical work you can explain and revisit.', core: 'Validate edge cases and document assumptions', breadth: 'Use a small data quality checklist', build: deepen ? 'A reusable reporting view' : 'An analysis handoff with clear assumptions', sessions: 4 }
    ] };
  }
  function createDraft(P) {
    const c = P.state.continuation;
    c.draft = draftFor(c); c.draftProfile = { level: c.level, rhythm: c.rhythm, direction: c.direction }; c.phase = 'preview'; c.error = ''; c.confirmed = false;
    P.refresh();
  }
  function profile(P, c) {
    return `<div class="grid-2"><label class="field" for="continuation-level">Learner level<select id="continuation-level" class="select">${opts(P, levels, c.level)}</select></label><label class="field" for="continuation-rhythm">Time commitment<select id="continuation-rhythm" class="select">${opts(P, rhythms, c.rhythm)}</select></label></div>`;
  }
  function completionSummary(P, c) {
    return `<section class="panel stack"><div class="row"><div><p class="eyebrow">Track complete</p><h2>SQL Foundations is part of you now.</h2><p class="muted">Your completed Track stays on your Trail as the next plan takes shape.</p></div>${P.button('Review this Track', 'reviews', {}, 'secondary')}</div><div class="grid-2"><div class="card"><h3>Chapters completed</h3><ul class="outcome-list"><li>Query Grove</li><li>Report Workshop</li><li>Reliable Reports</li></ul><h3>Outcomes practiced</h3><ul class="outcome-list"><li>Read and filter a dataset</li><li>Join tables without losing information</li><li>Explain aggregates and check results</li></ul></div><div class="card"><h3>Builds completed · 3</h3><ul class="outcome-list"><li>Customer report</li><li>Joined customer and orders report</li><li>A tested reporting query</li></ul><h3>Strengths to build on</h3><p class="muted">Clear queries · useful joins · practical explanations</p><h3>Focus areas to carry forward</h3><p class="muted">NULL edge cases · performance intuition</p></div></div></section>`;
  }
  V.continuation = {
    title: 'Your next Track',
    render(P) {
      scenario(P, 'continuation', (name, c) => {
        c.error = ''; c.confirmed = false;
        if (name === 'complete' || name === 'eligible' || name === 'options') c.phase = 'options';
        if (name === 'gated' || name === 'ineligible') c.phase = 'gated';
        if (name === 'generating') c.phase = 'generating';
        if (name === 'error' || name === 'generation-error') { c.phase = 'error'; c.error = 'The next Track could not be prepared. Your completed learning is safe.'; }
        if (name === 'preview' || name === 'stale' || name === 'tweak-error' || name === 'confirm-error') { c.draft = draftFor(c); c.draftProfile = { level: c.level, rhythm: c.rhythm, direction: c.direction }; c.phase = 'preview'; if (name === 'stale') c.rhythm = c.rhythm === '15 min/day' ? '30 min/day' : '15 min/day'; if (name === 'tweak-error') c.error = 'The plan could not be adjusted. Your current preview is still here.'; if (name === 'confirm-error') c.error = 'The Track could not be added. Your preview is still here.'; }
        if (name === 'confirmed') { c.phase = 'confirmed'; c.confirmed = true; c.draft = draftFor(c); }
      });
      const c = P.state.continuation;
      if (!P.params.scenario) {
        if (P.state.trailStage !== 'complete') c.phase = 'gated';
        else if (c.phase === 'gated') c.phase = 'options';
      }
      const lead = header(P, 'Your Trail continues', c.phase === 'gated' ? 'Finish this Track first' : 'Choose your next stretch', 'A finite Track, shaped by what you can do and what you want to try.', P.button('Back to Trail', 'trail', {}, 'quiet'));
      if (c.phase === 'gated') return `<div class="stack">${lead}<section class="panel stack"><span class="pill">SQL Foundations · in progress</span><h2>Your next Track unlocks after the final checkpoint.</h2><p class="muted">Complete every Session, pass required Builds, and pass each Chapter checkpoint. Retrieval practice can continue at your own pace.</p><ul class="outcome-list"><li>Current Chapter: Query Grove</li><li>Sessions 101 and 102 complete</li><li>Next Session: 103 · a practical Build</li></ul><div class="row">${P.button('Continue current Track', 'trail')}${P.button('Review queue', 'reviews', {}, 'secondary')}</div></section></div>`;
      if (c.phase === 'confirmed') return `<div class="stack">${lead}<section class="panel empty-state"><span aria-hidden="true">✦</span><p class="eyebrow">New Track ready</p><h2>${e(P, c.draft?.title || 'Your next Track')} is on your Trail.</h2><p class="muted">Your completed SQL Foundations Track and its evidence stay with you.</p>${P.button('Open my Trail', 'trail')}</section></div>`;
      let body;
      if (c.phase === 'generating') body = `<section class="panel stack" aria-live="polite"><p class="eyebrow">Demo generation</p><h2>Designing your next Track</h2><p class="muted">The local sample draft is ready to reveal. No provider request is made.</p><ol class="steps"><li>Reading your Trail</li><li>Balancing depth and breadth</li><li>Designing practical Sessions</li><li>Validating the plan</li></ol><div class="row">${btn('Show Track preview', 'continuation-reveal')}${btn('Cancel generation', 'continuation-cancel', 'secondary')}</div></section>`;
      else if (c.phase === 'error') body = `<section class="panel stack"><h2>Your next Track is still within reach.</h2>${alert(P, c.error)}<div class="row">${btn('Retry generation', 'continuation-generate')}${P.button('Back to my Trail', 'trail', {}, 'secondary')}</div></section>`;
      else if (c.phase === 'preview' && c.draft) {
        const stale = !c.draftProfile || c.draftProfile.level !== c.level || c.draftProfile.rhythm !== c.rhythm || c.draftProfile.direction !== c.direction;
        body = `<section class="panel stack"><div><p class="eyebrow">Your next finite Track</p><h2>${e(P, c.draft.title)}</h2><p class="muted">About 80% core learning and 20% useful neighboring ideas.</p></div><div class="row"><span class="pill">Builds on joins</span><span class="pill">Builds on aggregates</span><span class="pill">Carries NULL edge cases forward</span></div><div class="grid-2">${c.draft.chapters.map((ch, index) => `<article class="card stack"><p class="eyebrow">Chapter ${index + 1}</p><h3>${e(P, ch.title)}</h3><p class="muted">${e(P, ch.summary)}</p><ul class="outcome-list"><li>${e(P, ch.core)} <span class="pill">Core</span></li><li>${e(P, ch.breadth)} <span class="pill">Breadth</span></li></ul><p class="muted">${ch.sessions} Sessions · 1 practical Build</p><strong>Build: ${e(P, ch.build)}</strong></article>`).join('')}</div><div class="card stack"><h3>A rhythm that fits your week</h3><p class="muted">8 Sessions · about ${c.draft.minutes} minutes · planned for ${e(P, c.draftProfile?.rhythm || c.rhythm)}.</p>${profile(P, c)}</div>${stale ? `<div class="alert warning" role="status"><p>Your pace changed. Update the plan before adding it to your Trail.</p>${btn('Update plan for this rhythm', 'continuation-refresh', 'secondary')}</div>` : ''}${alert(P, c.error, 'danger')}${c.draft.adjustment ? `<div class="alert success">Adjustment applied: ${e(P, c.draft.adjustment)}</div>` : ''}<div class="row">${btn('Add to my Trail', 'continuation-confirm', 'primary', stale)}${btn('Adjust plan', 'continuation-adjust', 'secondary')}${P.button('Not now', 'trail', {}, 'quiet')}</div></section>`;
      } else body = `<section class="panel stack"><h2>Where would you like to grow?</h2><div class="grid-2"><button type="button" class="choice" data-direction="deepen" aria-pressed="${c.direction === 'deepen'}"><strong>Deepen</strong><span class="muted">Use SQL with more precision, reliability, and confidence.</span></button><button type="button" class="choice" data-direction="broaden" aria-pressed="${c.direction === 'broaden'}"><strong>Broaden</strong><span class="muted">Connect SQL to analysis, visuals, and useful data stories.</span></button></div>${profile(P, c)}<p class="muted">Both directions keep roughly 80% core learning and 20% breadth.</p><div class="row">${btn('Design my next Track', 'continuation-generate')}${P.button('Not now', 'trail', {}, 'quiet')}</div></section>`;
      return `<div class="stack">${lead}${completionSummary(P, c)}${body}</div>`;
    },
    bind(P) {
      const c = P.state.continuation;
      document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => { c.direction = button.dataset.direction; P.refresh(); }));
      P.on('#continuation-level', 'change', event => { c.level = event.target.value; P.refresh(); });
      P.on('#continuation-rhythm', 'change', event => { c.rhythm = event.target.value; P.refresh(); });
      P.on('#continuation-generate', 'click', () => { c.phase = 'generating'; c.error = ''; P.refresh(); });
      P.on('#continuation-reveal', 'click', () => createDraft(P));
      P.on('#continuation-cancel', 'click', () => { c.phase = c.draft ? 'preview' : 'options'; c.error = ''; P.refresh(); });
      P.on('#continuation-refresh', 'click', () => createDraft(P));
      P.on('#continuation-adjust', 'click', () => P.dialog('Adjust this plan', `<p class="muted">Tell us what to change. This demo keeps your current preview until you apply the local revision.</p><form id="continuation-adjust-form" class="stack"><label class="field" for="continuation-adjustment">What would you like to adjust?<textarea id="continuation-adjustment" class="textarea" rows="4" maxlength="1000" required placeholder="For example: more work with NULL edge cases">${e(P, c.adjustment)}</textarea></label><div class="row"><button class="button primary" type="submit">Apply adjustment</button>${btn('Keep current plan', 'continuation-keep', 'secondary')}</div></form>`, () => {
        P.on('#continuation-keep', 'click', () => P.closeDialog());
        P.on('#continuation-adjustment', 'input', event => { c.adjustment = event.target.value; P.save(); });
        P.on('#continuation-adjust-form', 'submit', event => {
          event.preventDefault(); const request = (P.q('#continuation-adjustment')?.value || '').trim(); if (!request) return;
          c.draft = draftFor(c); c.draft.adjustment = request; c.draft.chapters[0].summary = `A focused practice sequence shaped around your request: ${request}`; c.draftProfile = { level: c.level, rhythm: c.rhythm, direction: c.direction }; c.adjustment = ''; c.error = ''; P.closeDialog(); P.refresh(); P.toast('Sample plan adjusted.');
        });
      }));
      P.on('#continuation-confirm', 'click', () => {
        const stale = !c.draftProfile || c.draftProfile.level !== c.level || c.draftProfile.rhythm !== c.rhythm;
        if (stale || !c.draft) return;
        P.state.priorTrack = { title: P.state.trailTitle, completedSessions: [...P.state.completedSessions], checkpointPassed: P.state.checkpointPassed };
        P.state.trailTitle = c.draft.title;
        P.state.completedSessions = [];
        P.state.checkpointPassed = false;
        P.state.trailStage = 'active';
        delete P.state.session;
        delete P.state.checkpoint;
        c.phase = 'confirmed'; c.confirmed = true; c.error = ''; P.save(); P.celebrate(); P.go('trail'); P.toast('Your sample next Track is ready.');
      });
    }
  };
  function exportEnvelope(P) {
    const state = clone(P.state);
    delete state.theme;
    return { format: 'mastery-trail-prototype', version: 1, exportedAt: new Date().toISOString(), state };
  }
  function validateEnvelope(value, P) {
    if (!value || value.format !== 'mastery-trail-prototype' || value.version !== 1 || !value.state || typeof value.state !== 'object' || Array.isArray(value.state)) throw new Error('Choose a JSON fixture exported by this Playground prototype. App database backups are not supported.');
    const walk = (node, depth = 0) => {
      if (depth > 20) throw new Error('That fixture is too deeply nested.');
      if (node === null || typeof node === 'boolean' || typeof node === 'string' || (typeof node === 'number' && Number.isFinite(node))) return;
      if (Array.isArray(node)) { if (node.length > 10000) throw new Error('That fixture is too large.'); node.forEach(child => walk(child, depth + 1)); return; }
      if (typeof node !== 'object') throw new Error('That fixture contains unsupported data.');
      Object.entries(node).forEach(([key, child]) => { if (['__proto__', 'prototype', 'constructor'].includes(key) || /api.?key|secret|password|credential|access.?token/i.test(key)) throw new Error('Fixtures must contain sample progress only, with no credentials.'); walk(child, depth + 1); });
    };
    walk(value.state);
    const root = value.state;
    const validSessions = sessions => Array.isArray(sessions) && sessions.every(id => [101, 102, 103, 104].includes(id)) && new Set(sessions).size === sessions.length;
    if (!['active', 'new', 'complete', 'generating', 'draft'].includes(root.trailStage) || typeof root.trailTitle !== 'string' || !root.trailTitle.trim() || root.trailTitle.length > 300 || !validSessions(root.completedSessions) || typeof root.checkpointPassed !== 'boolean') throw new Error('The sample fixture is missing valid Trail progress. Export a complete fixture from this prototype.');
    if (root.priorTrack !== undefined && (!root.priorTrack || typeof root.priorTrack !== 'object' || Array.isArray(root.priorTrack) || typeof root.priorTrack.title !== 'string' || !root.priorTrack.title.trim() || !validSessions(root.priorTrack.completedSessions) || typeof root.priorTrack.checkpointPassed !== 'boolean')) throw new Error('The earlier sample Track is incomplete.');
    if (value.state.theme !== undefined && !P.themes.some(theme => theme.id === value.state.theme)) throw new Error('The sample fixture contains an unknown theme.');
    const knownKeys = new Set([...Object.keys(P.state), 'setup', 'onboarding', 'learning', 'session', 'checkpoint', 'reviews', 'continuation', 'settings', 'priorTrack']);
    if (Object.keys(value.state).some(key => !knownKeys.has(key))) throw new Error('The sample fixture contains an unsupported section.');
    const r = value.state.reviews;
    const c = value.state.continuation;
    const s = value.state.settings;
    if (!r || !Array.isArray(r.items) || !Array.isArray(r.history) || !r.answers || !r.feedback || !Number.isInteger(r.index) || r.index < 0 || !['question', 'feedback', 'summary'].includes(r.phase)) throw new Error('The sample review data is incomplete.');
    if (r.items.some(item => !item || !reviewItems.some(known => known.id === item.id) || typeof item.title !== 'string' || typeof item.chapter !== 'string')) throw new Error('The sample review items are invalid.');
    if (r.active && (!Array.isArray(r.sessionQuestions) || r.sessionQuestions.length !== 3 || r.index >= r.sessionQuestions.length || r.sessionQuestions.some(q => !q || !questions.some(known => known.id === q.id) || !Array.isArray(q.hints) || q.hints.some(hint => typeof hint !== 'string')))) throw new Error('The sample practice session is incomplete.');
    if (r.phase === 'summary' && (!r.result || !Array.isArray(r.result.rows) || typeof r.result.next !== 'string' || !Number.isFinite(r.result.score) || !Number.isFinite(r.result.remembered) || !Number.isFinite(r.result.total) || r.result.rows.some(row => !row || !Number.isFinite(row.score)))) throw new Error('The sample practice results are incomplete.');
    if (!c || !levels.includes(c.level) || !rhythms.includes(c.rhythm) || !['deepen', 'broaden'].includes(c.direction) || !['gated', 'options', 'generating', 'error', 'preview', 'confirmed'].includes(c.phase)) throw new Error('The sample continuation data is invalid.');
    if ((c.phase === 'preview' || c.phase === 'confirmed') && (!c.draft || !Array.isArray(c.draft.chapters) || c.draft.chapters.some(ch => !ch || typeof ch.title !== 'string'))) throw new Error('The sample next Track is incomplete.');
    if (!s || typeof s.provider !== 'string' || (s.provider && !providers.some(p => p.id === s.provider)) || typeof s.model !== 'string' || typeof s.ready !== 'boolean') throw new Error('The sample settings are invalid.');
    const provider = providers.find(p => p.id === s.provider);
    if (provider && !provider.models.includes(s.model)) throw new Error('The sample provider model is invalid.');
    const compatible = (incoming, current, depth = 0) => {
      if (depth > 12 || current === undefined || current === null) return;
      if (Array.isArray(current)) { if (!Array.isArray(incoming)) throw new Error('The sample progress has an invalid list.'); return; }
      if (typeof current !== typeof incoming || (typeof current === 'object' && (incoming === null || Array.isArray(incoming)))) throw new Error('The sample progress has an invalid value.');
      if (typeof current === 'object') Object.keys(current).forEach(key => { if (Object.hasOwn(incoming, key)) compatible(incoming[key], current[key], depth + 1); });
    };
    Object.entries(value.state).forEach(([key, incoming]) => { if (!['reviews', 'continuation', 'settings', 'theme'].includes(key)) compatible(incoming, P.state[key]); });
    return value.state;
  }
  function importDialog(P, envelope) {
    P.dialog('Replace prototype sample progress?', '<p>This demo import replaces only the sample progress in this HTML prototype. Your application data is not connected.</p><p class="muted">Cancel to keep the current sample.</p><div class="row">' + btn('Cancel restore', 'settings-import-cancel', 'secondary') + btn('Replace sample progress', 'settings-import-confirm') + '</div>', () => {
      P.on('#settings-import-cancel', 'click', () => P.closeDialog());
      P.on('#settings-import-confirm', 'click', () => {
        try {
          const sample = validateEnvelope(envelope, P);
          const preservedTheme = P.state.theme;
          Object.keys(P.state).forEach(key => { if (key !== 'theme') delete P.state[key]; });
          Object.entries(clone(sample)).forEach(([key, value]) => { if (key !== 'theme') P.state[key] = value; });
          if (preservedTheme !== undefined) P.state.theme = preservedTheme;
          P.state.settings.notice = 'Demo import complete. Prototype sample progress restored.'; P.state.settings.error = '';
          P.closeDialog(); P.refresh(); P.toast('Sample fixture restored.');
        } catch (error) { P.closeDialog(); P.state.settings.error = error.message; P.refresh(); }
      });
    });
  }
  V.settings = {
    title: 'Settings',
    render(P) {
      scenario(P, 'settings', (name, s) => { if (name === 'error') s.error = 'Sample settings could not be saved. Your current choices are still here.'; if (name === 'connected') Object.assign(s, { provider: 'openai-codex', model: 'Codex demo model', ready: true, saved: true, error: '' }); });
      const s = P.state.settings;
      const provider = providers.find(p => p.id === s.provider);
      const selectedTheme = P.state.theme || document.documentElement.dataset.theme || 'grove';
      return `<div class="stack">${header(P, 'Make it yours', 'Settings', 'A learning space that feels good to return to.', P.button('Back to Trail', 'trail', {}, 'quiet'))}${alert(P, s.error, 'danger')}${alert(P, s.notice, 'success')}<section class="panel stack" aria-labelledby="appearance-title"><h2 id="appearance-title">Appearance</h2><p class="muted">Five complete themes for every page, activity, and dialog.</p><div class="grid-3">${P.themes.map(theme => `<button type="button" class="choice practice-theme" data-theme-choice="${e(P, theme.id)}" aria-pressed="${selectedTheme === theme.id}"><span class="practice-theme-preview" data-theme="${e(P, theme.id)}" aria-hidden="true"><span class="practice-theme-sidebar"></span><span class="practice-theme-window"><span></span><span></span><span></span></span></span><strong>${e(P, theme.name)}</strong><span class="muted">${theme.mode === 'dark' ? 'Dark' : 'Light'} · ${selectedTheme === theme.id ? 'Selected' : 'Try this theme'}</span></button>`).join('')}</div></section><section class="panel stack"><h2>Learning preferences</h2><p class="muted">Your weekly rhythm and learner level shape each Track. Adjust them in a Track preview before adding it to your Trail.</p><div class="row">${P.button('Plan a new Track', 'onboarding', {}, 'secondary')}${P.button('View current Track', 'trail', {}, 'quiet')}</div></section><section class="panel stack" aria-labelledby="connection-title"><div class="row"><h2 id="connection-title">AI connection</h2><span class="pill">Local demo only</span></div><p class="muted">Provider names demonstrate the setup flow. Saving and connecting change this prototype's sample state. No account, API, credential, or network connection is used.</p><form id="settings-form" class="stack"><div class="grid-2"><label class="field" for="settings-provider">Provider<select id="settings-provider" class="select"><option value="">Select a provider</option>${providers.map(p => `<option value="${p.id}"${s.provider === p.id ? ' selected' : ''}>${p.name}</option>`).join('')}</select></label><label class="field" for="settings-model">Model<select id="settings-model" class="select"${!provider ? ' disabled' : ''}>${provider ? opts(P, provider.models, s.model) : '<option value="">Select a provider first</option>'}</select></label></div>${provider ? `<label class="field" for="settings-reasoning">Reasoning level<select id="settings-reasoning" class="select">${opts(P, ['low', 'medium', 'high'], s.reasoning)}</select></label>` : ''}${provider?.auth === 'key' ? `<div class="card stack"><h3>Provider setup · demo</h3><label class="field" for="settings-key">API key<input class="input" id="settings-key" type="password" value="" placeholder="Empty sample field · credential entry disabled" disabled autocomplete="off"></label><p class="muted">This prototype never accepts or stores credentials. Use the demo connection to preview a configured state.</p></div>` : provider?.auth === 'signin' ? '<div class="card"><h3>Subscription sign-in · demo</h3><p class="muted">Preview connected and disconnected states without opening a real sign-in flow.</p></div>' : ''}${s.ready ? '<div class="alert success" role="status">Demo provider ready · no real connection</div>' : provider ? '<div class="alert warning">Demo provider is not configured yet.</div>' : ''}<div class="row"><button class="button primary" type="submit"${!s.provider || !s.model ? ' disabled' : ''}>Save sample settings</button>${provider ? btn(s.ready ? 'Disconnect demo provider' : 'Connect demo provider', 'settings-connect', 'secondary') : ''}</div></form></section><section class="panel stack"><h2>Data and privacy</h2><p class="muted">This HTML prototype uses fictional learning data in its own browser storage. Export downloads only a Playground sample fixture. No app database or credentials are accessed.</p><div class="row">${btn('Export sample JSON', 'settings-export', 'secondary')}${btn('Import sample JSON', 'settings-import', 'secondary')}</div><input type="file" id="settings-import-file" accept="application/json,.json" hidden aria-label="Choose a Playground sample fixture"><p class="muted">Demo import accepts only this prototype's fixture format and always asks before replacing progress.</p></section><section class="panel stack"><h2>Reset sample progress</h2><p class="muted">Return this prototype to its starting sample. This does not affect the application.</p>${btn('Reset prototype sample', 'settings-reset', 'secondary')}</section></div>`;
    },
    bind(P) {
      const s = P.state.settings;
      document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => { P.setTheme(button.dataset.themeChoice); P.refresh(); }));
      P.on('#settings-provider', 'change', event => { s.provider = event.target.value; s.model = providers.find(p => p.id === s.provider)?.models[0] || ''; s.ready = false; s.saved = false; s.error = ''; s.notice = ''; P.refresh(); });
      P.on('#settings-model', 'change', event => { s.model = event.target.value; s.saved = false; P.save(); });
      P.on('#settings-reasoning', 'change', event => { s.reasoning = event.target.value; s.saved = false; P.save(); });
      P.on('#settings-form', 'submit', event => { event.preventDefault(); if (!s.provider || !s.model) return; s.saved = true; s.error = ''; s.notice = 'Sample settings saved locally. No real provider was contacted.'; P.refresh(); });
      P.on('#settings-connect', 'click', () => {
        if (s.ready) { s.ready = false; s.notice = 'Demo provider disconnected.'; return P.refresh(); }
        P.dialog('Preview a connected provider?', '<p>This action simulates a ready provider using sample state. It does not sign in, transmit data, or use an API key.</p><div class="row">' + btn('Cancel', 'settings-connect-cancel', 'secondary') + btn('Simulate connection', 'settings-connect-confirm') + '</div>', () => {
          P.on('#settings-connect-cancel', 'click', () => P.closeDialog());
          P.on('#settings-connect-confirm', 'click', () => { s.ready = true; s.error = ''; s.notice = 'Demo provider connected. This is a visual preview only.'; P.closeDialog(); P.refresh(); });
        });
      });
      P.on('#settings-export', 'click', () => {
        try {
          const envelope = exportEnvelope(P); validateEnvelope(envelope, P);
          const url = URL.createObjectURL(new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a'); link.href = url; link.download = 'playground-sample-progress.json'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
          s.notice = 'Sample JSON exported. Credentials and app data are not connected.'; s.error = ''; P.refresh();
        } catch (error) { s.error = error.message || 'Could not export this sample. Try resetting the prototype sample.'; P.refresh(); }
      });
      P.on('#settings-import', 'click', () => P.q('#settings-import-file').click());
      P.on('#settings-import-file', 'change', async event => {
        const file = event.target.files?.[0]; if (!file) return;
        try {
          if (file.size > 1024 * 1024) throw new Error('Choose a sample fixture smaller than 1 MB.');
          const envelope = JSON.parse(await file.text()); validateEnvelope(envelope, P); importDialog(P, envelope);
        } catch (error) { s.error = error instanceof SyntaxError ? 'That file is not valid JSON. Choose an exported Playground sample fixture.' : error.message; s.notice = ''; P.refresh(); }
        finally { event.target.value = ''; }
      });
      P.on('#settings-reset', 'click', () => P.dialog('Reset prototype sample?', '<p>This replaces the sample learning progress with the starting fixture. The application is not connected.</p><div class="row">' + btn('Keep sample progress', 'settings-reset-cancel', 'secondary') + btn('Reset sample progress', 'settings-reset-confirm') + '</div>', () => {
        P.on('#settings-reset-cancel', 'click', () => P.closeDialog());
        P.on('#settings-reset-confirm', 'click', () => {
          P.closeDialog();
          if (typeof P.resetSample === 'function') P.resetSample();
          else { P.state.reviews = reviewFixture(); P.state.continuation = continuationFixture(); P.state.settings = settingsFixture(); }
          init(P); P.state.settings.notice = 'Prototype sample reset.'; P.save(); P.go('settings');
        });
      }));
    }
  };
})();
