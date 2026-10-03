const {chromium}=require('/tmp/sbx-run/base/trace-sandbox/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base='http://127.0.0.1:3212/full-app/';
const out=__dirname;
let browser;
let activePage;
const errors=[];
async function go(page,view,params={}){await page.evaluate(({view,params})=>window.FullAppPrototype.go(view,params),{view,params});await page.waitForFunction(view=>window.FullAppPrototype.view===view,view);await page.locator('#view h1').waitFor();}
async function shot(page,name){await page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'));await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
async function main(){
 browser=await chromium.launch({executablePath:'/home/clive/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:1050}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.FullAppPrototype?.views.settings);
 assert.equal(await page.locator('.quest-node.current').count(),1);
 for(const theme of ['grove','midnight','tide','lilac','ember']){await page.locator('#theme-select').selectOption(theme);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);await shot(page,'trail-'+theme);}
 await page.locator('#theme-select').selectOption('grove');
 await go(page,'coverage');
 const routes=await page.locator('.coverage-tile [data-go]').evaluateAll(buttons=>buttons.map(b=>({view:b.dataset.go,params:JSON.parse(b.dataset.params||'{}')})));
 const tested=[];
 for(const route of routes){await go(page,route.view,route.params);assert.ok((await page.locator('#view').textContent()).trim().length>100);tested.push(route);}
 await go(page,'settings');await shot(page,'settings-light');
 await page.locator('[data-theme-choice="midnight"]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'midnight');await shot(page,'settings-dark');
 await go(page,'onboarding',{step:'preview'});await shot(page,'track-preview-dark');
 await go(page,'session',{block:'worked_example'});await shot(page,'session-dark');
 await go(page,'checkpoint',{scenario:'gaps'});await shot(page,'checkpoint-gaps-dark');
 await go(page,'reviews');await shot(page,'reviews-dark');
 await go(page,'continuation',{scenario:'preview'});await shot(page,'continuation-dark');
 for(const width of [320,390,768,1024]){
  await page.setViewportSize({width,height:844});
  for(const view of ['trail','onboarding','session','checkpoint','reviews','review','continuation','settings','coverage']){
   const params=view==='onboarding'?{step:'preview'}:view==='checkpoint'?{scenario:'ready'}:view==='continuation'?{scenario:'preview'}:{};
   await go(page,view,params);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert.equal(overflow,false,'Horizontal overflow in '+view+' at '+width);
  }
 }
 await page.setViewportSize({width:390,height:844});await go(page,'trail');await shot(page,'trail-mobile');
 await go(page,'session',{block:'choice'});await shot(page,'session-mobile');
 await go(page,'coverage');await shot(page,'coverage-mobile');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 const flows=activePage=await context.newPage();flows.setDefaultTimeout(7000);flows.on('pageerror',e=>errors.push(e.message));await flows.goto(base);
 await go(flows,'session',{id:103});
 await flows.locator('[data-action="continue-step"]').click();
 for(let i=0;i<3;i++)await flows.locator('[data-action="reveal"]').click();
 await flows.locator('#experiment-threshold').selectOption('200');await flows.locator('[data-action="experiment"]').click();
 assert.match(await flows.locator('.workbench').textContent(),/1 matching customer/);
 await flows.locator('[data-action="continue-step"]').click();
 await flows.locator('input[name="session-choice"][value="strict"]').check();await flows.locator('[data-action="check-choice"]').click();assert.match(await flows.locator('.alert.warning').textContent(),/excludes exactly 100/);
 await flows.locator('input[name="session-choice"][value="inclusive"]').check();await flows.locator('[data-action="check-choice"]').dblclick();assert.match(await flows.locator('#activity-title').textContent(),/boundary/);
 await flows.locator('[data-action="continue-step"]').click();
 await flows.getByRole('button',{name:'Move SELECT name, city up',exact:true}).click();
 await flows.getByRole('button',{name:'Move FROM customers up',exact:true}).click();await flows.getByRole('button',{name:'Move FROM customers up',exact:true}).click();
 await flows.locator('[data-action="check-order"]').click();await flows.locator('[data-action="continue-step"]').click();
 const sql='SELECT name, city\nFROM customers\nWHERE total_spent >= 100\nORDER BY total_spent DESC; -- my saved boundary answer';
 await flows.locator('#activity-response').fill(sql);await flows.locator('[data-action="check-written"]').click();await flows.locator('[data-action="continue-step"]').click();
 await flows.locator('#activity-response').fill('At least means the boundary is included. I will test exactly 100.');await flows.locator('[data-action="save-reflection"]').click();await flows.locator('[data-action="finish-session"]').click();
 assert.equal(await flows.locator('[data-session-node="103"]').getAttribute('class'),'quest-node done');
 await go(flows,'session',{id:103,scenario:'review',block:'short_answer'});assert.equal(await flows.locator('#activity-response').inputValue(),sql);assert.equal(await flows.locator('#activity-response').isDisabled(),true);await flows.reload();assert.equal(await flows.locator('#activity-response').inputValue(),sql);
 await go(flows,'session',{id:104,scenario:'build'});await flows.locator('[data-action="build-sample"]').click();await flows.getByRole('button',{name:'Submit Build',exact:true}).click();assert.match(await flows.locator('.alert.warning').textContent(),/Ready to revise/);await shot(flows,'build-revise-light');
 await flows.locator('[data-action="revise-build"]').click();await flows.locator('[data-action="build-strong"]').click();await flows.getByRole('button',{name:'Submit Build',exact:true}).click();assert.match(await flows.locator('.alert.success').textContent(),/Build complete/);await flows.locator('[data-action="finish-build"]').click();await flows.locator('[data-action="finish-session"]').click();
 await go(flows,'checkpoint');await flows.locator('[data-action="checkpoint-start"]').click();
 for(const answer of ['projection','inclusive','theo','desc']){await flows.locator('input[name="checkpoint-answer"][value="'+answer+'"]').check();await flows.locator('[data-action="checkpoint-next"]').click();}
 await flows.locator('#checkpoint-written').fill('WHERE filters included rows. ORDER BY sorts the result from largest to smallest.');await flows.locator('[data-action="checkpoint-submit"]').click();assert.match(await flows.locator('.alert.success').textContent(),/checkpoint cleared/);await flows.locator('[data-action="checkpoint-finish"]').click();assert.equal(await flows.evaluate(()=>window.FullAppPrototype.state.checkpointPassed),true);assert.equal(await flows.evaluate(()=>window.FullAppPrototype.state.trailStage),'active');
 await go(flows,'continuation');assert.match(await flows.locator('#view').textContent(),/Finish this Track first/);
 await go(flows,'reviews');await flows.locator('#review-start').click();
 for(const answer of ['A LEFT JOIN keeps every customer; unmatched orders become NULL.','WHERE filters rows before grouping; HAVING filters groups after aggregation.','COUNT counts non-null IDs; COUNT star counts the retained row.']){await flows.locator('#review-answer').fill(answer);await flows.locator('#review-submit').click();await flows.locator('#review-next').click();}
 assert.match(await flows.locator('#view').textContent(),/Practice complete/);
 await go(flows,'onboarding',{step:'destination'});await flows.locator('#setup-destination').fill('SQL Foundations');await flows.locator('#setup-destination-form button[type="submit"]').click();await flows.locator('[data-setup-action="skip-placement"]').click();await flows.locator('[data-setup-action="build-track"]').click();for(let i=0;i<3;i++)await flows.locator('[data-setup-action="check-generation"]').click();await flows.locator('[data-setup-action="confirm"]').click();assert.deepEqual(await flows.evaluate(()=>window.FullAppPrototype.state.completedSessions),[]);assert.equal(await flows.evaluate(()=>window.FullAppPrototype.state.checkpointPassed),false);
 await go(flows,'checkpoint',{scenario:'locked'});await flows.locator('[data-action="checkpoint-continue"]').click();assert.match(await flows.locator('#view h1').textContent(),/Think in tables/);
 await go(flows,'continuation',{scenario:'complete'});await flows.locator('#continuation-generate').click();await flows.locator('#continuation-reveal').click();await flows.locator('#continuation-confirm').click();await flows.waitForFunction(()=>window.FullAppPrototype.view==='trail');assert.notEqual(await flows.evaluate(()=>window.FullAppPrototype.state.trailTitle),'SQL Foundations');assert.deepEqual(await flows.evaluate(()=>window.FullAppPrototype.state.completedSessions),[]);
 await go(flows,'settings');
 const [download]=await Promise.all([flows.waitForEvent('download'),flows.locator('#settings-export').click()]);const fixture=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(fixture.format,'mastery-trail-prototype');
 const invalid=structuredClone(fixture);delete invalid.state.completedSessions;await flows.locator('#settings-import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await flows.locator('.alert.danger').waitFor();assert.equal(await flows.locator('#global-dialog').isVisible(),false);
 await flows.locator('#settings-import-file').setInputFiles({name:'sample.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await flows.locator('#settings-import-confirm').click();assert.match(await flows.locator('.alert.success').filter({hasText:'Demo import complete'}).textContent(),/import complete/);
 await flows.locator('#settings-connect').click();await go(flows,'onboarding',{step:'learning_rhythm'});assert.equal(await flows.locator('[data-setup-action="build-track"]').isDisabled(),true);await go(flows,'settings');await flows.locator('#settings-connect').click();await flows.locator('#settings-connect-confirm').click();await go(flows,'onboarding',{step:'learning_rhythm'});assert.equal(await flows.locator('[data-setup-action="build-track"]').isEnabled(),true);
 const denied=await browser.newContext();await denied.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage denied')};Storage.prototype.setItem=()=>{throw new Error('Storage denied')};});const deniedPage=await denied.newPage();deniedPage.on('pageerror',e=>errors.push(e.message));await deniedPage.goto(base);await deniedPage.locator('#view h1').waitFor();assert.match(await deniedPage.locator('#storage-status').textContent(),/page is open/);
 assert.deepEqual(errors,[]);
 const report={result:'pass',scenarioCount:tested.length,themes:5,viewportWidths:[320,390,768,1024,1440],errors,connectedChecks:['Six activity types, wrong/correct feedback, double-click guard, and readonly saved response after reload','Build draft, revision, passed assessment and Chapter prerequisite unlock','Checkpoint passes core requirements without prematurely completing the Track','Retrieval practice, feedback, summary and schedule','New Track setup and continuation reset progress and preserve prior Track','Sample export/import, required-field validation and confirmation','Shared provider readiness gates onboarding; denied browser storage fallback'],scenarios:tested};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({result:'pass',scenarioCount:tested.length,themes:5,widths:report.viewportWidths,errors}));
}
main().catch(async e=>{console.error(e);console.error('Browser errors: '+JSON.stringify(errors));if(activePage){await activePage.screenshot({path:path.join(out,'failed-flow.png'),fullPage:true});console.error(await activePage.evaluate(()=>({hash:location.hash,view:window.FullAppPrototype.view,state:window.FullAppPrototype.state.onboarding})));}process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
