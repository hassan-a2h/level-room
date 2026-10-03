const ICONS={
 trail:'<path d="M4 19c0-5 16-1 16-7S4 9 4 4"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="19" r="2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>',chevron:'<path d="m9 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2l-5-4.9 6.9-1L12 2Z"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',book:'<path d="M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2V4Zm9 2v15"/>',
 build:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
 review:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/><path d="M12 7v5l3 2"/>',
 leaf:'<path d="M20 3c-9-1-17 2-16 10s10 10 15 1c2-4 2-7 1-11Z"/><path d="m5 20 10-11m-4 4V8m0 5h6"/>',
 map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
 pointer:'<path d="m4 3 6 18 3-7 7-3L4 3Z"/>',
 join:'<circle cx="8" cy="12" r="6"/><circle cx="16" cy="12" r="6"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 flask:'<path d="M9 3h6m-5 0v6l-6 10c-1 2 0 3 2 3h12c2 0 3-1 2-3L14 9V3M7 16h10"/><path d="M10 13h.01m3 5h.01"/>',
 spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
 flag:'<path d="M5 21V3h13l-3 4 3 4H5"/>',gem:'<path d="m7 3-5 6 10 13L22 9l-5-6H7Zm-5 6h20M7 3l5 19 5-19"/>',
 hint:'<path d="M8 16c0-2-3-3-3-7a7 7 0 1 1 14 0c0 4-3 5-3 7m-8 0h8m-7 3h6m-5 3h4"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 table:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/>',
 filter:'<path d="M3 4h18l-7 8v8l-4-2v-6L3 4Z"/>',
 shop:'<path d="M4 10v11h16V10M2 10l3-7h14l3 7M2 10q3 4 5 0 3 4 5 0 3 4 5 0 3 4 5 0"/><path d="M9 21v-7h6v7"/>'
};
function icon(name){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[name]||ICONS.spark)+'</svg>'}
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)})}
hydrate();
const $=selector=>document.querySelector(selector);
const STORAGE_KEY='mastery-trail-playground-v2-demo';
function freshState(){return {version:1,joins:false,build:false,recall:false,checkpoint:false,stage:0,prediction:'',join:'INNER',transfer:'',stagePassed:false}}
function loadState(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  if(!saved||saved.version!==1||!['joins','build','recall','checkpoint','stagePassed'].every(k=>typeof saved[k]==='boolean'))return freshState();
  if((saved.build&&!saved.joins)||(saved.recall&&!saved.build)||(saved.checkpoint&&!saved.recall)||!Number.isInteger(saved.stage)||saved.stage<0||saved.stage>2)return freshState();
  if(!['','2','3'].includes(saved.prediction)||!['INNER','LEFT','RIGHT'].includes(saved.join)||!['','NULL','ZERO','OMIT'].includes(saved.transfer))return freshState();
  const result={...freshState(),...saved};
  if(result.stagePassed&&!([result.prediction==='3',result.join==='LEFT',result.transfer==='NULL'][result.stage]))result.stagePassed=false;
  return result;
 }catch{return freshState()}
}
let state=loadState(),hintOpen=false,feedback=null,toastTimer,xpTimer;
const dialogTriggers=new WeakMap();
const MISSIONS=[
 {id:'tables',title:'Think in tables',kind:'table',description:'Organise real information into rows and columns.',earned:true},
 {id:'filters',title:'Find the interesting rows',kind:'filter',description:'Use WHERE to ask a sharper question.',earned:true},
 {id:'joins',title:'Nobody left behind',kind:'join',description:'Keep every customer in a report, even when they have no orders.'},
 {id:'build',title:'Build a customer report',kind:'build',description:'Make a useful report and explain the missing values.',futureLabel:'YOUR FIRST BUILD'},
 {id:'recall',title:'A quick recall',kind:'review',description:'Retrieve the idea without needing your notes.',futureLabel:'PRACTICE PATCH'},
 {id:'checkpoint',title:'The chapter challenge',kind:'flag',description:'Show what you can do with another fresh dataset.',futureLabel:'NEXT CHAPTER AHEAD'}
];
function save(){
 try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('#storage-note').textContent='progress saved in this tab';$('#lab-save-note').textContent='Saved in this tab.'}
 catch{$('#storage-note').textContent='progress stays while this page is open';$('#lab-save-note').textContent='Kept while this page is open.'}
}
function xp(){return 140+(state.joins?60:0)+(state.build?40:0)+(state.recall?20:0)+(state.checkpoint?40:0)}
function earned(id){return id==='tables'||id==='filters'||Boolean(state[id])}
function currentMission(){return MISSIONS.find(m=>!earned(m.id))||null}
function toast(message){
 $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4300);
}
function showXP(amount){
 $('#xp-toast').textContent='+'+amount+' XP · earned through practice';$('#xp-toast').classList.add('visible');clearTimeout(xpTimer);
 xpTimer=setTimeout(()=>$('#xp-toast').classList.remove('visible'),3600);
}
function openDialog(dialog,trigger){
 if(dialog.open){if(!dialog.contains(document.activeElement))dialog.querySelector('button,input,select')?.focus();return}
 dialogTriggers.set(dialog,trigger||document.activeElement);
 dialog.showModal();
}
function closeDialog(dialog){dialog.close()}
document.querySelectorAll('dialog').forEach(dialog=>{
 dialog.addEventListener('close',()=>requestAnimationFrame(()=>{if(!$('dialog[open]')){const trigger=dialogTriggers.get(dialog);if(trigger?.isConnected)trigger.focus()}}));
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
 });
});
document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>closeDialog(document.getElementById(el.dataset.close))));
function drawRoute(){
 const board=$('#world-map'),svg=$('.route'),r=board.getBoundingClientRect();
 const pts=[...document.querySelectorAll('.quest-node')].map(node=>{const n=node.getBoundingClientRect();return {x:n.left-r.left+n.width/2,y:n.top-r.top+n.height/2}});
 const segments=pts.slice(1).map((p,i)=>{const a=pts[i],mid=(a.y+p.y)/2;return 'C '+a.x+' '+mid+', '+p.x+' '+mid+', '+p.x+' '+p.y});
 const d='M '+pts[0].x+' '+pts[0].y+' '+segments.join(' ');
 svg.setAttribute('viewBox','0 0 '+r.width+' '+r.height);
 svg.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));
 const progress=svg.querySelector('.route-earned'),completed=MISSIONS.filter(m=>earned(m.id)).length;
 progress.setAttribute('pathLength','1000');progress.style.strokeDasharray='1000';progress.style.strokeDashoffset=String(1000*(1-(completed-1)/5));
}
function renderDashboard(){
 const current=currentMission(),count=MISSIONS.filter(m=>earned(m.id)).length,total=xp(),level=total>=200?3:2,levelXP=level===3?total-200:total,levelCap=level===3?250:200;
 $('#header-level').textContent='Level '+level;$('#xp-total').textContent=total+' XP';$('#xp-until').textContent=(levelCap-levelXP)+' to your next level';$('#xp-fill').style.width=(levelXP/levelCap*100)+'%';
 $('#xp-progress').setAttribute('aria-valuemax',String(levelCap));$('#xp-progress').setAttribute('aria-valuenow',String(levelXP));
 $('#milestone-count').textContent=count+' of 6';$('#daily-count').textContent=(Number(state.joins)+Number(state.build))+'/2';$('#daily-fill').style.width=((Number(state.joins)+Number(state.build))*50)+'%';
 for(const [id,done]of[['lab',state.joins],['build',state.build]]){const check=$('#daily-'+id+'-check');check.classList.toggle('checked',done);check.innerHTML=done?icon('check'):''}
 const here=$('#you-are-here');
 document.querySelectorAll('.quest-node').forEach((node,i)=>{
  const mission=MISSIONS[i],done=earned(mission.id),ready=mission.id===current?.id;
  node.className='quest-node'+(mission.id==='checkpoint'?' checkpoint-node':'')+(done?' is-done':ready?' is-current':' is-future');
  node.innerHTML=icon(done?'check':mission.kind);
  node.dataset.state=done?'completed':ready?'ready':'upcoming';
  node.setAttribute('aria-label',mission.title+', '+(done?'completed, review skill':ready?'ready, start mission':'upcoming, preview requirements'));
  const stars=node.parentElement.querySelector('.node-stars');
  if(stars){stars.textContent=done?'✦ ✦ ✦':'✧ ✧ ✧';stars.classList.toggle('unearned',!done)}
  if(ready){node.parentElement.prepend(here);here.hidden=false;here.textContent=mission.id==='build'?'READY TO BUILD':'YOU’RE HERE'}
  const text=node.closest('.mission-row').querySelector('.node-copy>span');
  if(done){text.className='done-label';text.textContent=mission.id==='joins'||mission.id==='tables'||mission.id==='filters'?'SKILL EARNED':'MISSION COMPLETE'}
  else if(ready){text.className='ready-label';text.textContent=mission.id==='joins'?'3 TINY CHALLENGES · +60 XP':mission.id==='build'?'TURN YOUR SKILL INTO A BUILD · +40 XP':mission.id==='recall'?'RETRIEVE ONE IDEA · +20 XP':'PROVE IT ON A NEW DATASET · +40 XP'}
  else{text.className='type-label';text.textContent=mission.futureLabel||'STILL TO EXPLORE'}
 });
 if(!current)here.hidden=true;
 const cardCopy={
  joins:['Nobody left behind.','What happens when a customer has no orders? Play with two tiny tables and find out.','Start the mission','~4 min','Earn a joins skill · unlock a real Build'],
  build:['Make it useful.','Turn your joins skill into a customer report. A small Build you can keep and explain.','Start my first Build','~3 min','Make a report · earn +40 XP'],
  recall:['Make it stick.','One little question brings the idea back into reach. Try it before you look at your notes.','Try a quick recall','~1 min','Retrieve an idea · earn +20 XP'],
  checkpoint:['Your chapter challenge.','A fresh shop. A new dataset. Show that you can carry the idea somewhere new.','Take the chapter challenge','~2 min','Complete Query Grove · earn +40 XP']
 };
 const copy=current?cardCopy[current.id]:['Query Grove, explored.','Six milestones. A useful new skill. A customer report you built yourself. Take a moment to enjoy that.','See what I’ve learned','CHAPTER COMPLETE','Your next chapter is waiting'];
 $('#next-title').textContent=copy[0];$('#next-description').textContent=copy[1];$('#mission-cta-label').textContent=copy[2];$('#mission-duration').textContent=copy[3];$('#mission-reward-copy').textContent=copy[4];
 $('#mobile-current-title').textContent=current?.title||'Query Grove, explored';$('#mobile-current-label').textContent=current?'YOUR NEXT MISSION':'CHAPTER COMPLETE';$('#mobile-cta-label').textContent=current?.id==='joins'?'Let’s play':current?.id==='build'?'Let’s build':current?'Continue':'My skills';
 $('#mission-pill').innerHTML=icon(current?'bolt':'check')+(current?'YOUR NEXT MISSION':'CHAPTER COMPLETE');
 $('#collection-summary').textContent=(2+Number(state.joins)+Number(state.build))+' skills you can use';
 $('#milestone-banner').hidden=!state.joins;
 $('#banner-title').textContent=state.checkpoint?'Query Grove, explored.':state.build?'A real report, made by you.':'A new skill, earned.';
 $('#banner-copy').textContent=state.checkpoint?'You carried the idea into a new example. Your next chapter is ahead.':state.build?'Your customer report is in My builds. A quick recall is ready.':'Joins demonstrated. Your first customer report is ready to build.';
 drawRoute();
}
function tablesHTML(customers=[['1','Amina'],['2','Noah'],['3','Emi']],orders=[['1','$48'],['3','$72']]){
 const rows=data=>data.map(row=>'<tr'+(row[1]==='Noah'||row[1]==='Sol'?' class="no-match"':'')+'><td>'+row[0]+'</td><td>'+row[1]+'</td></tr>').join('');
 return '<div class="mini-tables"><div class="table-box"><div class="table-caption">CUSTOMERS</div><table aria-label="Customers"><thead><tr><th>id</th><th>name</th></tr></thead><tbody>'+rows(customers)+'</tbody></table></div><div class="table-box orders"><div class="table-caption">ORDERS</div><table aria-label="Orders"><thead><tr><th>customer_id</th><th>total</th></tr></thead><tbody>'+rows(orders)+'</tbody></table></div></div>';
}
const HINTS=[
 'Noah hasn’t ordered yet, but he is still a customer. Before you worry about SQL, think about the shop owner’s goal: who belongs in a report of every customer?',
 'Watch Noah’s row as you switch joins. The customers table is on the left. Which join keeps that table’s rows when an order is missing?',
 'An order worth $0 is a recorded value. Sol has no recorded order at all. How would you represent “we don’t have a value” rather than “the value is zero”?'
];
function outputHTML(rows,title='YOUR RESULT'){
 return '<div class="output-table"><div class="output-title"><span>'+title+'</span><strong>'+rows.length+' customers</strong></div><table aria-label="Query result"><thead><tr><th>customer</th><th>order total</th></tr></thead><tbody>'+rows.map(row=>'<tr class="row-enter"><td>'+row[0]+'</td><td'+(row[1]==='NULL'?' class="null-value"':'')+'>'+row[1]+'</td></tr>').join('')+'</tbody></table></div>';
}
function joinedRows(join){
 const customers=[{id:1,name:'Amina'},{id:2,name:'Noah'},{id:3,name:'Emi'}],orders=[{id:1,total:48},{id:3,total:72}];
 const rows=[];
 customers.forEach(c=>{const matches=orders.filter(o=>o.id===c.id);if(matches.length)matches.forEach(o=>rows.push([c.name,'$'+o.total]));else if(join==='LEFT')rows.push([c.name,'NULL'])});
 return rows;
}
function labTitleBlock(eyebrow,title,copy,customerTitle,customerCopy){
 return '<section class="stage-story"><p class="eyebrow">'+eyebrow+'</p><h3 id="stage-title" tabindex="-1">'+title+'</h3><p class="story-copy">'+copy+'</p><div class="story-customer"><span class="customer-avatar">'+(state.stage===2?'S':'N')+'</span><div><strong>'+customerTitle+'</strong><p>'+customerCopy+'</p></div></div><div class="hint-panel" id="hint-panel"'+(hintOpen?'':' hidden')+'>'+HINTS[state.stage]+'</div><div class="stage-feedback" id="stage-feedback" role="region" aria-label="Mission feedback" aria-live="polite" hidden></div></section>';
}
function tile(name,value,strong,small,checked,disabled){
 return '<label class="answer-tile"><input type="radio" name="'+name+'" value="'+value+'"'+(checked?' checked':'')+(disabled?' disabled':'')+'><strong>'+strong+'</strong><small>'+small+'</small></label>';
}
function renderLab(focusHeading=false){
 const stage=state.stage;
 document.querySelectorAll('[data-stage]').forEach(el=>{const index=Number(el.dataset.stage);el.classList.toggle('active',index===stage);el.classList.toggle('complete',index<stage||(index===stage&&state.stagePassed));el.querySelector('i').innerHTML=index<stage||(index===stage&&state.stagePassed)?icon('check'):String(index+1)});
 $('#lab-stars').textContent=Array.from({length:3},(_,i)=>i<stage+(state.stagePassed?1:0)?'✦':'✧').join(' ');
 $('#lab-stars').setAttribute('aria-label',(stage+(state.stagePassed?1:0))+' of 3 mission stars earned');
 let story,workspace;
 if(stage===0){
  story=labTitleBlock('CHALLENGE 1 OF 3 · PREDICT','Who belongs in the report?','The shop owner wants a report of <strong>every customer</strong>, with an order total when there is one. Before writing a query, predict how many customers should appear.','Noah is still a customer.','He just hasn’t placed an order yet.');
  workspace='<section class="stage-workspace"><p class="workspace-title">'+icon('eye')+'LOOK FIRST. MAKE A PREDICTION.</p>'+tablesHTML()+'<fieldset class="prediction-group"><legend>How many customers should the report contain?</legend><div class="prediction-options">'+tile('prediction','2','2','Only customers with orders',state.prediction==='2',state.stagePassed)+tile('prediction','3','3','Every customer in the shop',state.prediction==='3',state.stagePassed)+'</div></fieldset></section>';
 }else if(stage===1){
  story=labTitleBlock('CHALLENGE 2 OF 3 · EXPERIMENT','Pull a lever.<br>Watch what changes.','Switch between joins and watch the result. Your mission is to keep <strong>all three customers</strong>. Try the options; a useful wrong turn is part of the experiment.','Keep an eye on Noah.','Does he stay when you change the join?');
  workspace='<section class="stage-workspace"><p class="workspace-title">'+icon('flask')+'YOUR JOINS LAB</p><fieldset class="join-switch"><legend>Change the join. See the result.</legend>'+['INNER','LEFT','RIGHT'].map(join=>'<label class="join-chip"><input type="radio" name="join" value="'+join+'"'+(state.join===join?' checked':'')+(state.stagePassed?' disabled':'')+'>'+join+' JOIN</label>').join('')+'</fieldset><div class="relation-board" id="relation-board"><svg class="relation-lines" aria-hidden="true"></svg><div class="relation-column"><p class="relation-column-title">Customers</p>'+['Amina','Noah','Emi'].map((name,i)=>'<div class="relation-row" data-customer="'+(i+1)+'"><span>'+name+'</span><span class="tiny-id">'+(i+1)+'</span></div>').join('')+'</div><div class="relation-column"><p class="relation-column-title">Orders</p><div class="relation-row order" data-order="1"><span>$48</span><span class="tiny-id">id 1</span></div><div class="relation-row order" data-order="3"><span>$72</span><span class="tiny-id">id 3</span></div></div></div><p class="join-caption" id="join-caption"></p><pre class="query-strip">SELECT c.name, o.total\nFROM customers c\n<strong id="active-join">INNER JOIN</strong> orders o ON c.id = o.customer_id;</pre><div id="join-output"></div></section>';
 }else{
  story=labTitleBlock('CHALLENGE 3 OF 3 · APPLY','A different shop.<br>The same useful idea.','You’ve learned how to keep customers in a report. Now carry that idea into a new example. You’re using <strong>LEFT JOIN</strong> for a different shop.','Sol hasn’t ordered yet.','What belongs in the order total column?');
  workspace='<section class="stage-workspace"><p class="new-shop-label">'+icon('shop')+'A FRESH LITTLE SHOP</p>'+tablesHTML([['11','Lila'],['12','Oscar'],['13','Sol']],[['11','$32'],['12','$18']])+'<fieldset class="transfer-group"><legend>What should the report show for Sol?</legend><div class="transfer-options">'+tile('transfer','ZERO','$0','A recorded zero',state.transfer==='ZERO',state.stagePassed)+tile('transfer','NULL','NULL','No recorded value',state.transfer==='NULL',state.stagePassed)+tile('transfer','OMIT','Skip','Leave Sol out',state.transfer==='OMIT',state.stagePassed)+'</div></fieldset><div id="transfer-output"></div></section>';
 }
 $('#lab-content').innerHTML='<div class="stage-layout">'+story+workspace+'</div>';
 if(stage===0)document.querySelectorAll('input[name="prediction"]').forEach(input=>input.addEventListener('change',()=>{state.prediction=input.value;feedback=null;save();updateFeedback();updateLabAction()}));
 if(stage===1){document.querySelectorAll('input[name="join"]').forEach(input=>input.addEventListener('change',()=>{state.join=input.value;feedback=null;save();updateFeedback();updateExperiment();updateLabAction()}));updateExperiment()}
 if(stage===2){document.querySelectorAll('input[name="transfer"]').forEach(input=>input.addEventListener('change',()=>{state.transfer=input.value;feedback=null;save();updateFeedback();updateTransfer();updateLabAction()}));updateTransfer()}
 $('#lab-hint').setAttribute('aria-expanded',String(hintOpen));$('#hint-label').textContent=hintOpen?'Hide the nudge':'A little nudge';
 updateFeedback();updateLabAction();
 if(focusHeading)$('#stage-title').focus({preventScroll:true});
}
function drawRelations(){
 const board=$('#relation-board');if(!board)return;
 const svg=board.querySelector('svg'),r=board.getBoundingClientRect();
 svg.setAttribute('viewBox','0 0 '+r.width+' '+r.height);
 svg.innerHTML=[1,3].map(id=>{const a=board.querySelector('[data-customer="'+id+'"]').getBoundingClientRect(),b=board.querySelector('[data-order="'+id+'"]').getBoundingClientRect();const x=a.right-r.left,y=a.top-r.top+a.height/2,tx=b.left-r.left,ty=b.top-r.top+b.height/2,mid=(x+tx)/2;return '<path d="M '+x+' '+y+' C '+mid+' '+y+', '+mid+' '+ty+', '+tx+' '+ty+'" stroke="#9bbf77" stroke-width="2" fill="none" stroke-dasharray="4 3"/>'}).join('');
}
function updateExperiment(){
 $('#active-join').textContent=state.join+' JOIN';
 const left=state.join==='LEFT';
 $('#join-caption').textContent=left?'Every customer stays. Noah’s missing order becomes NULL.':state.join==='INNER'?'Only matching rows stay. Noah has no order, so he disappears.':'Every order stays. With this dataset, Noah still has no matching order.';
 $('#relation-board [data-customer="2"]').classList.toggle('included',left);
 $('#relation-board [data-customer="2"]').classList.toggle('missing',!left);
 $('#join-output').innerHTML=outputHTML(joinedRows(state.join));
 drawRelations();
}
function updateTransfer(){
 const rows=[['Lila','$32'],['Oscar','$18']];
 if(state.transfer!=='OMIT')rows.push(['Sol',state.transfer==='NULL'?'NULL':state.transfer==='ZERO'?'$0':'?']);
 $('#transfer-output').innerHTML=outputHTML(rows,'YOUR NEW SHOP REPORT');
}
function successFeedback(){
 return [
  {title:'You started with the right goal.',copy:'All three customers belong in the report. Now make the query match that prediction.'},
  {title:'Nobody was left behind.',copy:'LEFT JOIN keeps every row from customers. When Noah has no matching order, his order total is NULL.'},
  {title:'You carried the idea somewhere new.',copy:'NULL means there is no recorded order total. Sol stays in the report; you haven’t invented a $0 order.'}
 ][state.stage];
}
function updateFeedback(){
 const region=$('#stage-feedback');if(!region)return;
 const value=feedback||(state.stagePassed?successFeedback():null);
 region.hidden=!value;if(!value)return;
 region.className='stage-feedback'+(value.error?' error':'');
 region.innerHTML='<strong>'+icon(value.error?'review':'check')+value.title+'</strong><p>'+value.copy+'</p>';
}
function updateLabAction(){
 const action=$('#lab-action');
 const labels=['Check my prediction','Check my query','Check the new report'];
 const next=['Open the experiment','Try a fresh example','Collect my new skill'];
 action.innerHTML=(state.stagePassed?next[state.stage]:labels[state.stage])+icon('arrow');
 action.disabled=!state.stagePassed&&(state.stage===0?!state.prediction:state.stage===2?!state.transfer:false);
}
function openLab(replay=false,trigger){
 if(replay){state.stage=0;state.prediction='';state.join='INNER';state.transfer='';state.stagePassed=false;save()}
 feedback=null;hintOpen=false;renderLab();openDialog($('#lab-dialog'),trigger);
 requestAnimationFrame(()=>{if(state.stage===1)drawRelations()});
}
$('#lab-hint').addEventListener('click',()=>{
 hintOpen=!hintOpen;$('#hint-panel').hidden=!hintOpen;$('#lab-hint').setAttribute('aria-expanded',String(hintOpen));$('#hint-label').textContent=hintOpen?'Hide the nudge':'A little nudge';
});
$('#lab-action').addEventListener('click',event=>{
 if(event.detail>1)return;
 if(state.stagePassed){
  if(state.stage<2){state.stage++;state.stagePassed=false;feedback=null;hintOpen=false;save();renderLab(true);return}
  const first=!state.joins;state.joins=true;save();closeDialog($('#lab-dialog'));renderDashboard();
  if(first){$('#earned-level').textContent='Level '+(xp()>=200?3:2);openDialog($('#earned-dialog'),$('#start-mission'));showXP(60)}
  else toast('Skill refreshed. Your earned progress stays with you.');
  return;
 }
 const correct=[state.prediction==='3',state.join==='LEFT',state.transfer==='NULL'][state.stage];
 if(correct){state.stagePassed=true;feedback=successFeedback();save();renderLab()}
 else{
  feedback=[
   {error:true,title:'A customer is missing.',copy:'Noah hasn’t placed an order, but he still belongs to the shop. Try a report that includes him.'},
   {error:true,title:'Where did Noah go?',copy:'This result has only two customers. Try another join and watch Noah’s row.'},
   {error:true,title:state.transfer==='ZERO'?'Missing is different from zero.':'Sol still belongs in the report.',copy:state.transfer==='ZERO'?'A $0 order would be a recorded value. Sol has no order recorded. How can you show that difference?':'The shop owner still wants every customer. Keep Sol and show that the total is missing.'}
  ][state.stage];updateFeedback();
 }
 const region=$('#stage-feedback');region.setAttribute('tabindex','-1');region.focus({preventScroll:true});
});
function detail(title,body,trigger){
 $('#detail-title').textContent=title;$('#detail-body').innerHTML=body;hydrate($('#detail-body'));openDialog($('#detail-dialog'),trigger);
}
function collection(){
 const tokens=[['table','Tables','Rows & columns',true],['filter','Filters','Sharper questions',true],['join','Joins','Nobody left out',state.joins],['build','Reports','A useful Build',state.build]];
 detail('Your skill collection','<p class="eyebrow">CAPABILITY, COLLECTED.</p><h3>Little ideas you can use.</h3><p>These tokens are earned by demonstrating a skill. Open a completed mission to revisit the idea.</p><div class="collection-grid">'+tokens.map(([kind,name,copy,done])=>'<div class="skill-token'+(done?'':' upcoming')+'"><span>'+icon(done?kind:'lock')+'</span><strong>'+name+'</strong><small>'+copy+'</small><span class="reward-stars">'+(done?'✦ ✦ ✦':'Still to explore')+'</span></div>').join('')+'</div><p class="demo-note">This is sample learning progress for the prototype.</p>');
}
function earnedMission(mission,trigger){
 detail('A skill you’ve earned','<p class="eyebrow">COMPLETED MISSION</p><h3>'+mission.title+'</h3><p>'+mission.description+'</p><ul><li>You demonstrated this idea through practice.</li><li>Revisiting it keeps your progress intact.</li><li>Repeating a mission does not duplicate XP.</li></ul><div class="detail-actions">'+(mission.id==='joins'?'<button class="button primary" id="replay-lab" type="button">Play the lab again '+icon('review')+'</button>':'<button class="button secondary" id="skill-collection-action" type="button">See my skill collection '+icon('gem')+'</button>')+'</div>',trigger);
 $('#replay-lab')?.addEventListener('click',()=>{closeDialog($('#detail-dialog'));openLab(true,$('#start-mission'))});
 $('#skill-collection-action')?.addEventListener('click',()=>collection());
}
function lockedMission(mission,trigger){
 const index=MISSIONS.indexOf(mission),previous=MISSIONS[index-1];
 detail('A little further along your trail','<p class="eyebrow">COMING UP · '+mission.id.toUpperCase()+'</p><h3>'+mission.title+'</h3><p>'+mission.description+'</p><ul><li>Opens after '+previous.title.toLowerCase()+'.</li><li>Your roadmap has a clear next step; you can preview what’s ahead.</li></ul><div class="detail-actions"><button type="button" class="button primary" id="return-current">Try my current mission '+icon('arrow')+'</button></div>',trigger);
 $('#return-current').addEventListener('click',()=>{closeDialog($('#detail-dialog'));startCurrent()});
}
function openBuild(trigger){
 if(!state.joins){lockedMission(MISSIONS[3],trigger);return}
 if(state.build){
  detail('Your first Build','<p class="eyebrow">CUSTOMER REPORT · CREATED BY YOU</p><h3>A report with nobody left out.</h3><p>You used LEFT JOIN, kept every customer, and represented missing orders with NULL.</p>'+outputHTML([['Amina','$48'],['Noah','NULL'],['Emi','$72']],'YOUR COMPLETED BUILD')+'<div class="detail-actions"><button class="button primary" id="build-next" type="button">Find my next mission '+icon('arrow')+'</button></div>',trigger);
  $('#build-next').addEventListener('click',()=>{closeDialog($('#detail-dialog'));startCurrent()});return;
 }
 detail('Build 01 · your customer report','<p class="eyebrow">PUT THE IDEA TO WORK · +40 XP</p><h3>Make a useful little report.</h3><p>Include every customer. Choose the join and decide how to represent a missing order total. Your preview updates as you build.</p><form id="build-form"><div class="build-fields"><label for="build-join">How should the tables connect?<select id="build-join"><option value="">Choose a join</option><option value="INNER">INNER JOIN</option><option value="LEFT">LEFT JOIN</option><option value="RIGHT">RIGHT JOIN</option></select></label><label for="build-missing">What should a missing order total show?<select id="build-missing"><option value="">Choose a missing value</option><option value="ZERO">$0 · a recorded zero</option><option value="NULL">NULL · no recorded value</option></select></label></div><div id="build-live-preview"></div><p class="build-error" id="build-error" role="alert" hidden></p><div class="detail-actions"><button class="button primary" type="submit">Finish my report '+icon('check')+'</button></div></form><p class="demo-note">This prototype checks the two report choices on the small sample dataset.</p>',trigger);
 const updatePreview=()=>{const join=$('#build-join').value,missing=$('#build-missing').value;$('#build-error').hidden=true;if(!join){$('#build-live-preview').innerHTML='';return}const rows=joinedRows(join).map(([name,total])=>[name,total==='NULL'&&missing==='ZERO'?'$0':total==='NULL'&&!missing?'?':total]);$('#build-live-preview').innerHTML=outputHTML(rows,'YOUR BUILD PREVIEW')};
 $('#build-join').addEventListener('change',updatePreview);$('#build-missing').addEventListener('change',updatePreview);
 $('#build-form').addEventListener('submit',event=>{
  event.preventDefault();
  if($('#build-join').value!=='LEFT'||$('#build-missing').value!=='NULL'){$('#build-error').hidden=false;$('#build-error').textContent='Make sure every customer stays, including Noah, and distinguish a missing total from a recorded $0 order.';return}
  state.build=true;save();renderDashboard();showXP(40);
  $('#detail-body').innerHTML='<p class="eyebrow">YOUR FIRST BUILD · COMPLETE</p><h3>You made something useful.</h3><p>A report with all three customers. Nobody left behind, and no invented order total.</p>'+outputHTML([['Amina','$48'],['Noah','NULL'],['Emi','$72']],'YOUR COMPLETED CUSTOMER REPORT')+'<p class="build-done">'+icon('check')+'Report complete · +40 XP · saved in this demo tab</p><div class="detail-actions"><button class="button primary" id="after-build-next" type="button">Back to my trail '+icon('arrow')+'</button></div>';
  $('#after-build-next').addEventListener('click',()=>{closeDialog($('#detail-dialog'));celebrateNode('build')});
 });
}
function openRecall(trigger){
 if(!state.build){lockedMission(MISSIONS[4],trigger);return}
 if(state.recall){earnedMission(MISSIONS[4],trigger);return}
 detail('A quick recall · +20 XP','<p class="eyebrow">THE PRACTICE PATCH</p><h3>Bring the idea back.</h3><p>Without looking at your notes: which join keeps every row from the table on the left, even when no match exists?</p><form id="recall-form"><fieldset class="recall-options" style="border:0;padding:0"><legend class="sr-only">Choose the join that keeps all left-hand rows</legend>'+['INNER','LEFT','RIGHT'].map(join=>'<label class="recall-option"><input type="radio" name="recall" value="'+join+'">'+join+' JOIN</label>').join('')+'</fieldset><p class="build-error" id="recall-feedback" role="alert" hidden></p><div class="detail-actions"><button class="button primary" type="submit">Check my recall '+icon('check')+'</button></div></form>',trigger);
 $('#recall-form').addEventListener('submit',event=>{
  event.preventDefault();const answer=$('input[name="recall"]:checked')?.value;
  if(answer!=='LEFT'){$('#recall-feedback').hidden=false;$('#recall-feedback').textContent=answer?'Think back to Noah. Which join kept him in the report?':'Pick a join before checking.';return}
  state.recall=true;save();renderDashboard();showXP(20);
  $('#detail-body').innerHTML='<p class="eyebrow">IDEA RETRIEVED · +20 XP</p><h3>That idea is within reach.</h3><p>LEFT JOIN keeps all rows on the left. A missing match becomes NULL. You recalled the rule instead of reading it again.</p><div class="detail-actions"><button class="button primary" id="after-recall" type="button">Back to my trail '+icon('arrow')+'</button></div>';
  $('#after-recall').addEventListener('click',()=>{closeDialog($('#detail-dialog'));celebrateNode('recall')});
 });
}
function openCheckpoint(trigger){
 if(!state.recall){lockedMission(MISSIONS[5],trigger);return}
 if(state.checkpoint){collection();return}
 detail('The chapter challenge · +40 XP','<p class="eyebrow">A FRESH DATASET. THE SAME SKILL.</p><h3>Carry it somewhere new.</h3><p>A shop has four customers. Only two have matching orders. A customer report uses LEFT JOIN, and each customer has at most one order. How many rows should the result contain?</p><form id="checkpoint-form"><fieldset class="prediction-group"><legend>Predict the size of the report</legend><div class="transfer-options">'+tile('checkpoint','2','2','Customers with orders',false,false)+tile('checkpoint','3','3','One extra customer',false,false)+tile('checkpoint','4','4','Every customer',false,false)+'</div></fieldset><p class="build-error" id="checkpoint-feedback" role="alert" hidden></p><div class="detail-actions"><button class="button primary" type="submit">Finish the chapter '+icon('flag')+'</button></div></form>',trigger);
 $('#checkpoint-form').addEventListener('submit',event=>{
  event.preventDefault();const answer=$('input[name="checkpoint"]:checked')?.value;
  if(answer!=='4'){$('#checkpoint-feedback').hidden=false;$('#checkpoint-feedback').textContent=answer?'The report keeps every customer. No matching order means NULL, rather than a missing customer.':'Choose a report size first.';return}
  state.checkpoint=true;save();renderDashboard();showXP(40);
  $('#detail-body').innerHTML='<p class="eyebrow">QUERY GROVE · CHAPTER COMPLETE</p><h3>Look at what you can do.</h3><p>You can organise tables, filter rows, keep unmatched customers, build a useful report, and apply the idea to a fresh example.</p><div class="build-done">6 milestones explored · one customer report made · 300 total XP</div><div class="detail-actions"><button class="button primary" id="chapter-back" type="button">Back to my trail '+icon('trail')+'</button><button class="button secondary" id="chapter-skills" type="button">My skill collection '+icon('gem')+'</button></div><p class="demo-note">This prototype ends at the chapter milestone. The next chapter would begin from your completed work.</p>';
  $('#chapter-back').addEventListener('click',()=>{closeDialog($('#detail-dialog'));celebrateNode('checkpoint')});$('#chapter-skills').addEventListener('click',collection);
 });
}
function startCurrent(trigger){
 const mission=currentMission();
 if(!mission){collection();return}
 if(mission.id==='joins')openLab(false,trigger);
 if(mission.id==='build')openBuild(trigger);
 if(mission.id==='recall')openRecall(trigger);
 if(mission.id==='checkpoint')openCheckpoint(trigger);
}
function celebrateNode(id){
 const node=$('[data-mission="'+id+'"]');if(!node||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
 node.classList.add('node-celebrate');
 for(let i=0;i<8;i++){const bit=document.createElement('i'),angle=Math.PI*2*i/8;bit.className='spark-bit';bit.style.setProperty('--x',Math.round(Math.cos(angle)*55)+'px');bit.style.setProperty('--y',Math.round(Math.sin(angle)*55)+'px');node.append(bit);bit.addEventListener('animationend',()=>bit.remove(),{once:true})}
 node.addEventListener('animationend',()=>node.classList.remove('node-celebrate'),{once:true});
}
document.querySelectorAll('[data-mission]').forEach(node=>node.addEventListener('click',event=>{
 const mission=MISSIONS.find(m=>m.id===node.dataset.mission);
 if(earned(mission.id)){earnedMission(mission,event.currentTarget);return}
 if(currentMission()?.id!==mission.id){lockedMission(mission,event.currentTarget);return}
 startCurrent(event.currentTarget);
}));
$('#start-mission').addEventListener('click',event=>startCurrent(event.currentTarget));
$('#banner-next').addEventListener('click',event=>startCurrent(event.currentTarget));
$('#earned-next').addEventListener('click',()=>{closeDialog($('#earned-dialog'));celebrateNode('joins');openBuild($('#start-mission'))});
$('#earned-back').addEventListener('click',()=>{closeDialog($('#earned-dialog'));celebrateNode('joins')});
$('#daily-lab').addEventListener('click',event=>state.joins?earnedMission(MISSIONS[2],event.currentTarget):openLab(false,event.currentTarget));
$('#mobile-start').addEventListener('click',event=>startCurrent(event.currentTarget));
$('#daily-build').addEventListener('click',event=>openBuild(event.currentTarget));
for(const id of ['skills-button','collection-link'])$('#'+id).addEventListener('click',collection);
$('#level-button').addEventListener('click',()=>detail('Your learning level','<p class="eyebrow">PROGRESS THROUGH DOING</p><h3>A little more capable.</h3><p>XP comes from completing useful learning work. Your current total is '+xp()+' XP.</p><ul><li>Joins lab: +60 XP for predicting, experimenting, and applying.</li><li>Customer report: +40 XP for a useful Build.</li><li>Quick recall: +20 XP for retrieving an idea.</li><li>Chapter challenge: +40 XP for a fresh example.</li><li>Hints and retries never subtract XP. Replays never duplicate it.</li></ul>'));
$('#world-overview').addEventListener('click',()=>detail('A guide to Query Grove','<p class="eyebrow">CHAPTER 01 · WHAT YOU’LL BE ABLE TO DO</p><h3>Turn data into answers.</h3><p>A short path from understanding tables to making a report you can explain.</p><ul><li>Think in tables: organise information.</li><li>Filter rows: ask sharper questions.</li><li>Use joins: keep the people your report needs.</li><li>Build: create a customer report.</li><li>Retrieve: bring the idea back without notes.</li><li>Transfer: apply the skill to a fresh dataset.</li></ul>'));
$('#guide-button').addEventListener('click',()=>detail('Meet Sprout, your little guide','<div class="guide-intro">'+$('.guide-card .sprout').outerHTML+'<div><p class="eyebrow">A NUDGE WHEN YOU NEED ONE</p><h3>Try. Notice. Try again.</h3></div></div><p>Your guide helps you look at the right part of a problem. In this prototype, each challenge has a contextual nudge.</p><ul><li>Predict before you reveal.</li><li>Change something and observe the result.</li><li>Take a hint whenever it helps.</li><li>Read the explanation before moving on.</li></ul><div class="detail-actions"><button class="button primary" id="guide-start" type="button">Try a little experiment '+icon('flask')+'</button></div>'));
$('#guide-button').addEventListener('click',()=>$('#guide-start').addEventListener('click',()=>{closeDialog($('#detail-dialog'));state.joins?openLab(true,$('#start-mission')):startCurrent()}));
$('#trail-switcher').addEventListener('click',()=>detail('Your learning trails','<p class="eyebrow">ONE GOOD PATH AT A TIME</p><h3>Backend foundations</h3><p>Your active sample Trail begins in Query Grove. Chapters keep the learning finite and the next step clear.</p><ul><li>Query Grove: organise data and build a report.</li><li>API Harbor: connect useful services.</li><li>System Summit: bring the pieces together.</li></ul><p class="demo-note">The other chapters are previews of the proposed journey.</p>'));
function jumpCurrent(){
 const current=currentMission(),node=current?$('[data-mission="'+current.id+'"]'):$('.world-header');
 node.scrollIntoView({behavior:'smooth',block:'center'});if(current)node.focus({preventScroll:true});
 toast(current?'Your next mission: '+current.title+'.':'Query Grove is complete. Take a look at your skill collection.');
}
$('#jump-current').addEventListener('click',jumpCurrent);$('#trail-nav').addEventListener('click',jumpCurrent);
$('#practice-nav').addEventListener('click',event=>state.build?openRecall(event.currentTarget):state.joins?earnedMission(MISSIONS[2],event.currentTarget):openLab(false,event.currentTarget));
$('#builds-nav').addEventListener('click',event=>openBuild(event.currentTarget));
$('#reset-demo').addEventListener('click',()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());state=freshState();hintOpen=false;feedback=null;save();renderDashboard();toast('A fresh trail. Your demo is ready to explore again.')});
renderDashboard();save();
const observer=new ResizeObserver(()=>{drawRoute();if($('#lab-dialog').open&&state.stage===1)drawRelations()});observer.observe($('#world-map'));
window.addEventListener('resize',()=>{if($('#lab-dialog').open&&state.stage===1)drawRelations()});
window.addEventListener('load',drawRoute);
