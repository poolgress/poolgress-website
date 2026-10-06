'use strict';
const M=window.CoachModel,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CACHE='poolgress-coach-studio-v1',LIBRARY='poolgress-coach-library-v1';
let state=M.fromLegacy(COACH_PRESETS.find(p=>p.id===7),'原題庫第 07 關'),selected=-1,tool='move',armed=null,history=[],future=[],gesture=null,toastTimer,saveTimer,activeAnimations=[],animationRun=0,ballsEnlarged=false;
let storageAvailable=true;
let pocketMode='ball',targetTool='zoneBall',targetShot=1,lineStyle='dashed';
let workflowTimer,workflowFingerprint='',workflowReady=true;
function syncWorkflow(force=false){clearTimeout(workflowTimer);const send=()=>{
 const frame=$('workflowFrame');if(!frame||!workflowReady)return;
 try{const errors=M.validate(state).errors;const payload={type:'poolgress.workflow.spec',spec:errors.length?null:M.toSpec(state),errors};const fingerprint=JSON.stringify(payload);if(!force&&fingerprint===workflowFingerprint)return;workflowFingerprint=fingerprint;
 frame.contentWindow.postMessage(payload,location.protocol==='file:'?'*':location.origin);
 $('workflowSync').textContent=errors.length?'請先完成關卡設定：'+errors.join('；'):'已同步目前關卡：'+state.name;
 }catch(e){$('workflowSync').textContent='流程同步失敗：'+e.message;}
};if(force)send();else workflowTimer=setTimeout(send,180);}
window.addEventListener('message',e=>{if(e.source!==$('workflowFrame')?.contentWindow||e.origin!==location.origin)return;if(e.data?.type==='poolgress.workflow.height'&&Number.isFinite(e.data.height))$('workflowFrame').style.height=Math.max(600,Math.min(2600,e.data.height+24))+'px';if(e.data?.type==='poolgress.workflow.ready'){workflowReady=true;syncWorkflow(true);}if(e.data?.type==='poolgress.workflow.error')$('workflowSync').textContent='流程暫無法執行：'+e.data.message;});
$('workflowFrame').addEventListener('load',()=>{workflowReady=true;syncWorkflow(true)});
$('restartWorkflow').addEventListener('click',()=>syncWorkflow(true));
const mainMode=()=>['move','path'].includes(tool)?tool:'target';
const ballVisual=id=>['gray','red'].includes(id)?`<span class="plain-ball ${id}" aria-hidden="true"></span>`:`<img src="assets/balls/${id}.png" alt="" draggable="false">`;
try{const last=JSON.parse(localStorage.getItem(CACHE)||'null');if(last)state=M.read(last);}catch(e){storageAvailable=false;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
function stash(){history.push(M.copy(state));if(history.length>80)history.shift();future=[];}
function persist(){syncWorkflow();clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(CACHE,JSON.stringify(M.toSpec(state)));$('saveStatus').textContent='已自動儲存在此裝置 · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});storageAvailable=true;}catch(e){$('saveStatus').textContent='瀏覽器儲存不可用，請下載 JSON 保留';storageAvailable=false;}},250);}
function library(){try{return JSON.parse(localStorage.getItem(LIBRARY)||'[]')}catch(e){return []}}
function saveNamed(quiet=false){try{const all=library(),spec=M.toSpec(state);const i=all.findIndex(x=>x.spec.id===state.id);const entry={savedAt:Date.now(),spec};if(i>=0)all[i]=entry;else all.unshift(entry);localStorage.setItem(LIBRARY,JSON.stringify(all));if(!quiet)toast('已儲存「'+state.name+'」至這台裝置');return true;}catch(e){if(!quiet)toast('儲存空間不足，請下載 JSON 保留');return false;}}
function replaceState(next,message){if(!saveNamed(true)){toast('目前草稿無法備份，請先下載草稿，再切換關卡。');return;}stash();state=next;state.id=M.uid();selected=-1;tool='move';armed=null;render(true);persist();syncWorkflow(true);toast(message);}
function checked(id,v){$(id).checked=!!v;}
function syncChoices(){document.querySelectorAll('[data-bind]').forEach(input=>input.checked=String(state[input.dataset.bind])===input.value);}
function fillForm(){
  $('levelName').value=state.name;for(const id of ['flow','strike','cuePlacement','rotation','cycles','objectTarget','cueTarget','objectTarget2','cueTarget2','total','pass','teaching'])$(id).value=state[id];
  $('total').value=M.total(state);['star1','star2','star3'].forEach((id,i)=>$(id).value=state.stars[i]);
  for(const [id,key]of [['grid','grid'],['snap','snap'],['order','order'],['noContact','noContact']])checked(id,state[key]);
  syncChoices();
}
function conditional(){
  if(state.flow!=='E')targetShot=1;
  $('rotationFields').hidden=state.flow!=='C';
  $('strikeFields').hidden=state.flow!=='D';$('strike').disabled=state.flow!=='D';$('cuePlacementField').hidden=state.strike==='direct';$('cuePlacement').disabled=state.flow!=='D';
  $('cueRules').hidden=state.strike==='direct';
  $('secondShotRules').hidden=state.flow!=='E';$('objectRuleHeading').textContent=state.flow==='E'?'子球規則（第一桿）':'子球規則';$('cueRuleHeading').textContent=state.flow==='E'?'母球規則（第一桿）':'母球規則';
  $('objectPockets').hidden=!['pocket','pocket_or_zone'].includes(state.objectTarget);$('cuePockets').hidden=!['pocket','pocket_or_zone'].includes(state.cueTarget);
  $('objectPockets2').hidden=!['pocket','pocket_or_zone'].includes(state.objectTarget2);$('cuePockets2').hidden=!['pocket','pocket_or_zone'].includes(state.cueTarget2);
  $('directClearRow').hidden=state.flow!=='A';$('directClear').checked=M.directClear(state);
  $('total').disabled=['C','D'].includes(state.flow)||M.directClear(state);$('total').value=M.total(state);
}
function pocketDisplayPosition(p,i){if(i>=4)return {fx:p[2],fy:p[3]};return {fx:p[2]+(p[2]<.5?-.006:.006),fy:p[3]+(p[3]<.5?-.008:.008)};}
function renderPockets(){
  const displayOrder=[0,4,1,2,5,3];
  for(const [side,element,shot]of [['ball','objectPockets',1],['cue','cuePockets',1],['ball','objectPockets2',2],['cue','cuePockets2',2]]){
    const pockets=shot===2?state.pockets2:state.pockets;$(element).innerHTML=displayOrder.map(i=>{const p=M.POCKETS[i];return `<label><input type="checkbox" data-pocket="${i}" data-side="${side}" data-shot="${shot}" ${[side,'both'].includes(pockets[i])?'checked':''}>${p[1]}</label>`;}).join('');
  }
  const activePockets=targetShot===2?state.pockets2:state.pockets;$('pocketLayer').innerHTML=M.POCKETS.map((p,i)=>{const position=pocketDisplayPosition(p,i);return `<button class="pocket" data-pocket-index="${i}" data-target="${activePockets[i]||'none'}" style="left:${position.fx*100}%;top:${position.fy*100}%" aria-label="第 ${targetShot} 桿 ${p[1]}：${({ball:'子球',cue:'母球',both:'母球與子球'})[activePockets[i]]||'未指定'}" title="第 ${targetShot} 桿 ${p[1]}，點擊切換目標"></button>`;}).join('');
}
function draw(){
  const W=1000,H=556;
  $('gridImage').hidden=!state.grid;
  let out='<defs>'+['cue','gray','red',...Array.from({length:15},(_,i)=>String(i+1))].map(id=>`<marker id="arrow-${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 L8 5 L1 9" fill="none" stroke="${M.ballColor(id)}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`).join('')+'</defs>';
  function rect(z,ghost=false){const color=z.side==='cue'?'#fff':'#ffcb67',dash=ghost||z.shot===2?'stroke-dasharray="5 5"':'';return `<rect x="${Math.min(z.x1,z.x2)*W}" y="${Math.min(z.y1,z.y2)*H}" width="${Math.abs(z.x2-z.x1)*W}" height="${Math.abs(z.y2-z.y1)*H}" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-width="3" ${dash}/>`;}
  state.zones.forEach(z=>out+=rect(z));if(gesture?.type==='zone')out+=rect({...gesture.start,x1:gesture.start.fx,y1:gesture.start.fy,x2:gesture.end.fx,y2:gesture.end.fy,side:tool==='zoneCue'?'cue':'ball'},true);
  const lineCounts={ball:0,cue:0};
  function targetLine(l,index=null,preview=false){const side=l.side||'ball',color=side==='cue'?'#fff':'#ffbc00',number=preview?lineCounts[side]+1:++lineCounts[side],mx=(l.x1+l.x2)*W/2,my=(l.y1+l.y2)*H/2,shot=l.shot===2?' stroke-dasharray="14 8"':'';return `<line class="target-line${preview?' target-line-preview':''}" ${index===null?'':`data-target-line-index="${index}"`} x1="${l.x1*W}" y1="${l.y1*H}" x2="${l.x2*W}" y2="${l.y2*H}" stroke="${color}" stroke-width="8"${shot}/><text class="target-line-num" x="${mx}" y="${my}">${number}</text>`;}
  state.lines.forEach((l,i)=>out+=targetLine(l,i));if(gesture?.type==='targetLine')out+=targetLine({x1:gesture.start.fx,y1:gesture.start.fy,x2:gesture.end.fx,y2:gesture.end.fy,side:tool==='targetLineCue'?'cue':'ball',shot:state.flow==='E'?targetShot:1},null,true);
  const paths=gesture?.type==='path'&&gesture.moved?[...state.paths.filter(p=>p.ball!==gesture.index),{ball:gesture.index,style:gesture.style,vertices:[...gesture.locked,gesture.live]}]:state.paths;
  paths.forEach(p=>{const b=state.balls[p.ball];if(!b||!p.vertices.length)return;const points=[b,...p.vertices].map(v=>({x:v.fx*W,y:v.fy*H})),color=M.ballColor(b.id),dash=p.style==='solid'?'none':'18 12',segments=M.routeSegments(points);segments.forEach((s,i)=>{if(s.offset)out+=`<line x1="${s.joinX}" y1="${s.joinY}" x2="${s.x1}" y2="${s.y1}" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash}"/>`;out+=`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash}" ${i===segments.length-1?`marker-end="url(#arrow-${b.id})"`:''}/>`;});p.vertices.slice(0,-1).forEach(v=>out+=`<circle cx="${v.fx*W}" cy="${v.fy*H}" r="10.5" fill="none" stroke="${color}" stroke-width="2"/>`);});
  $('drawing').innerHTML=out;
}
function renderBalls(){
  const counts={};$('ballLayer').innerHTML=state.balls.map((b,i)=>{counts[b.id]=(counts[b.id]||0)+1;const n=counts[b.id],label=M.ballName(b.id)+(M.repeatable(b.id)?'位置 '+n:'');return `<button class="ball ${i===selected?'selected':''}" data-ball="${i}" style="left:${b.fx*100}%;top:${b.fy*100}%" aria-label="${label}" title="${label}；拖曳球或畫路線">${ballVisual(b.id)}${M.repeatable(b.id)&&state.balls.filter(x=>x.id===b.id).length>1?`<span class="index">${n}</span>`:''}</button>`;}).join('');
  $('ballCount').textContent=state.flow==='C'?`${state.balls.length} 個球位 · ${M.total(state)} 次挑戰`:`${state.balls.length} 顆球${state.cuePlacement==='free'?' ＋ 自由母球':''}`;
  $('rack').innerHTML=['cue','gray','red',...Array.from({length:15},(_,i)=>String(i+1))].map(id=>{const disabled=state.balls.some(b=>b.id===id)&&!M.repeatable(id);return `<button data-add="${id}" aria-label="加入${id==='cue'?'母球位置':M.ballName(id)}" title="${M.ballName(id)}${M.repeatable(id)?'：可重複加入，不限顆數':disabled?'：已在桌上':''}" ${disabled?'disabled':''}>${ballVisual(id)}</button>`;}).join('');
  updateSelection();
}
function updateSelection(){}
function renderZones(){
  const zones=state.zones.map((z,i)=>{const a=M.star(Math.min(z.x1,z.x2),Math.min(z.y1,z.y2)),b=M.star(Math.max(z.x1,z.x2),Math.max(z.y1,z.y2));return `<div class="zone-row"><span>${z.shot?`第 ${z.shot} 桿 · `:''}${z.side==='cue'?'母球':'子球'}區 ${i+1} · (${a.x.toFixed(2)}, ${a.y.toFixed(2)}) → (${b.x.toFixed(2)}, ${b.y.toFixed(2)}) 星</span><button data-remove-zone="${i}" aria-label="移除第 ${i+1} 個停球區">移除</button></div>`;});
  const counts={ball:0,cue:0},lines=state.lines.map((l,i)=>{const n=++counts[l.side||'ball'],a=M.star(l.x1,l.y1),b=M.star(l.x2,l.y2);return `<div class="zone-row"><span>${l.shot?`第 ${l.shot} 桿 · `:''}${l.side==='cue'?'母球':'子球'}線段 ${n} · (${a.x.toFixed(2)}, ${a.y.toFixed(2)}) → (${b.x.toFixed(2)}, ${b.y.toFixed(2)}) 星</span><button data-remove-line="${i}" aria-label="移除第 ${n} 個目標線段">移除</button></div>`;});
  $('zoneList').innerHTML=[...zones,...lines].join('');
}
function stopAnimation(silent=true){
  animationRun++;activeAnimations.forEach(a=>a.cancel());activeAnimations=[];$('table').dataset.animating='false';
  const b=$('animateBtn');b.setAttribute('aria-pressed','false');b.textContent='▶ 播放動畫';if(!silent)toast('已停止動畫');
}
function updateAnimationButton(){const plan=M.animationPlan(state),b=$('animateBtn');b.disabled=!plan.available;b.title=plan.available?'依線路播放球的移動預覽':plan.reason;}
function syncBallScale(){const b=$('ballScaleBtn');$('table').dataset.ballsEnlarged=String(ballsEnlarged);b.setAttribute('aria-pressed',String(ballsEnlarged));b.textContent=ballsEnlarged?'恢復球大小':'球放大 1.3×';}
async function playAnimation(){
  if(activeAnimations.length){stopAnimation(false);return;}const plan=M.animationPlan(state);if(!plan.available){toast(plan.reason);return;}
  const run=++animationRun,b=$('animateBtn');$('table').dataset.animating='true';b.setAttribute('aria-pressed','true');b.textContent='■ 停止動畫';
  activeAnimations=plan.tracks.flatMap(track=>{const el=$('ballLayer').querySelector(`[data-ball="${track.ball}"]`);if(!el||typeof el.animate!=='function')return [];const frames=track.keyframes.map(k=>({left:(k.fx*100)+'%',top:(k.fy*100)+'%',offset:k.offset,opacity:1}));if(track.pocketed){const end=frames.at(-1);frames.push({...end,offset:1,opacity:0});}return [el.animate(frames,{duration:track.duration,delay:track.delay,easing:'linear',fill:'both'})];});
  if(!activeAnimations.length){stopAnimation(true);toast('目前瀏覽器無法播放動畫');return;}
  await Promise.all(activeAnimations.map(a=>a.finished.catch(()=>null)));if(run!==animationRun)return;await new Promise(resolve=>setTimeout(resolve,350));if(run!==animationRun)return;stopAnimation(true);toast('動畫播放完成');
}
function issueHTML(v){return (v.errors.length?'<strong class="issue">還有 '+v.errors.length+' 個設定需要補齊</strong><ul class="validation-list issue">'+v.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>':'<strong class="valid">✓ 規格檢查通過，可匯出完整關卡</strong>')+(v.warnings.length?'<ul class="validation-list warn">'+v.warnings.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>':'');}
function summary(){
  $('summaryName').textContent=state.name||'未命名關卡';$('summary').innerHTML=M.describe(state).map(t=>'<li>'+esc(t)+'</li>').join('');
  $('validation').innerHTML=issueHTML(M.validate(state));$('undoBtn').disabled=!history.length;$('redoBtn').disabled=!future.length;
}
function render(full=false){stopAnimation(true);if(full)fillForm();conditional();renderPockets();renderBalls();renderZones();draw();summary();setTool(tool);updateAnimationButton();syncBallScale();syncWorkflow();}
function commit(full=false){render(full);persist();}
function setTool(t){
  if(t!==tool&&gesture){state=gesture.before;gesture=null;}
  tool=t;const mode=mainMode();if(mode==='target')targetTool=t;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('rack').hidden=mode!=='move';
  $('lineTools').hidden=mode!=='path';$('targetTools').hidden=mode!=='target';
  $('targetShotSelector').hidden=state.flow!=='E';document.querySelectorAll('[data-target-shot]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.targetShot)===targetShot)));
  $('pocketTools').hidden=t!=='pocket';$('allObjectPockets').hidden=pocketMode!=='ball';
  document.querySelectorAll('[data-line-style]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lineStyle===lineStyle)));
  document.querySelectorAll('[data-target-tool]').forEach(b=>b.setAttribute('aria-pressed',String(t===b.dataset.targetTool&&(t!=='pocket'||pocketMode===b.dataset.side))));
  $('zoneList').hidden=mode!=='target';
  document.querySelectorAll('[data-pocket-index]').forEach(el=>el.disabled=t!=='pocket');
  document.querySelectorAll('[data-rule-line]').forEach(b=>{const side=b.dataset.ruleLine,shot=Number(b.dataset.ruleShot);const count=M.lineRequirement(state,side,shot).lineIndexes.length;const editing=t===(side==='cue'?'targetLineCue':'targetLineBall')&&(state.flow!=='E'||targetShot===shot);b.setAttribute('aria-pressed',String(count>0));b.dataset.drawing=String(editing);b.querySelector('.line-rule-status').textContent=count?'已疊加 '+count+' 條':editing?'畫線中・尚未設定':'未畫線段';b.title='可疊加條件：球體碰到線段即可，並同時滿足進袋或停球區條件。'+(count?'已設定 '+count+' 條必要目標線段':'點擊後在球桌拖曳畫線');b.disabled=side==='cue'&&state.strike==='direct';});
  $('table').dataset.mode=mode;$('table').dataset.targetLine=String(t==='targetLineBall'||t==='targetLineCue');updateSelection();
  draw();
}
document.querySelectorAll('[data-rule-line]').forEach(button=>button.addEventListener('click',()=>{
 const side=button.dataset.ruleLine;targetShot=Number(button.dataset.ruleShot);
 if(side==='cue'&&state.strike==='direct'){toast('本關無母球，請使用子球目標線段');return;}
 setTool(side==='cue'?'targetLineCue':'targetLineBall');
 toast('請在球桌上拖曳畫出'+(side==='cue'?'母球':'子球')+'目標線段；可同時搭配進袋或停球區條件');
}));
function constrain(p,snap=state.snap){let {x,y}=M.star(p.fx,p.fy);if(snap){x=Math.round(x*4)/4;y=Math.round(y*4)/4;}return M.frac(Math.max(.09,Math.min(7.91,x)),Math.max(.09,Math.min(3.91,y)));}
function pointer(e,forBall=false){const r=$('table').getBoundingClientRect();const p={fx:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),fy:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};return forBall?constrain(p):p;}
function adjustClear(){if(state.flow==='D'||M.directClear(state)){const n=M.total(state);state.total=n;state.pass=n;state.stars=[n,n,n];}}
function addBall(id){
  if(tool!=='move'||state.balls.some(b=>b.id===id)&&!M.repeatable(id))return;
  stash();let p=M.frac(4,2);outer:for(let y=1;y<=3;y+=.5)for(let x=2;x<=6;x+=.5){const q=M.frac(x,y);if(state.balls.every(b=>{const a=M.star(b.fx,b.fy);return Math.hypot(a.x-x,a.y-y)>.25})){p=q;break outer;}}
  state.balls.push({id,...p});selected=state.balls.length-1;adjustClear();commit(true);toast('已加入'+M.ballName(id)+'，拖曳到需要的位置');
}
function removeBall(){if(tool!=='move'||selected<0)return;stash();state.balls.splice(selected,1);state.paths=state.paths.filter(p=>p.ball!==selected).map(p=>({...p,ball:p.ball>selected?p.ball-1:p.ball}));selected=-1;adjustClear();commit(true);}
function setPocket(i,side,on,shot=1){const pockets=shot===2?state.pockets2:state.pockets,current=pockets[i];const set=new Set(current==='both'?['ball','cue']:current?[current]:[]);if(on)set.add(side);else set.delete(side);pockets[i]=set.size===2?'both':set.size?[...set][0]:false;}
document.querySelector('.toolrow').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b)setTool(b.dataset.mode==='target'?targetTool:b.dataset.mode);});
$('animateBtn').addEventListener('click',playAnimation);
$('ballScaleBtn').addEventListener('click',()=>{ballsEnlarged=!ballsEnlarged;syncBallScale();});
$('rack').addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b)addBall(b.dataset.add);});
function syncPocketTarget(side,shot=1){const pockets=shot===2?state.pockets2:state.pockets,key=side==='ball'?(shot===2?'objectTarget2':'objectTarget'):(shot===2?'cueTarget2':'cueTarget'),has=pockets.some(p=>[side,'both'].includes(p));if(has)state[key]=['zone','pocket_or_zone'].includes(state[key])?'pocket_or_zone':'pocket';else if(['pocket','pocket_or_zone'].includes(state[key]))state[key]=state[key]==='pocket_or_zone'?'zone':'stay';}
$('targetTools').addEventListener('click',e=>{const shot=e.target.closest('[data-target-shot]');if(shot){targetShot=Number(shot.dataset.targetShot);renderPockets();setTool(tool);return;}const b=e.target.closest('[data-target-tool]');if(!b)return;if(b.dataset.side)pocketMode=b.dataset.side;setTool(b.dataset.targetTool);});
$('lineTools').addEventListener('click',e=>{const b=e.target.closest('[data-line-style]');if(!b||tool!=='path')return;lineStyle=b.dataset.lineStyle;const p=state.paths.find(p=>p.ball===selected);if(p&&(p.style||'dashed')!==lineStyle){stash();p.style=lineStyle;commit();}else setTool(tool);});
$('allObjectPockets').addEventListener('click',()=>{if(tool!=='pocket'||pocketMode!=='ball')return;stash();for(let i=0;i<6;i++)setPocket(i,'ball',true,targetShot);state[targetShot===2?'objectTarget2':'objectTarget']='pocket';pocketMode='ball';commit(true);toast(`第 ${targetShot} 桿子球六個袋口已全選`);});
$('pocketLayer').addEventListener('click',e=>{const pocket=e.target.closest('[data-pocket-index]');if(!pocket)return;if(tool!=='pocket')return;stash();const i=Number(pocket.dataset.pocketIndex),pockets=targetShot===2?state.pockets2:state.pockets;setPocket(i,pocketMode,![pocketMode,'both'].includes(pockets[i]),targetShot);syncPocketTarget(pocketMode,targetShot);commit(true);$('pocketLayer').querySelector(`[data-pocket-index="${i}"]`)?.focus();});
$('table').addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  if(e.target.closest('[data-target-line-index]'))return;
  if(e.target.closest('[data-pocket-index]'))return;
  const b=e.target.closest('[data-ball]');if(b&&mainMode()!=='target'){selected=Number(b.dataset.ball);renderBalls();if(tool==='move'||tool==='path'){gesture=tool==='path'?{type:'path',index:selected,before:M.copy(state),locked:[],lastHit:null,live:{...state.balls[selected]},style:lineStyle,moved:false}:{type:'ball',start:pointer(e),before:M.copy(state),index:selected};$('table').setPointerCapture(e.pointerId);}return;}
  if(tool==='path'){if(selected<0){toast('先選取桌上的一顆球，再畫路線');return;}stash();let p=state.paths.find(p=>p.ball===selected);if(!p){p={ball:selected,style:lineStyle,vertices:[]};state.paths.push(p);}p.vertices.push({...pointer(e),ghost:false});commit();return;}
  if(tool==='zoneCue'||tool==='zoneBall'){if(tool==='zoneCue'&&state.strike==='direct'){toast('本關無母球，請使用子球停球區');return;}const p=M.snapPoint(pointer(e),state.snap);gesture={type:'zone',start:p,end:p,before:M.copy(state)};$('table').setPointerCapture(e.pointerId);}
  else if(tool==='targetLineCue'||tool==='targetLineBall'){if(tool==='targetLineCue'&&state.strike==='direct'){toast('本關無母球，請使用子球目標線段');return;}const p=M.snapPoint(pointer(e),state.snap);gesture={type:'targetLine',start:p,end:p,before:M.copy(state)};$('table').setPointerCapture(e.pointerId);}
  else if(tool==='move'){selected=-1;renderBalls();}
});
$('table').addEventListener('pointermove',e=>{if(!gesture)return;if(gesture.type==='ball'){const p=pointer(e,true);Object.assign(state.balls[gesture.index],p);const b=$('ballLayer').querySelector(`[data-ball="${gesture.index}"]`);b.style.left=p.fx*100+'%';b.style.top=p.fy*100+'%';updateSelection();draw();}else if(gesture.type==='path'){const p=pointer(e),a=M.star(p.fx,p.fy),b=M.star(state.balls[gesture.index].fx,state.balls[gesture.index].fy);if(Math.hypot(a.x-b.x,a.y-b.y)>.04)gesture.moved=true;Object.assign(gesture,M.extendRoute(state.balls,gesture.index,gesture.locked,p,gesture.lastHit));draw();}else{gesture.end=M.snapPoint(pointer(e),state.snap);draw();}});
function finishGesture(e,cancel=false){if(!gesture)return;const g=gesture;gesture=null;if(cancel){state=g.before;render(true);return;}if(g.type==='zone'){
  if(Math.abs(g.end.fx-g.start.fx)<.01||Math.abs(g.end.fy-g.start.fy)<.01){draw();return;}
  const side=tool==='zoneCue'?'cue':'ball',shot=state.flow==='E'?targetShot:1,key=side==='cue'?(shot===2?'cueTarget2':'cueTarget'):(shot===2?'objectTarget2':'objectTarget');state.zones.push({x1:Math.min(g.start.fx,g.end.fx),y1:Math.min(g.start.fy,g.end.fy),x2:Math.max(g.start.fx,g.end.fx),y2:Math.max(g.start.fy,g.end.fy),side,shot});
  state[key]=['pocket','pocket_or_zone'].includes(state[key])?'pocket_or_zone':'zone';
}else if(g.type==='targetLine'){
  if(Math.hypot(g.end.fx-g.start.fx,g.end.fy-g.start.fy)<.01){draw();return;}
  state.lines.push({x1:g.start.fx,y1:g.start.fy,x2:g.end.fx,y2:g.end.fy,side:tool==='targetLineCue'?'cue':'ball',shot:state.flow==='E'?targetShot:1});
}else if(g.type==='path'&&g.moved){state.paths=state.paths.filter(p=>p.ball!==g.index);state.paths.push({ball:g.index,style:g.style,vertices:[...g.locked,{...g.live,ghost:false}]});}if(JSON.stringify(state)!==JSON.stringify(g.before)){history.push(g.before);future=[];}commit(true);}
$('table').addEventListener('pointerup',e=>finishGesture(e));$('table').addEventListener('pointercancel',e=>finishGesture(e,true));
$('table').addEventListener('keydown',e=>{if(tool!=='move')return;const b=e.target.closest('[data-ball]');if(!b)return;selected=Number(b.dataset.ball);if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeBall();return;}const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!dir)return;e.preventDefault();stash();const ball=state.balls[selected],p=M.star(ball.fx,ball.fy),step=e.shiftKey?.25:.05;Object.assign(ball,constrain(M.frac(p.x+dir[0]*step,p.y+dir[1]*step),false));commit();$('ballLayer').querySelector(`[data-ball="${selected}"]`)?.focus();});
$('drawing').addEventListener('dblclick',e=>{const line=e.target.closest('[data-target-line-index]');if(!line||mainMode()!=='target')return;e.preventDefault();e.stopPropagation();stash();state.lines.splice(Number(line.dataset.targetLineIndex),1);commit();toast('已移除目標線段，可按復原找回');});
$('zoneList').addEventListener('click',e=>{if(mainMode()!=='target')return;const zone=e.target.closest('[data-remove-zone]'),line=e.target.closest('[data-remove-line]');if(!zone&&!line)return;stash();if(zone)state.zones.splice(Number(zone.dataset.removeZone),1);else state.lines.splice(Number(line.dataset.removeLine),1);commit();});
for(const id of ['objectPockets','cuePockets','objectPockets2','cuePockets2'])$(id).addEventListener('change',e=>{const el=e.target;if(!el.matches('[data-pocket]'))return;const shot=Number(el.dataset.shot)||1;stash();setPocket(Number(el.dataset.pocket),el.dataset.side,el.checked,shot);syncPocketTarget(el.dataset.side,shot);commit(true);});
document.querySelector('.settings-grid').addEventListener('change',e=>{const input=e.target.closest('[data-bind]');if(!input||!input.checked)return;const target=$(input.dataset.bind);target.value=input.value;target.dispatchEvent(new Event('change',{bubbles:true}));});
for(const [id,key]of [['grid','grid'],['snap','snap'],['order','order'],['noContact','noContact']])$(id).addEventListener('change',()=>{stash();state[key]=$(id).checked;commit();});
for(const [id,key]of [['levelName','name'],['teaching','teaching']])$(id).addEventListener('input',()=>{stash();state[key]=$(id).value;summary();persist();});
for(const id of ['cycles','total','pass','star1','star2','star3'])$(id).addEventListener('change',()=>{stash();const value=$(id).value===''?null:Number($(id).value);if(id.startsWith('star'))state.stars[Number(id.at(-1))-1]=value;else state[id]=value;if(id==='cycles'&&(!Number.isInteger(value)||value<1||value>100)){state.cycles=1;$(id).value=1;toast('循環次數請使用 1–100 的整數，已復原為 1');}commit();});
for(const id of ['flow','strike','cuePlacement','rotation','objectTarget','cueTarget','objectTarget2','cueTarget2'])$(id).addEventListener('change',()=>{
  stash();state[id]=$(id).value;
  if(id==='flow'){if(state.flow==='A'){state.strike='direct';state.cuePlacement='none';}else if(['B','C','E'].includes(state.flow)){state.strike='cue';state.cuePlacement='fixed';}else if(state.flow==='D'){state.strike='cue';state.cuePlacement='free';}if(['D','E'].includes(state.flow))state.objectTarget='pocket';adjustClear();}
  if(id==='strike'){state.cuePlacement=state.strike==='direct'?'none':state.flow==='D'?'free':'fixed';}
  if(id.startsWith('objectTarget')&&['stay','zone'].includes(state[id])){const shot=id.endsWith('2')?2:1;for(let i=0;i<6;i++)setPocket(i,'ball',false,shot);if(shot===1)state.order=false;}
  if(id.startsWith('cueTarget')&&['stay','zone'].includes(state[id])){const shot=id.endsWith('2')?2:1;for(let i=0;i<6;i++)setPocket(i,'cue',false,shot);}
  commit(true);
});
function undo(){if(!history.length)return;future.push(M.copy(state));state=history.pop();selected=-1;commit(true);}function redo(){if(!future.length)return;history.push(M.copy(state));state=future.pop();selected=-1;commit(true);}
$('undoBtn').addEventListener('click',undo);$('redoBtn').addEventListener('click',redo);
$('deleteBtn').addEventListener('click',()=>{
  const mode=mainMode();
  if(mode==='move'){if(selected<0){toast('請先選取要移除的球');return;}removeBall();toast('已移除球，可按復原找回');return;}
  if(mode==='path'){if(selected<0||!state.paths.some(p=>p.ball===selected)){toast('請先選取有路線的球');return;}stash();state.paths=state.paths.filter(p=>p.ball!==selected);commit();toast('已移除路線，可按復原找回');return;}
  toast('區塊與線段可按旁邊的「移除」；線段也可雙擊刪除；袋口再點一次即可取消');
});
$('resetBtn').addEventListener('click',()=>$('resetDialog').showModal());
$('confirmReset').addEventListener('click',()=>{stash();state=M.eraseDrawing(state,'all');selected=-1;gesture=null;$('resetDialog').close();commit(true);toast('已重置球型，關卡設定保留；可按復原找回');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(gesture)state=gesture.before;gesture=null;render(true);}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();e.shiftKey?redo():undo();}});
$('preset').innerHTML='<option value="">選擇 20 關範例…</option>'+COACH_PRESETS.map(p=>`<option value="${p.id}">${String(p.id).padStart(2,'0')} · ${esc(p.data.note.name)}</option>`).join('');
$('loadPreset').addEventListener('click',()=>{const p=COACH_PRESETS.find(p=>p.id===Number($('preset').value));if(!p){toast('先選擇一個關卡範例');return;}try{replaceState(M.fromLegacy(p,'原題庫第 '+String(p.id).padStart(2,'0')+' 關'),`已載入第 ${p.id} 關，原草稿已保留`);}catch(e){toast(e.message)}});
$('newBtn').addEventListener('click',()=>replaceState(M.blank(),'已建立空白關卡，原草稿已保留'));
$('saveBtn').addEventListener('click',()=>saveNamed());$('draftsBtn').addEventListener('click',()=>{const list=library();$('draftList').innerHTML=list.length?list.map((d,i)=>`<button class="draft-item" data-draft="${i}"><strong>${esc(d.spec.name)}</strong><small>${new Date(d.savedAt).toLocaleString('zh-TW')} · ${esc(M.FLOWS[d.spec.flow?.template]?.name||'關卡')}</small></button>`).join(''):'<p>尚無命名草稿。按「儲存草稿」即可保留。</p>';$('draftsDialog').showModal();});
$('draftList').addEventListener('click',e=>{const b=e.target.closest('[data-draft]');if(!b)return;const d=library()[Number(b.dataset.draft)];try{replaceState(M.fromSpec(d.spec),'已載入草稿');$('draftsDialog').close();}catch(e){toast(e.message)}});
$('importBtn').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('檔案超過 5 MB，請先移除過大的縮圖。');const j=JSON.parse(await file.text());replaceState(M.read(j),'已匯入 '+file.name+'；請確認下方規格檢查。');}catch(e){toast('匯入失敗：'+e.message);}finally{$('importFile').value='';}});
const safeFileName=()=>String(state.name||'未命名關卡').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');
function levelText(levelNumber){return `第幾關：${levelNumber||'未指定'}\n關卡標題：${state.name||'未命名關卡'}\n關卡說明：${state.teaching||''}\n總擊球數：${M.total(state)}\n獲得星星：★ ${state.stars[0]}　★★ ${state.stars[1]}　★★★ ${state.stars[2]}\n`;}
function downloadBlob(blob,suffix,extension,base=safeFileName()){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=base+suffix+'.'+extension;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function imageData(img,width=img.naturalWidth,height=img.naturalHeight){return new Promise((resolve,reject)=>{const convert=()=>{try{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(img,0,0,width,height);resolve(canvas.toDataURL('image/png'));}catch(e){reject(e);}};if(img.complete&&img.naturalWidth)convert();else{img.addEventListener('load',convert,{once:true});img.addEventListener('error',()=>reject(Error('圖片載入失敗')),{once:true});}});}
async function exportSvg(animated=false){
  const W=1000,H=556,r=ballsEnlarged?19.5:15,plan=animated?M.animationPlan(state):{available:false,tracks:[]},trackMap=new Map(plan.tracks.map(track=>[track.ball,track]));
  const backgrounds=[await imageData($('tableImage'),W,H)];if(state.grid)backgrounds.push(await imageData($('gridImage'),W,H));backgrounds.push(await imageData($('cushionImage'),W,H));
  const ballImages={};for(const b of state.balls){if(['gray','red'].includes(b.id)||ballImages[b.id])continue;const img=$('ballLayer').querySelector(`[data-ball="${state.balls.indexOf(b)}"] img`);if(img)ballImages[b.id]=await imageData(img);}
  const total=Math.max(1200,...plan.tracks.map(t=>t.delay+t.duration+600));
  const motion=track=>{if(!animated||!track)return '';const samples=[];const add=(time,point)=>{const last=samples.at(-1);if(last&&Math.abs(last.time-time)<.01){last.point=point;return;}samples.push({time,point});};const first=track.keyframes[0];add(0,first);if(track.delay)add(track.delay,first);track.keyframes.forEach(k=>add(track.delay+track.duration*k.offset,k));add(total,track.keyframes.at(-1));const values=samples.map(s=>`${(s.point.fx*W).toFixed(2)} ${(s.point.fy*H).toFixed(2)}`).join(';'),times=samples.map(s=>(s.time/total).toFixed(5)).join(';');let result=`<animateTransform attributeName="transform" type="translate" values="${values}" keyTimes="${times}" dur="${total}ms" repeatCount="indefinite" calcMode="linear"/>`;if(track.pocketed){const end=(track.delay+track.duration)/total,before=Math.max(0,end-.0001);result+=`<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${before.toFixed(5)};${end.toFixed(5)};1" dur="${total}ms" repeatCount="indefinite" calcMode="discrete"/>`;}return result;};
  const balls=state.balls.map((b,i)=>{const track=trackMap.get(i),start=track?.keyframes[0]||b,content=['gray','red'].includes(b.id)?`<circle r="${r}" fill="${b.id==='red'?'#d32f2f':'#4b5058'}" stroke="#26323f"/><circle cx="${-r*.28}" cy="${-r*.3}" r="${r*.12}" fill="#ffffff8c"/>`:`<image href="${ballImages[b.id]}" x="${-r}" y="${-r}" width="${r*2}" height="${r*2}"/>`;return `<g transform="translate(${start.fx*W} ${start.fy*H})">${content}${motion(track)}</g>`;}).join('');
  const activePockets=targetShot===2?state.pockets2:state.pockets,pockets=M.POCKETS.map((p,i)=>{const target=activePockets[i];if(!target)return '';const position=pocketDisplayPosition(p,i),cx=position.fx*W,cy=position.fy*H,color=target==='cue'?'#fff':'#f5bb56',extra=target==='both'?`<circle cx="${cx}" cy="${cy}" r="25" fill="none" stroke="#fff" stroke-width="12"/>`:'';return `${extra}<circle cx="${cx}" cy="${cy}" r="22" fill="${color}" fill-opacity=".2" stroke="${color}" stroke-width="10"/>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="display:block;background:none;background-color:transparent;overflow:hidden"><metadata>Poolgress transparent canvas; no background layer</metadata>${backgrounds.map(data=>`<image href="${data}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`).join('')}<g>${$('drawing').innerHTML}</g>${pockets}<g>${balls}</g></svg>`;
}
function svgToPng(svg){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1112;canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG 建立失敗')),'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('球形圖片建立失敗'));};img.src=url;});}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipArchive(files){const encoder=new TextEncoder(),parts=[],central=[];let offset=0;const push=(view,array,value,at,size)=>{for(let i=0;i<size;i++)array[at+i]=(value>>>(i*8))&255;};for(const file of files){const name=encoder.encode(file.name),data=file.data instanceof Uint8Array?file.data:encoder.encode(file.data),crc=crc32(data),local=new Uint8Array(30+name.length);push(null,local,0x04034b50,0,4);push(null,local,20,4,2);push(null,local,0x0800,6,2);push(null,local,crc,14,4);push(null,local,data.length,18,4);push(null,local,data.length,22,4);push(null,local,name.length,26,2);local.set(name,30);parts.push(local,data);const record=new Uint8Array(46+name.length);push(null,record,0x02014b50,0,4);push(null,record,20,4,2);push(null,record,20,6,2);push(null,record,0x0800,8,2);push(null,record,crc,16,4);push(null,record,data.length,20,4);push(null,record,data.length,24,4);push(null,record,name.length,28,2);push(null,record,offset,42,4);record.set(name,46);central.push(record);offset+=local.length+data.length;}const centralSize=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22);push(null,end,0x06054b50,0,4);push(null,end,files.length,8,2);push(null,end,files.length,10,2);push(null,end,centralSize,12,4);push(null,end,offset,16,4);return new Blob([...parts,...central,end],{type:'application/zip'});}
async function blobBytes(blob){return new Uint8Array(await blob.arrayBuffer());}
$('downloadAllJsonBtn').addEventListener('click',()=>{const button=$('downloadAllJsonBtn');button.disabled=true;button.textContent='正在整理 20 關…';try{const files=COACH_PRESETS.map(preset=>{const level=M.fromLegacy(preset,'原題庫第 '+String(preset.id).padStart(2,'0')+' 關'),number=String(preset.id).padStart(2,'0'),name=String(level.name||'未命名關卡').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');return {name:`${number}-${name}.json`,data:JSON.stringify(M.toSpec(level),null,2)};});downloadBlob(zipArchive(files),'-20關-JSON','zip','Poolgress');toast('20 關完整 JSON 已整理完成並下載 ZIP');}catch(e){toast('20 關 JSON 下載失敗：'+e.message);}finally{button.disabled=false;button.textContent='下載 20 關 JSON';}});
$('downloadAllBtn').addEventListener('click',async()=>{const button=$('downloadAllBtn'),original=M.copy(state),originalSelected=selected,originalTargetShot=targetShot,files=[];button.disabled=true;try{for(let i=0;i<COACH_PRESETS.length;i++){button.textContent=`產生第 ${i+1}／${COACH_PRESETS.length} 關…`;state=M.fromLegacy(COACH_PRESETS[i],'原題庫第 '+String(COACH_PRESETS[i].id).padStart(2,'0')+' 關');selected=-1;targetShot=1;render(true);await new Promise(resolve=>requestAnimationFrame(resolve));const levelNumber=String(COACH_PRESETS[i].id).padStart(2,'0'),folder=levelNumber+'-'+safeFileName();files.push({name:`${folder}/${folder}-完整關卡.json`,data:JSON.stringify(M.toSpec(state),null,2)},{name:`${folder}/${folder}-關卡說明.txt`,data:'\ufeff'+levelText(levelNumber)});const staticSvg=await exportSvg(false),png=await svgToPng(staticSvg);files.push({name:`${folder}/${folder}-球形圖片.png`,data:await blobBytes(png)});if(M.animationPlan(state).available)files.push({name:`${folder}/${folder}-球形動畫.svg`,data:await exportSvg(true)});}downloadBlob(zipArchive(files),'-20關','zip','Poolgress');toast('20 關 JSON、圖片與可用動畫已整理完成並下載 ZIP');}catch(e){toast('20 關下載失敗：'+e.message);}finally{state=original;selected=originalSelected;targetShot=originalTargetShot;render(true);button.disabled=false;button.textContent='下載 20 關';}});
$('exportBtn').addEventListener('click',async()=>{const validation=M.validate(state);if(validation.errors.length){toast('關卡尚未通過檢查，請先完成必要設定');$('validation').scrollIntoView({behavior:'smooth',block:'center'});return;}const button=$('exportBtn');button.disabled=true;button.textContent='正在產生 4 個檔案…';try{const staticSvg=await exportSvg(false),animationSvg=await exportSvg(true),png=await svgToPng(staticSvg),preset=COACH_PRESETS.find(p=>p.data?.levelId===state.original?.levelId),number=preset?String(preset.id).padStart(2,'0'):'未指定';downloadBlob(new Blob([JSON.stringify(M.toSpec(state),null,2)],{type:'application/json'}),'-完整關卡','json');downloadBlob(png,'-球形圖片','png');downloadBlob(new Blob([animationSvg],{type:'image/svg+xml'}),'-球形動畫','svg');downloadBlob(new Blob(['\ufeff'+levelText(number)],{type:'text/plain;charset=utf-8'}),'-關卡說明','txt');toast('已下載 JSON、球形圖片、球形動畫與文字說明');}catch(e){toast('匯出失敗：'+e.message);}finally{button.disabled=false;button.textContent='匯出關卡 ↗';}});
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('copyBtn').addEventListener('click',async()=>{const text=state.name+'\n'+M.describe(state).map((t,i)=>(i+1)+'. '+t).join('\n')+(state.teaching?'\n教學提醒：'+state.teaching:'');try{await navigator.clipboard.writeText(text);toast('已複製題目與判分規則');}catch(e){toast('無法使用剪貼簿，請手動選取下方題目文字');}});
render(true);
if(!storageAvailable)$('saveStatus').textContent='請下載 JSON 保留草稿';
const params=new URLSearchParams(location.search),presetId=Number(params.get('level'));
if(presetId){const p=COACH_PRESETS.find(p=>p.id===presetId);if(p)replaceState(M.fromLegacy(p,'原題庫第 '+String(presetId).padStart(2,'0')+' 關'),'已載入第 '+presetId+' 關供改題');}
if(document.modelContext?.registerTool){const lifecycle=new AbortController();for(const definition of [
  {name:'read_current_poolgress_level',title:'讀取目前關卡規格',description:'Read the visible coach editor state, complete specification and validation; does not modify data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({spec:M.toSpec(state),validation:M.validate(state)})},
  {name:'configure_poolgress_level_name',title:'設定關卡名稱',description:'Set the current draft name using the same local editor action; auto-saves only in this browser, does not publish or send to the game server.',inputSchema:{type:'object',properties:{name:{type:'string',minLength:1,maxLength:100}},required:['name'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw Error('名稱須為 1–100 字');stash();state.name=input.name;commit(true);return {name:state.name,validation:M.validate(state)};}}
]){try{Promise.resolve(document.modelContext.registerTool(definition,{signal:lifecycle.signal})).catch(()=>{});}catch(e){}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}

$('directClear').addEventListener('change',()=>{stash();state.directClear=$('directClear').checked;if(state.directClear){state.order=true;state.objectTarget='pocket';}adjustClear();commit();});
