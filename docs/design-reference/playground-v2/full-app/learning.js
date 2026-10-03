(function () {
  'use strict';

  const customers = [
    { id: 1, name: 'Amina', city: 'Karachi', total_spent: 180 },
    { id: 2, name: 'Theo', city: 'Lahore', total_spent: 100 },
    { id: 3, name: 'June', city: 'Karachi', total_spent: 245 },
    { id: 4, name: 'Ravi', city: 'Islamabad', total_spent: 80 },
    { id: 5, name: 'Noor', city: 'Lahore', total_spent: 0 }
  ];
  const goodSQL = 'SELECT name, city\nFROM customers\nWHERE total_spent >= 100\nORDER BY total_spent DESC;';
  const outcomes = [
    { id: 'projection', title: 'Choose the columns a report needs', role: 'core' },
    { id: 'filter', title: 'Filter rows and include the boundary', role: 'core' },
    { id: 'sort', title: 'Put the largest values first', role: 'core' },
    { id: 'explain', title: 'Explain the query in plain language', role: 'supporting' }
  ];
  const blocks = [
    { id: 'read', type: 'read', title: 'A table is a set of rows', label: 'Read' },
    { id: 'worked_example', type: 'worked_example', title: 'Follow a customer report', label: 'Example' },
    { id: 'choice', type: 'choice', title: 'Keep the boundary customer', label: 'Choose' },
    { id: 'ordering', type: 'ordering', title: 'Put the query in order', label: 'Order' },
    { id: 'short_answer', type: 'short_answer', title: 'Write the report query', label: 'Write' },
    { id: 'reflection', type: 'reflection', title: 'Leave yourself a takeaway', label: 'Reflect' }
  ];
  const orderItems = [
    { id: 'where', label: 'WHERE total_spent >= 100' },
    { id: 'select', label: 'SELECT name, city' },
    { id: 'sort', label: 'ORDER BY total_spent DESC' },
    { id: 'from', label: 'FROM customers' }
  ];
  const correctOrder = ['select', 'from', 'where', 'sort'];
  const choices = [
    { id: 'strict', label: 'WHERE total_spent > 100' },
    { id: 'inclusive', label: 'WHERE total_spent >= 100' },
    { id: 'exact', label: 'WHERE total_spent = 100' }
  ];
  const questions = [
    { id: 'q1', outcome: 'projection', type: 'choice', text: 'The report needs customer names and cities. Which SELECT is the most precise?', options: [{ id: 'projection', label: 'SELECT name, city FROM customers' }, { id: 'all', label: 'SELECT * FROM customers' }, { id: 'city', label: 'SELECT city FROM customers' }], correct: 'projection', explanation: 'Select the two requested columns: name and city.' },
    { id: 'q2', outcome: 'filter', type: 'choice', text: 'Keep customers who spent at least 100. Which condition includes exactly 100?', options: choices, correct: 'inclusive', explanation: 'At least 100 means >= 100. The > operator excludes exactly 100.' },
    { id: 'q3', outcome: 'filter', type: 'choice', text: 'Theo spent 100 and Noor spent 0. With WHERE total_spent >= 100, who stays?', options: [{ id: 'theo', label: 'Theo stays; Noor is excluded' }, { id: 'both', label: 'Both stay' }, { id: 'neither', label: 'Both are excluded' }], correct: 'theo', explanation: 'Theo meets the inclusive boundary. Zero does not meet the threshold.' },
    { id: 'q4', outcome: 'sort', type: 'choice', text: 'June spent 245, Amina 180, and Theo 100. Which clause puts June first?', options: [{ id: 'desc', label: 'ORDER BY total_spent DESC' }, { id: 'asc', label: 'ORDER BY total_spent ASC' }, { id: 'name', label: 'ORDER BY name ASC' }], correct: 'desc', explanation: 'DESC sorts amounts from largest to smallest.' },
    { id: 'q5', outcome: 'explain', type: 'written', text: 'Explain the different jobs of WHERE and ORDER BY in this report.', explanation: 'WHERE filters which rows are included. ORDER BY sorts the included rows.' }
  ];
  const fixtureAnswers = { q1: 'projection', q2: 'inclusive', q3: 'theo', q4: 'desc', q5: 'WHERE filters the included rows. ORDER BY sorts the result from largest to smallest.' };

  function button(label, action, variant = 'primary', extra = '') {
    return `<button type="button" class="button ${variant}" data-action="${action}" ${extra}>${label}</button>`;
  }
  function table(P, rows = customers, report = false) {
    return `<div class="table-wrap"><table><caption class="muted">${report ? `${rows.length} matching customer${rows.length === 1 ? '' : 's'}` : 'customers · local sample table'}</caption><thead><tr>${report ? '' : '<th scope="col">id</th>'}<th scope="col">name</th><th scope="col">city</th><th scope="col">total_spent</th></tr></thead><tbody>${rows.map((r) => `<tr>${report ? '' : `<td>${r.id}</td>`}<td>${P.escape(r.name)}</td><td>${P.escape(r.city)}</td><td>${r.total_spent}</td></tr>`).join('')}${!rows.length ? '<tr><td colspan="3">No matching customers.</td></tr>' : ''}</tbody></table></div>`;
  }
  function progress(label, count, total) {
    return `<div class="row"><span class="muted">${label}</span><span class="pill">${count} / ${total}</span></div><div class="progress-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${count}"><span style="width:${Math.round(count / Math.max(1, total) * 100)}%"></span></div>`;
  }
  function completedEntry(block) {
    if (block.type === 'choice') return { status: 'passed', response: 'inclusive', feedback: 'Exactly. >= keeps Theo at the boundary of 100.' };
    if (block.type === 'ordering') return { status: 'passed', response: correctOrder.slice(), feedback: 'That is the SQL clause order: SELECT, FROM, WHERE, ORDER BY.' };
    if (block.type === 'short_answer') return { status: 'passed', response: goodSQL, feedback: 'Your query selects the right columns, includes exactly 100, and sorts largest first.' };
    if (block.type === 'reflection') return { status: 'completed', response: 'At least includes the boundary: use >=. WHERE filters rows; ORDER BY sorts the result.' };
    return { status: 'completed' };
  }
  function isFinal(entry) { return entry && ['passed', 'completed'].includes(entry.status); }
  function markSessionComplete(P, s) {
    s.phase = 'complete';
    const prior = Array.isArray(P.state.completedSessions) ? P.state.completedSessions : [101, 102];
    P.state.completedSessions = Array.from(new Set(prior.concat(s.id)));
  }
  function newSession(id) {
    const entries = {};
    if (id === 104) blocks.forEach((block) => { entries[block.id] = completedEntry(block); });
    return { id, phase: id === 104 ? 'build' : 'activity', index: id === 104 ? 5 : 0, entries, review: null, revealed: 0, threshold: 100, experimentRan: false, draft: '', order: orderItems.map((i) => i.id), guideCollapsed: false, guideDraft: '', messages: [], error: '', artifactRequired: id === 104, build: { mode: 'evidence', content: '', evidence: { setup: '', actions: '', result: '', reflection: '' }, hints: false, evaluation: null, fileName: '', error: '' } };
  }
  function sessionState(P) {
    if (!P.state.session || !P.state.session.attempts) P.state.session = { attempts: {} };
    const requested = Number(P.params.id || P.params.session || P.params.lessonId);
    const scenario = P.params.scenario || '';
    const id = [101, 102, 103, 104].includes(requested) ? requested : scenario.startsWith('build') ? 104 : 103;
    let s = P.state.session.attempts[id];
    if (!s || !s.build || !s.entries) s = P.state.session.attempts[id] = newSession(id);
    P.state.session.activeId = id;
    const signature = JSON.stringify([scenario, P.params.block || '', P.params.phase || '', P.params.mode || '']);
    if (s.demoSignature !== signature) {
      s.demoSignature = signature;
      s.error = '';
      let index = blocks.findIndex((b) => b.type === P.params.block || b.id === P.params.block);
      if (index < 0 && /^\d+$/.test(P.params.block || '')) index = Math.max(0, Math.min(5, Number(P.params.block) - 1));
      if (index < 0 && P.params.block === 'worked') index = 1;
      if (index < 0 && P.params.block === 'short') index = 4;
      if (index >= 0 || scenario === 'resume' || scenario === 'review' || scenario === 'feedback' || scenario === 'held') {
        s.phase = 'activity'; s.index = index >= 0 ? index : scenario === 'review' ? 3 : 2; s.review = null;
        blocks.slice(0, s.index).forEach((b) => { if (!s.entries[b.id]) s.entries[b.id] = completedEntry(b); });
        if (scenario === 'review') { s.review = index >= 0 ? blocks[index].id : 'worked_example'; if (!s.entries[s.review]) s.entries[s.review] = completedEntry(blocks.find((b) => b.id === s.review)); }
        if (scenario === 'feedback') s.entries.choice = { status: 'needs_retry', response: 'strict', feedback: 'Close. > excludes Theo, who spent exactly 100. Try the inclusive boundary.' };
        if (scenario === 'held') s.entries.choice = completedEntry(blocks[2]);
      }
      if (scenario.startsWith('build') || P.params.phase === 'build') {
        s.phase = 'build'; s.review = null; s.artifactRequired = true;
        blocks.forEach((b) => { s.entries[b.id] = completedEntry(b); });
        if (P.params.mode === 'artifact' || P.params.mode === 'code') s.build.mode = 'artifact';
        if (P.params.mode === 'evidence') s.build.mode = 'evidence';
        if (scenario === 'build-revise' || scenario === 'build-pass') {
          fillBuild(s, scenario === 'build-pass');
          s.build.evaluation = assessBuild(s.build);
        }
      }
      if (scenario === 'completed' || P.params.phase === 'complete') {
        s.phase = 'complete'; blocks.forEach((b) => { s.entries[b.id] = completedEntry(b); });
      }
      if (s.phase === 'build' && ['artifact', 'code', 'evidence'].includes(P.params.mode)) s.build.mode = P.params.mode === 'evidence' ? 'evidence' : 'artifact';
      if (scenario === 'error') s.error = 'Connection dropped. Your draft is still here; retry this step when you’re ready.';
    }
    return s;
  }
  function feedback(P, entry) {
    if (!entry.feedback) return '';
    return `<div class="alert ${entry.status === 'passed' ? 'success' : 'warning'}" role="status"><strong>${entry.status === 'passed' ? 'You’ve got it.' : 'A useful next step.'}</strong><p>${P.escape(entry.feedback)}</p>${entry.criteria ? `<ul class="outcome-list">${entry.criteria.map((c) => `<li>${c.passed ? '✓' : '↻'} ${P.escape(c.label)}</li>`).join('')}</ul>` : ''}</div>`;
  }
  function renderActivity(P, s, block, review) {
    const entry = s.entries[block.id] || {};
    const locked = review || isFinal(entry);
    const continueButton = review ? '<p class="pill">Saved response · read only</p>' : button('Continue →', 'continue-step');
    if (block.type === 'read') return `<div class="stack"><p>A row is one customer. A column is one fact about that customer. A query lets you choose the facts and rows a report needs.</p>${table(P)}<div class="grid-3"><div class="card"><strong>SELECT</strong><p class="muted">Choose columns.</p></div><div class="card"><strong>WHERE</strong><p class="muted">Keep matching rows.</p></div><div class="card"><strong>ORDER BY</strong><p class="muted">Arrange the result.</p></div></div><div class="alert"><strong>Today’s goal</strong><p>Show names and cities for customers who spent at least 100, largest spend first.</p></div>${continueButton}</div>`;
    if (block.type === 'worked_example') {
      const revealed = locked ? 3 : s.revealed;
      const exampleSteps = [
        ['Choose the shape', 'The report needs name and city. Keep total_spent available for filtering and sorting.', 'SELECT name, city\nFROM customers'],
        ['Keep the right rows', 'At least 100 includes exactly 100. Theo belongs in the result.', 'WHERE total_spent >= 100'],
        ['Make it useful', 'DESC places the largest spend first: June, Amina, then Theo.', 'ORDER BY total_spent DESC;']
      ];
      const rows = customers.filter((r) => r.total_spent >= s.threshold).sort((a, b) => b.total_spent - a.total_spent);
      return `<div class="stack"><p>Build the report one clause at a time. Reveal the reasoning, then try one small change.</p><ol class="steps learning-worked">${exampleSteps.slice(0, revealed).map((step, i) => `<li><span class="pill">${i + 1}</span><div><h3>${step[0]}</h3><p class="muted">${step[1]}</p><pre><code>${P.escape(step[2])}</code></pre></div></li>`).join('')}</ol>${revealed < 3 ? button('Reveal next step', 'reveal', 'secondary') : `<div class="workbench stack"><div class="row"><div><p class="eyebrow">Small experiment</p><h3>What changes when the boundary moves?</h3></div><span class="pill">Local sample</span></div><label class="field">Minimum spend<select class="select" id="experiment-threshold" ${review ? 'disabled' : ''}>${[0, 100, 200, 300].map((n) => `<option value="${n}" ${s.threshold === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><pre><code>${P.escape(`SELECT name, city\nFROM customers\nWHERE total_spent >= ${s.threshold}\nORDER BY total_spent DESC;`)}</code></pre>${review ? '' : button('Run sample query', 'experiment', 'secondary')}${s.experimentRan || review ? `<div aria-live="polite">${table(P, rows, true)}<p class="muted">The rows change; the requested columns stay the same. Amounts are shown here to explain the result.</p></div>` : '<p class="muted">Predict who will remain, then run it to check.</p>'}</div><div class="alert success"><strong>Takeaway</strong><p>SELECT chooses columns, WHERE filters rows, and ORDER BY sorts the result. >= keeps the boundary.</p></div>${continueButton}`}</div>`;
    }
    if (block.type === 'choice') {
      const selected = entry.response || s.choice || '';
      return `<div class="stack"><p id="activity-prompt">Theo has spent exactly 100. The report asks for customers who spent <strong>at least 100</strong>. Which condition keeps Theo?</p><fieldset class="stack learning-options" ${locked ? 'disabled' : ''}><legend class="sr-only">Choose one condition</legend>${choices.map((o) => `<label class="choice ${selected === o.id ? 'is-selected' : ''}"><input type="radio" name="session-choice" value="${o.id}" ${selected === o.id ? 'checked' : ''}><span><code>${P.escape(o.label)}</code></span></label>`).join('')}</fieldset>${feedback(P, entry)}${locked ? continueButton : button(entry.status === 'needs_retry' ? 'Try again' : 'Check answer', 'check-choice', 'primary', !selected ? 'disabled' : '')}</div>`;
    }
    if (block.type === 'ordering') {
      const order = entry.response && Array.isArray(entry.response) ? entry.response : s.order;
      return `<div class="stack"><p>Arrange these clauses into a valid SQL query. Move controls work with a mouse or keyboard.</p><ol class="stack learning-order">${order.map((id, i) => `<li class="card row"><span class="pill">${i + 1}</span><code>${P.escape(orderItems.find((item) => item.id === id)?.label || '')}</code>${locked ? '' : `<div class="row"><button type="button" class="button quiet" data-move="${i}" data-offset="-1" aria-label="Move ${P.escape(orderItems.find((item) => item.id === id)?.label)} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="button quiet" data-move="${i}" data-offset="1" aria-label="Move ${P.escape(orderItems.find((item) => item.id === id)?.label)} down" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></div>`}</li>`).join('')}</ol>${feedback(P, entry)}${locked ? continueButton : button(entry.status === 'needs_retry' ? 'Try again' : 'Check order', 'check-order')}</div>`;
    }
    const reflection = block.type === 'reflection';
    const value = typeof entry.response === 'string' ? entry.response : s.draft;
    const minimum = reflection ? 1 : 20;
    return `<div class="stack"><label class="field" for="activity-response">${reflection ? 'What will you check the next time a requirement says “at least”?' : 'Write a query that returns names and cities for spend ≥100, largest spend first.'}</label><p class="muted">${reflection ? 'A sentence for your future self is plenty.' : 'Use SELECT, FROM, WHERE, and ORDER BY. This sample checks those clauses; it does not run arbitrary SQL.'}</p><textarea class="textarea ${reflection ? '' : 'learning-code'}" id="activity-response" rows="${reflection ? 4 : 6}" maxlength="${reflection ? 1000 : 2000}" ${locked ? 'disabled' : ''} placeholder="${reflection ? 'My takeaway…' : 'SELECT…'}">${P.escape(value || '')}</textarea><p class="muted" id="response-count">${(value || '').length} / ${reflection ? 1000 : 2000} characters${reflection ? '' : ' · at least 20'}</p>${feedback(P, entry)}${locked ? continueButton : button(reflection ? 'Save takeaway' : entry.status === 'needs_retry' ? 'Try again' : 'Submit response', reflection ? 'save-reflection' : 'check-written', 'primary', (value || '').trim().length < minimum ? 'disabled' : '')}</div>`;
  }
  function guide(P, s) {
    return `<aside class="panel stack learning-guide" aria-label="Ask your guide"><div class="row"><div><p class="eyebrow">Need a nudge?</p><h2>Ask your guide</h2></div>${button(s.guideCollapsed ? '+' : '−', 'toggle-guide', 'quiet', `aria-label="${s.guideCollapsed ? 'Expand' : 'Collapse'} guide" aria-expanded="${!s.guideCollapsed}"`)}</div>${s.guideCollapsed ? '<p class="muted">A hint is one click away.</p>' : `<div class="stack learning-messages" aria-live="polite"><div class="card"><p>I’m here to help you reason through this step. What would make it clearer?</p></div>${s.messages.map((m) => `<div class="card ${m.role === 'user' ? 'learning-message-user' : ''}"><small class="muted">${m.role === 'user' ? 'You' : 'Guide'}</small><p>${P.escape(m.content)}</p></div>`).join('')}</div><div class="row learning-wrap">${['Give me a hint', 'Show another example', 'Why was this wrong?'].map((text) => `<button type="button" class="button quiet" data-guide-prompt="${P.escape(text)}">${text}</button>`).join('')}</div><form id="guide-form" class="stack"><label class="field" for="guide-message">Message your guide<textarea class="textarea" id="guide-message" rows="3" maxlength="2000" placeholder="Ask about this step…">${P.escape(s.guideDraft)}</textarea></label><div class="row"><small class="muted">Sample responses · local only</small><button type="submit" class="button secondary" ${s.guideDraft.trim() ? '' : 'disabled'}>Send</button></div></form>`}</aside>`;
  }
  function fillBuild(s, strong) {
    const sql = strong ? goodSQL : 'SELECT name, city\nFROM customers\nWHERE total_spent > 100;';
    s.build.content = sql + (strong ? '\n-- Checked exactly 100 and 0: June, Amina, Theo remain.' : '');
    s.build.evidence = {
      setup: 'I used the five sample customers with spend values 245, 180, 100, 80, and 0.',
      actions: sql,
      result: strong ? 'June (245), Amina (180), Theo (100): 3 customers, largest spend first. Ravi (80) and Noor (0) are excluded.' : 'June and Amina appear in the report.',
      reflection: strong ? 'I checked the boundary: exactly 100 is included and 0 is excluded. WHERE filters rows; ORDER BY sorts them.' : 'I filtered the customers and selected the report columns.'
    };
    s.build.error = '';
  }
  function sqlChecks(value) {
    const source = String(value).replace(/--[^\n]*/g, ' ').trim();
    return {
      projection: /select\s+name\s*,\s*city\s+from\s+customers\b/i.test(source),
      inclusive: /where\s+total_spent\s*>=\s*100\b/i.test(source),
      sort: /order\s+by\s+total_spent\s+desc\b/i.test(source),
      clean: !/\b(insert|update|delete|drop|alter|truncate)\b/i.test(source)
    };
  }
  function assessBuild(build) {
    const evidenceMode = build.mode === 'evidence';
    const source = evidenceMode ? build.evidence.actions : build.content;
    const all = evidenceMode ? Object.values(build.evidence).join(' ') : source;
    const checks = sqlChecks(source);
    const scores = {
      Correctness: checks.inclusive && checks.sort && checks.clean ? 2 : /where\s+total_spent\s*>/i.test(source) && checks.clean ? 1 : 0,
      Completeness: checks.projection ? 2 : /select/i.test(source) ? 1 : 0,
      Clarity: source.trim().length >= 20 && !/select\s+\*/i.test(source) ? 2 : source.trim() ? 1 : 0,
      'Edge Cases': checks.inclusive ? /exactly|boundary|theo/i.test(all) && /\b0\b|zero/i.test(all) ? 2 : 1 : 0
    };
    const feedback = {
      Correctness: scores.Correctness === 2 ? 'The inclusive filter and descending sort produce the intended report.' : 'Use >= 100 and ORDER BY total_spent DESC so the report includes Theo and sorts largest first.',
      Completeness: scores.Completeness === 2 ? 'The requested name and city columns are present.' : 'Return both name and city from customers.',
      Clarity: scores.Clarity === 2 ? 'The query names its columns and makes its purpose easy to follow.' : 'Use explicit columns and a readable query.',
      'Edge Cases': scores['Edge Cases'] === 2 ? 'Your evidence checks exactly 100 and zero.' : scores['Edge Cases'] === 1 ? 'The query includes the boundary. Add a note showing how you checked exactly 100 and zero.' : 'Check exactly 100 and zero. A strict > filter drops the boundary customer.'
    };
    const total = Object.values(scores).reduce((n, score) => n + score, 0);
    return { scores, feedback, total, overallScore: Math.round(total / 8 * 100), passed: total >= 6 && Object.values(scores).every((score) => score > 0) };
  }
  function renderBuild(P, s) {
    const b = s.build;
    if (b.evaluation) {
      const e = b.evaluation;
      const submitted = b.mode === 'evidence' ? `<dl class="grid-2">${Object.entries(b.evidence).map(([key, value]) => `<div><dt class="muted">${{ setup: 'Setup', actions: 'Actions taken', result: 'Observed result', reflection: 'Reflection' }[key]}</dt><dd class="learning-preserve">${P.escape(value)}</dd></div>`).join('')}</dl>` : `<pre><code>${P.escape(b.content)}</code></pre>`;
      return `<div class="stack"><div class="alert ${e.passed ? 'success' : 'warning'}" role="status"><p class="eyebrow">Sample assessment</p><h2>${e.passed ? 'Build complete' : 'Ready to revise'}</h2><p><strong>${e.overallScore}% · ${e.total}/8</strong> — passing needs at least 6/8 with no missing dimensions.</p></div><details class="panel"><summary>Your submitted work</summary>${submitted}</details><div class="grid-2">${Object.entries(e.scores).map(([dim, score]) => `<section class="card stack"><div class="row"><h3>${dim}</h3><span class="pill">${score}/2 · ${['Missing', 'Needs work', 'Strong'][score]}</span></div><p>${P.escape(e.feedback[dim])}</p></section>`).join('')}</div>${e.passed ? button('Finish Session →', 'finish-build') : `<div class="row learning-wrap">${button('Revise & resubmit', 'revise-build')}${button('Ask your guide', 'build-guide', 'secondary')}</div>`}<small class="muted">This preview uses fixed sample rules to show assessment behavior.</small></div>`;
    }
    return `<div class="stack"><div><p class="eyebrow">One practical Build remains</p><h2>Build a customer report</h2><p>Give a community shop a useful customer list. Include customers who spent at least 100 and put the largest spend first.</p></div><div class="grid-3"><div class="card"><h3>Constraints</h3><p class="muted">Use the provided customers table. Keep exactly 100. Leave the table intact.</p></div><div class="card"><h3>Deliverable</h3><p class="muted">Names and cities, ordered by total_spent descending.</p></div><div class="card"><h3>Success</h3><p class="muted">June, Amina, and Theo remain, in that order.</p></div></div><details class="panel"><summary>Sample data and evaluation rubric</summary>${table(P)}<ul class="outcome-list">${['Correctness', 'Completeness', 'Clarity', 'Edge Cases'].map((dim) => `<li><strong>${dim}</strong><span>0 Missing · 1 Needs work · 2 Strong</span></li>`).join('')}</ul><p class="muted">Passing requires no zeros and at least 6 of 8 points (≥70%).</p></details><div class="row learning-wrap">${button(b.hints ? 'Hide hints' : 'Show hints', 'build-hints', 'quiet')}${button('Fill sample draft', 'build-sample', 'quiet')}${button('Fill stronger sample', 'build-strong', 'quiet')}</div>${b.hints ? `<div class="alert"><strong>A nudge</strong><p>Use >= for “at least.” SELECT name, city defines the report. DESC means largest first. Test 100 and 0.</p></div>` : ''}${b.error ? `<div class="alert danger" role="alert">${P.escape(b.error)}</div>` : ''}<form id="build-form" class="stack">${b.mode === 'evidence' ? `<p class="pill">Task evidence</p>${[['setup', 'Setup', 'Describe the sample table you used.'], ['actions', 'Actions taken', 'Paste your SQL and describe what you did.'], ['result', 'Observed result', 'Which customers remained? In what order?'], ['reflection', 'Reflection', 'What did your boundary checks show?']].map(([key, label, placeholder]) => `<label class="field" for="build-${key}">${label}<textarea class="textarea ${key === 'actions' ? 'learning-code' : ''}" id="build-${key}" data-evidence="${key}" maxlength="5000" rows="3" placeholder="${placeholder}">${P.escape(b.evidence[key])}</textarea></label>`).join('')}` : `<label class="field" for="build-content">Your Build submission<textarea id="build-content" class="textarea learning-code" rows="8" maxlength="20000" placeholder="Paste your SQL solution…">${P.escape(b.content)}</textarea></label><label class="field" for="build-file">Or load a text solution<input class="input" id="build-file" type="file" accept=".sql,.txt,.md,text/plain"><small class="muted">Max 5 MB · ${P.escape(b.fileName || 'No file loaded')}</small></label>`}<div class="row learning-wrap"><button class="button primary" type="submit">Submit Build</button>${button('Save & return to Trail', 'pause', 'secondary')}</div></form></div>`;
  }
  function sessionRender(P) {
    const s = sessionState(P);
    const done = blocks.filter((b) => isFinal(s.entries[b.id])).length;
    const title = {101:'Think in tables',102:'Find the interesting rows',103:'The boundary matters',104:'Build a customer report'}[s.id];
    const head = `<header class="page-head"><div><p class="eyebrow">Query Grove · Chapter 1 · Session ${s.id - 100}</p><h1>${title}</h1><p class="muted">${s.phase === 'complete' ? 'You moved this idea into practice.' : 'One clear step at a time. Your place saves as you go.'}</p></div>${button('Back to Trail', 'pause', 'quiet')}</header>`;
    let main;
    if (s.phase === 'complete' && !s.review) {
      main = `<section class="panel stack"><div class="learning-complete-mark" aria-hidden="true">✦</div><p class="eyebrow">Session complete</p><h2>A little more fluent.</h2><p>You brought the report together and checked the boundary.</p><ul class="outcome-list">${outcomes.map((o) => `<li><span>✓</span><strong>${o.title}</strong></li>`).join('')}</ul><div class="card"><h3>Your takeaway</h3><p>${P.escape(s.entries.reflection?.response || 'At least includes the boundary. WHERE filters rows; ORDER BY sorts the result.')}</p></div><p class="muted">Review this idea tomorrow to help it stick.</p><div class="row learning-wrap">${button('Continue your Trail →', 'finish-session')}${button('Review completed steps', 'review-complete', 'secondary')}</div></section>`;
    } else {
      const block = blocks.find((b) => b.id === s.review) || blocks[s.index] || blocks[0];
      main = `<section class="panel stack">${progress('Session steps', done, 6)}<nav class="row learning-wrap" aria-label="Session steps">${blocks.map((b, i) => `<button type="button" class="button ${b.id === block.id && s.phase !== 'build' ? 'secondary' : 'quiet'}" data-step="${b.id}" ${isFinal(s.entries[b.id]) ? '' : 'disabled'} aria-label="${isFinal(s.entries[b.id]) ? 'Review' : 'Locked'} ${b.label}" ${b.id === block.id && s.phase !== 'build' ? 'aria-current="step"' : ''}>${isFinal(s.entries[b.id]) ? '✓' : i + 1} ${b.label}</button>`).join('')}</nav>${s.review ? `<div class="alert"><p>Reviewing a completed step. Your saved response cannot be changed.</p>${button(s.phase === 'complete' ? 'Back to Session summary' : s.phase === 'build' ? 'Return to Build' : 'Return to current step', 'end-review', 'quiet')}</div>` : ''}${s.error ? `<div class="alert danger" role="alert">${P.escape(s.error)} ${button('Dismiss & retry', 'retry', 'quiet')}</div>` : ''}${s.phase === 'build' && !s.review ? renderBuild(P, s) : `<article class="stack"><p class="eyebrow">${s.review ? 'Completed step' : `Step ${s.index + 1} of 6`} · ${block.type.replace('_', ' ')}</p><h2 tabindex="-1" id="activity-title">${block.title}</h2>${renderActivity(P, s, block, !!s.review)}</article>`}</section>`;
    }
    return `${styles()}${head}<div class="activity-layout learning-layout">${main}${guide(P, s)}</div>`;
  }
  function advance(P, s) {
    if (s.review) return;
    const block = blocks[s.index];
    if (!isFinal(s.entries[block.id])) s.entries[block.id] = completedEntry(block);
    s.draft = ''; s.choice = ''; s.error = '';
    if (s.index < 5) s.index += 1;
    else if (s.artifactRequired) s.phase = 'build';
    else { markSessionComplete(P, s); P.celebrate(); }
    P.refresh();
  }
  function guideResponse(s, prompt) {
    if (/another example/i.test(prompt)) return 'Imagine a report of runners aged at least 18. >= 18 keeps someone on their eighteenth birthday; > 18 does not. Our customer at exactly 100 needs the same inclusive boundary.';
    if (/wrong|why/i.test(prompt)) return 'Compare the condition with the wording “at least.” A strict > drops exactly 100. Also check that DESC puts the largest amount first. Change one part, then check again.';
    if (s.phase === 'build') return 'Keep the Build small: select name and city, filter with >= 100, then sort by total_spent DESC. In your evidence, say what happened to the customers at 100 and 0.';
    if (s.index === 3) return 'The written clause order is SELECT, FROM, WHERE, ORDER BY. First describe the output, then the table, then the filter, then its order.';
    return 'Try the smallest boundary case: Theo spent exactly 100. Ask whether your operator keeps that row. “At least” includes equality, so look for >=.';
  }
  function sendGuide(P, s, prompt) {
    const content = String(prompt || '').trim().slice(0, 2000);
    if (!content) return;
    s.messages.push({ role: 'user', content }, { role: 'assistant', content: guideResponse(s, content) });
    s.guideDraft = ''; s.guideCollapsed = false; P.refresh();
  }
  function sessionBind(P) {
    const s = sessionState(P);
    P.on('[data-action]', 'click', (event) => {
      if (event.detail > 1) return;
      const action = event.currentTarget.dataset.action;
      if (action === 'pause') { P.save(); P.go('trail'); }
      else if (action === 'reveal') { s.revealed = Math.min(3, s.revealed + 1); P.refresh(); }
      else if (action === 'experiment') { s.threshold = Number(P.q('#experiment-threshold')?.value || 100); s.experimentRan = true; P.refresh(); }
      else if (action === 'continue-step') advance(P, s);
      else if (action === 'retry') { s.error = ''; P.refresh(); }
      else if (action === 'end-review') { s.review = null; P.refresh(); }
      else if (action === 'review-complete') { s.review = 'read'; P.refresh(); }
      else if (action === 'check-choice') {
        const response = P.q('input[name="session-choice"]:checked')?.value;
        if (!response) return;
        const passed = response === 'inclusive';
        s.entries.choice = { status: passed ? 'passed' : 'needs_retry', response, feedback: passed ? 'Exactly. >= keeps Theo at the boundary of 100.' : 'Close. > excludes exactly 100; = keeps only 100. “At least” needs the inclusive >= operator.' };
        P.refresh();
      } else if (action === 'check-order') {
        const passed = s.order.every((id, i) => id === correctOrder[i]);
        s.entries.ordering = { status: passed ? 'passed' : 'needs_retry', response: s.order.slice(), feedback: passed ? 'That is the SQL clause order: SELECT, FROM, WHERE, ORDER BY.' : 'Start by selecting the columns, then name the table, filter its rows, and order the result.' };
        P.refresh();
      } else if (action === 'check-written') {
        const response = P.q('#activity-response')?.value.trim() || '';
        if (response.length < 20) return;
        const c = sqlChecks(response);
        const passed = c.projection && c.inclusive && c.sort && c.clean;
        s.entries.short_answer = { status: passed ? 'passed' : 'needs_retry', response, feedback: passed ? 'Your query selects the right columns, includes exactly 100, and sorts largest first.' : 'Keep working through the clauses below. Your response is saved for revision.', criteria: [{ passed: c.projection, label: 'Select name and city from customers.' }, { passed: c.inclusive, label: 'Use WHERE total_spent >= 100.' }, { passed: c.sort, label: 'Use ORDER BY total_spent DESC.' }, { passed: c.clean, label: 'Keep the sample table intact.' }] };
        P.refresh();
      } else if (action === 'save-reflection') {
        const response = P.q('#activity-response')?.value.trim() || '';
        if (!response) return;
        s.entries.reflection = { status: 'completed', response }; advance(P, s);
      } else if (action === 'toggle-guide') { s.guideCollapsed = !s.guideCollapsed; P.refresh(); }
      else if (action === 'build-hints') { s.build.hints = !s.build.hints; P.refresh(); }
      else if (action === 'build-sample' || action === 'build-strong') { fillBuild(s, action === 'build-strong'); P.refresh(); }
      else if (action === 'revise-build') { s.build.evaluation = null; P.refresh(); }
      else if (action === 'build-guide') { sendGuide(P, s, 'Give me a hint for my Build'); }
      else if (action === 'finish-build') { if (s.build.evaluation?.passed) { markSessionComplete(P, s); P.celebrate(); P.refresh(); } }
      else if (action === 'finish-session') { markSessionComplete(P, s); P.save(); P.go('trail'); }
    });
    P.on('[data-step]', 'click', (event) => { const id = event.currentTarget.dataset.step; if (isFinal(s.entries[id])) { s.review = id; P.refresh(); } });
    P.on('input[name="session-choice"]', 'change', (event) => {
      s.choice = event.currentTarget.value;
      if (s.entries.choice?.status === 'needs_retry') s.entries.choice.response = s.choice;
      P.save();
      const submit = P.q('[data-action="check-choice"]'); if (submit) submit.disabled = false;
    });
    P.on('[data-move]', 'click', (event) => {
      const i = Number(event.currentTarget.dataset.move); const next = i + Number(event.currentTarget.dataset.offset);
      if (next < 0 || next >= s.order.length) return;
      [s.order[i], s.order[next]] = [s.order[next], s.order[i]];
      if (s.entries.ordering?.status === 'needs_retry') s.entries.ordering.response = s.order.slice();
      P.refresh();
    });
    P.on('#activity-response', 'input', (event) => {
      const value = event.currentTarget.value; s.draft = value;
      const block = blocks[s.index]; if (s.entries[block.id]?.status === 'needs_retry') s.entries[block.id].response = value;
      P.save();
      const count = P.q('#response-count'); if (count) count.textContent = `${value.length} / ${block.type === 'reflection' ? 1000 : 2000} characters${block.type === 'reflection' ? '' : ' · at least 20'}`;
      const submit = P.q('[data-action="check-written"], [data-action="save-reflection"]'); if (submit) submit.disabled = value.trim().length < (block.type === 'reflection' ? 1 : 20);
    });
    P.on('#experiment-threshold', 'change', (event) => { s.threshold = Number(event.currentTarget.value); s.experimentRan = false; P.refresh(); });
    P.on('[data-guide-prompt]', 'click', (event) => { s.guideDraft = event.currentTarget.dataset.guidePrompt; P.refresh(); P.q('#guide-message')?.focus(); });
    P.on('#guide-message', 'input', (event) => { s.guideDraft = event.currentTarget.value.slice(0, 2000); P.save(); const submit = P.q('#guide-form button[type="submit"]'); if (submit) submit.disabled = !s.guideDraft.trim(); });
    P.on('#guide-form', 'submit', (event) => { event.preventDefault(); sendGuide(P, s, P.q('#guide-message')?.value); });
    P.on('[data-evidence]', 'input', (event) => { s.build.evidence[event.currentTarget.dataset.evidence] = event.currentTarget.value; s.build.error = ''; P.save(); });
    P.on('#build-content', 'input', (event) => { s.build.content = event.currentTarget.value; s.build.error = ''; P.save(); });
    P.on('#build-file', 'change', (event) => {
      const file = event.currentTarget.files?.[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { s.build.error = 'File too large. Choose a text file under 5 MB.'; P.refresh(); return; }
      if (!/\.(sql|txt|md)$/i.test(file.name) && !/^text\//.test(file.type)) { s.build.error = 'Choose a SQL, TXT, or Markdown text solution.'; P.refresh(); return; }
      const reader = new FileReader();
      reader.onload = () => { const content = String(reader.result); if (content.length > 20000) { s.build.error = 'This preview accepts up to 20,000 characters. Choose a smaller text solution; your draft is still here.'; P.refresh(); return; } s.build.content = content; s.build.fileName = file.name; s.build.error = ''; P.refresh(); };
      reader.onerror = () => { s.build.error = 'That file could not be read. Your draft is still here.'; P.refresh(); };
      reader.readAsText(file);
    });
    P.on('#build-form', 'submit', (event) => {
      event.preventDefault(); const b = s.build;
      if (b.mode === 'evidence' ? Object.values(b.evidence).some((v) => !v.trim()) : !b.content.trim()) { b.error = b.mode === 'evidence' ? 'Complete all four evidence fields before submitting.' : 'Enter or load your solution before submitting.'; P.refresh(); return; }
      b.error = ''; b.evaluation = assessBuild(b); P.refresh();
    });
  }

  function checkpointState(P) {
    if (!P.state.checkpoint || !P.state.checkpoint.answers) P.state.checkpoint = { phase: 'intro', answers: {}, index: 0, mode: 'full', activeIds: questions.map((q) => q.id), scores: {}, evaluation: null, error: '', attempt: 1 };
    const c = P.state.checkpoint;
    const signature = JSON.stringify([P.params.scenario || '', P.params.phase || '', P.params.mode || '']);
    if (signature !== c.demoSignature) {
      c.demoSignature = signature; c.error = '';
      if (['locked', 'ready'].includes(P.params.scenario) || P.params.phase === 'intro') c.phase = 'intro';
      if (P.params.scenario === 'resume' || P.params.phase === 'questions' || P.params.phase === 'player') { c.phase = 'player'; c.mode = 'full'; c.activeIds = questions.map((q) => q.id); c.answers = { q1: 'projection', q2: 'inclusive' }; c.index = 2; }
      if (['gaps', 'pass', 'overall-gap'].includes(P.params.scenario) || P.params.phase === 'results') {
        c.answers = { ...fixtureAnswers }; c.scores = {};
        if (P.params.scenario !== 'pass') c.answers.q2 = 'strict';
        if (P.params.scenario === 'overall-gap') c.answers.q4 = 'asc';
        c.activeIds = questions.map((q) => q.id); c.mode = 'full'; c.evaluation = evaluateCheckpoint(c); c.phase = 'results';
      }
      if (['targeted', 'full'].includes(P.params.mode) && c.phase !== 'intro') startRetake(c, P.params.mode === 'targeted');
    }
    return c;
  }
  function scoreQuestion(q, answer) {
    if (q.type === 'choice') return answer === q.correct ? 100 : 0;
    const value = String(answer || '');
    const where = /\bwhere\b/i.test(value) && /filter|keep|includ|which|restrict|match/i.test(value);
    const order = /\border\s+by\b/i.test(value) && /sort|arrang|largest|smallest|sequence/i.test(value);
    return Number(where) * 50 + Number(order) * 50;
  }
  function evaluateCheckpoint(c) {
    const scores = { ...c.scores };
    c.activeIds.forEach((id) => { const q = questions.find((item) => item.id === id); if (q) scores[id] = scoreQuestion(q, c.answers[id]); });
    c.scores = scores;
    const overallScore = Math.round(questions.reduce((n, q) => n + (scores[q.id] || 0), 0) / questions.length);
    const perOutcomeEvidence = {};
    outcomes.forEach((o) => { const related = questions.filter((q) => q.outcome === o.id); perOutcomeEvidence[o.id] = { score: Math.round(related.reduce((n, q) => n + (scores[q.id] || 0), 0) / related.length) }; });
    const failedOutcomeIds = outcomes.filter((o) => perOutcomeEvidence[o.id].score < 60).map((o) => o.id);
    const coreMet = outcomes.filter((o) => o.role === 'core').every((o) => perOutcomeEvidence[o.id].score >= 60);
    return { overallScore, perOutcomeEvidence, failedOutcomeIds, passed: overallScore >= 80 && coreMet, coreMet, feedback: questions.map((q) => ({ questionId: q.id, score: scores[q.id] || 0, explanation: q.explanation })) };
  }
  function startRetake(c, targeted) {
    const missed = c.evaluation?.failedOutcomeIds || [];
    c.activeIds = targeted ? questions.filter((q) => missed.includes(q.outcome) || (!missed.length && (c.scores[q.id] || 0) < 100)).map((q) => q.id) : questions.map((q) => q.id);
    if (!c.activeIds.length) c.activeIds = questions.map((q) => q.id);
    if (!targeted) { c.scores = {}; c.answers = {}; }
    else c.activeIds.forEach((id) => { delete c.answers[id]; });
    c.mode = targeted ? 'targeted' : 'full'; c.phase = 'player'; c.index = 0; c.error = ''; c.attempt += 1;
  }
  function checkpointRender(P) {
    const c = checkpointState(P);
    const head = `<header class="page-head"><div><p class="eyebrow">Query Grove · Chapter 1</p><h1>Chapter checkpoint</h1><p class="muted">Bring the ideas together, at your pace.</p></div>${button('Back to Trail', 'checkpoint-pause', 'quiet')}</header>`;
    if (c.phase === 'intro') {
      const completed = Array.isArray(P.state.completedSessions) ? P.state.completedSessions : [101, 102];
      const remaining = [101, 102, 103, 104].filter((id) => !completed.includes(id));
      const ready = P.params.scenario === 'ready' || (!remaining.length && P.params.scenario !== 'locked');
      return `${styles()}${head}<section class="panel stack"><p class="eyebrow">✦ A calm, focused review</p><h2>Show what you can do</h2><p>Bring the ideas from “Reading and filtering data” together.</p><div class="grid-3"><div class="stat"><strong>~8 min</strong><span class="muted">Take your time</span></div><div class="stat"><strong>80% overall</strong><span class="muted">To clear the Chapter</span></div><div class="stat"><strong>60%+</strong><span class="muted">On every core outcome</span></div></div><h3>What you’ll bring together</h3><p class="muted">4 learning outcomes from 4 Sessions</p><ul class="outcome-list">${outcomes.map((o) => `<li><span>${o.role === 'core' ? '✦' : '·'}</span><strong>${o.title}</strong><span class="pill">${o.role === 'core' ? 'Core' : 'Explore'}</span></li>`).join('')}</ul>${ready ? `<p class="muted">Answers save as you go. You can pause and come back whenever you need.</p>${button('Begin checkpoint →', 'checkpoint-start')}` : `<div class="alert"><strong>Your checkpoint will be here when you’re ready.</strong><p>Finish ${Math.max(1, remaining.length)} more Session${Math.max(1, remaining.length) === 1 ? '' : 's'} first. Your learning comes before the score.</p>${button('Continue learning →', 'checkpoint-continue')}</div>`}</section>`;
    }
    if (c.phase === 'results') {
      const e = c.evaluation || evaluateCheckpoint(c);
      const missed = outcomes.filter((o) => e.failedOutcomeIds.includes(o.id));
      return `${styles()}${head}<section class="panel stack"><div class="alert ${e.passed ? 'success' : 'warning'}" role="status"><p class="eyebrow">${e.passed ? 'A lovely bit of progress' : 'Every gap is a next step'}</p><h2>${e.passed ? 'Chapter checkpoint cleared' : 'You’re close — let’s strengthen a few ideas'}</h2><p>${e.passed ? 'You brought the Chapter together and showed the core ideas are sticking.' : 'Your outcome map shows what to practice next. Your earlier work still counts.'}</p></div><div class="card row"><div><strong class="learning-big-score">${e.overallScore}%</strong><p class="muted">Overall mastery</p></div><div><span class="pill">80% overall · 60% each core</span><p class="muted">${e.overallScore >= 80 ? 'Overall goal reached.' : 'Overall goal needs another pass.'} ${e.coreMet ? 'Core requirements met.' : 'A core requirement needs practice.'}</p></div></div><h3>Your outcome map</h3><ul class="outcome-list">${outcomes.map((o) => { const score = e.perOutcomeEvidence[o.id]?.score || 0; return `<li><span>${score >= 60 ? '✓' : '↗'}</span><div><strong>${o.title}</strong><p class="muted">${o.role === 'core' ? 'Core skill' : 'Supporting idea'} · ${score >= 60 ? 'looking solid' : 'worth another look'}</p></div><span class="pill">${score}%</span></li>`; }).join('')}</ul>${!e.passed ? `<div class="card stack"><h3>A gentle review path</h3><p>Revisit the related Session, then try a short checkpoint on the missed ideas.</p>${missed.length ? missed.map((o) => `<div class="row learning-wrap"><span>${o.title}</span>${button('Review related Session', 'checkpoint-review-session', 'secondary', `data-review-outcome="${o.id}"`)}</div>`).join('') : '<p class="muted">Each core outcome is covered. Practice the answers that will lift your overall score.</p>'}</div>` : ''}<details class="panel"><summary>See feedback on your answers</summary><div class="stack">${e.feedback.map((item) => { const q = questions.find((question) => question.id === item.questionId); const answer = c.answers[q.id]; const label = q.options?.find((option) => option.id === answer)?.label || answer || 'No response'; return `<article class="card"><h3>${P.escape(q.text)}</h3><p class="muted">${item.score}% · ${P.escape(item.explanation)}</p><p class="learning-preserve"><strong>Your answer:</strong> ${P.escape(label)}</p></article>`; }).join('')}</div></details><div class="row learning-wrap">${e.passed ? button('Continue your Trail →', 'checkpoint-finish') : `${button('Practice missed outcomes', 'checkpoint-targeted')}${button('Take full checkpoint again', 'checkpoint-full', 'secondary')}${button('Back to my Trail', 'checkpoint-pause', 'quiet')}`}</div><small class="muted">Sample assessment · fixed fixture answers, no external grading.</small></section>`;
    }
    const activeQuestions = c.activeIds.map((id) => questions.find((q) => q.id === id)).filter(Boolean);
    c.index = Math.max(0, Math.min(c.index, activeQuestions.length - 1));
    const q = activeQuestions[c.index];
    const answer = c.answers[q.id] || '';
    const answered = activeQuestions.filter((item) => String(c.answers[item.id] || '').trim()).length;
    return `${styles()}${head}<section class="panel stack"><div class="row learning-wrap"><div><p class="eyebrow">${c.mode === 'targeted' ? 'Targeted practice' : 'Chapter checkpoint'} · Attempt ${c.attempt}</p><h2>${c.mode === 'targeted' ? 'Strengthen the missed ideas' : 'Your learning, together'}</h2></div><span class="pill" id="checkpoint-save" role="status">Saved as you go</span></div>${c.mode === 'targeted' ? '<p class="muted">These answers update only the selected outcomes. Your other demonstrated skills are retained.</p>' : ''}${progress('Questions answered', answered, activeQuestions.length)}<nav class="row learning-wrap" aria-label="Checkpoint questions">${activeQuestions.map((item, i) => `<button class="button ${i === c.index ? 'secondary' : 'quiet'}" type="button" data-question-index="${i}" aria-label="Question ${i + 1}, ${c.answers[item.id] ? 'answered' : 'unanswered'}" ${i === c.index ? 'aria-current="step"' : ''}>${c.answers[item.id] ? '✓' : i + 1}</button>`).join('')}</nav>${c.error ? `<div class="alert danger" role="alert">${P.escape(c.error)}</div>` : ''}<article class="stack"><p class="eyebrow">Question ${c.index + 1} / ${activeQuestions.length}</p><h2 id="checkpoint-question-title" tabindex="-1">${P.escape(q.text)}</h2>${q.type === 'choice' ? `<fieldset class="stack learning-options"><legend class="sr-only">Choose one answer</legend>${q.options.map((option, i) => `<label class="choice ${answer === option.id ? 'is-selected' : ''}"><input type="radio" name="checkpoint-answer" value="${option.id}" ${answer === option.id ? 'checked' : ''}><span class="pill" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${P.escape(option.label)}</span></label>`).join('')}</fieldset>` : `<label class="field" for="checkpoint-written">Your response<textarea class="textarea" id="checkpoint-written" rows="6" maxlength="5000" placeholder="Write your thinking here…">${P.escape(answer)}</textarea><small class="muted">A few clear sentences are plenty. Show your thinking.</small></label>`}<p class="muted">This is a learning checkpoint, not a race. Revisit your answers before submitting.</p></article><div class="row learning-wrap">${button('← Previous', 'checkpoint-previous', 'secondary', c.index === 0 ? 'disabled' : '')}${c.index < activeQuestions.length - 1 ? button('Next question →', 'checkpoint-next') : button('Finish checkpoint', 'checkpoint-submit')}${button('Save & pause', 'checkpoint-pause', 'quiet')}</div></section>`;
  }
  function checkpointBind(P) {
    const c = checkpointState(P);
    const saveAnswer = (answer) => { const id = c.activeIds[c.index]; if (id) c.answers[id] = String(answer).slice(0, 5000); c.error = ''; P.save(); const status = P.q('#checkpoint-save'); if (status) status.textContent = 'Saved as you go'; };
    P.on('input[name="checkpoint-answer"]', 'change', (event) => { saveAnswer(event.currentTarget.value); P.refresh(); });
    P.on('#checkpoint-written', 'input', (event) => { saveAnswer(event.currentTarget.value); });
    P.on('[data-question-index]', 'click', (event) => { c.index = Number(event.currentTarget.dataset.questionIndex); c.error = ''; P.refresh(); });
    P.on('[data-action]', 'click', (event) => {
      const action = event.currentTarget.dataset.action;
      if (action === 'checkpoint-pause') { P.save(); P.go('trail'); }
      else if (action === 'checkpoint-continue') {
        const done = Array.isArray(P.state.completedSessions) ? P.state.completedSessions : [101, 102];
        const id = [101, 102, 103, 104].find((item) => !done.includes(item)) || 103; P.go('session', { id });
      } else if (action === 'checkpoint-start') { c.phase = 'player'; c.mode = 'full'; c.activeIds = questions.map((q) => q.id); c.index = 0; c.error = ''; P.refresh(); }
      else if (action === 'checkpoint-previous' || action === 'checkpoint-next') { c.index = Math.max(0, Math.min(c.activeIds.length - 1, c.index + (action === 'checkpoint-next' ? 1 : -1))); c.error = ''; P.refresh(); }
      else if (action === 'checkpoint-submit') {
        const missing = c.activeIds.filter((id) => !String(c.answers[id] || '').trim());
        if (missing.length) { c.index = c.activeIds.indexOf(missing[0]); c.error = `There ${missing.length === 1 ? 'is' : 'are'} still ${missing.length} unanswered question${missing.length === 1 ? '' : 's'}. We’ve taken you to the first one.`; P.refresh(); const control = P.q('input[name="checkpoint-answer"], #checkpoint-written'); control?.focus(); return; }
        c.evaluation = evaluateCheckpoint(c); c.phase = 'results';
        if (c.evaluation.passed) { P.state.checkpointPassed = true; P.celebrate(); }
        P.refresh();
      } else if (action === 'checkpoint-targeted' || action === 'checkpoint-full') { startRetake(c, action === 'checkpoint-targeted'); P.refresh(); }
      else if (action === 'checkpoint-review-session') {
        const outcome = event.currentTarget.dataset.reviewOutcome;
        P.go('session', { id: 103, scenario: 'review', block: outcome === 'projection' ? 'read' : outcome === 'filter' ? 'choice' : outcome === 'sort' ? 'ordering' : 'short_answer' });
      } else if (action === 'checkpoint-finish') { if (c.evaluation?.passed) P.state.checkpointPassed = true; P.save(); P.go('trail'); }
    });
  }
  function styles() {
    return `<style>
      .learning-layout{align-items:start}.learning-layout>.panel{min-width:0}.learning-guide{position:sticky;top:1rem}.learning-wrap{flex-wrap:wrap}.learning-options{border:0;padding:0;margin:0;min-width:0}.learning-options .choice{align-items:center;gap:.75rem}.learning-options input{width:1rem;height:1rem;flex:none;accent-color:var(--accent)}.learning-options .is-selected{border-color:var(--accent);background:var(--accent-soft)}.learning-worked{display:grid;gap:18px;padding:0;list-style:none}.learning-worked>li{display:flex;gap:1rem;align-items:start}.learning-worked>li>div{min-width:0;flex:1}.learning-order{padding:0;list-style:none}.learning-order>li>code{min-width:0;flex:1;overflow-wrap:anywhere}.learning-order>li{gap:.75rem}.learning-order .button{min-width:2.75rem}.learning-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.learning-preserve{white-space:pre-wrap;overflow-wrap:anywhere;margin:.5rem 0}.learning-messages{max-height:24rem;overflow:auto}.learning-messages p{overflow-wrap:anywhere;white-space:pre-wrap}.learning-message-user{background:var(--accent-soft)}.learning-big-score{font-size:clamp(2rem,5vw,3rem);color:var(--accent-strong)}.learning-complete-mark{font-size:3rem;color:var(--accent-strong)}.learning-layout pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--surface-alt);border:1px solid var(--border);border-radius:1rem;padding:1rem}.learning-layout dd{margin-left:0}.learning-layout table caption{text-align:left;padding:.5rem}.learning-layout h3{margin-top:0}@media(max-width:850px){.learning-guide{position:static}.learning-layout{grid-template-columns:1fr}.learning-order>li{flex-wrap:wrap}.learning-order>li>code{flex-basis:65%}}
    </style>`;
  }

  window.FullAppViews = window.FullAppViews || {};
  window.FullAppViews.session = { title: 'Session', render: sessionRender, bind: sessionBind };
  window.FullAppViews.checkpoint = { title: 'Chapter checkpoint', render: checkpointRender, bind: checkpointBind };
})();
