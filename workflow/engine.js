(function(root,factory){if(typeof module==='object')module.exports=factory();else root.WorkflowEngine=factory()})(this,function(){
const clone=x=>JSON.parse(JSON.stringify(x));
const directClear=s=>s.flow.template==='A'&&s.flow.onSuccess==='continue_until_clear';
const targets=['pocket','zone','stay','pocket_or_zone','none'];
function load(raw){
 const s=clone(raw);if(s.format!=='poolgress.coach-level'||s.version!==1)throw Error('請載入 poolgress.coach-level version 1 JSON。');
 if(!['A','B','C','D','E'].includes(s.flow?.template))throw Error('未知流程模板。');
 if(typeof s.name!=='string'||!Array.isArray(s.setup?.balls)||!s.setup.balls.length)throw Error('缺少名稱或球位。');
 const ball=b=>b&&typeof b.id==='string'&&['x','y'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.x<=8&&b.y>=0&&b.y<=4;
 if(!s.setup.balls.every(ball))throw Error('球位需提供有效的 8 × 4 星座標。');
 if(!s.scoring||!Number.isInteger(s.scoring.total)||s.scoring.total<1||!Number.isInteger(s.scoring.pass)||s.scoring.pass<1||s.scoring.pass>s.scoring.total||!Array.isArray(s.scoring.stars)||s.scoring.stars.length!==3||!s.scoring.stars.every((n,i,a)=>Number.isInteger(n)&&n>=0&&n<=s.scoring.total&&(!i||n>=a[i-1])))throw Error('次數、過關門檻或星等無效。');
 const t=s.flow.template,units={A:directClear(s)?'balls':'successful_shots',B:'successful_shots',C:'successful_shots',D:'balls',E:'cleared_rounds'};
 if(s.scoring.unit!==units[t])throw Error('計分單位與模板不符。');
 if(t==='C'&&(!Array.isArray(s.setup.rounds)||s.setup.rounds.length!==s.scoring.total||!s.setup.rounds.every(r=>Array.isArray(r.balls)&&r.balls.length===2&&r.balls.every(ball)&&r.balls.filter(b=>b.id==='cue').length===1)))throw Error('C 模板需要完整且次數一致的 rounds。');
 if(directClear(s)&&(s.flow.onFailure!=='end_game'||s.objectRules.order!=='ascending'||s.objectRules.target!=='pocket'||s.scoring.total!==s.setup.balls.length||s.scoring.pass!==s.scoring.total||s.scoring.stars.some(n=>n!==s.scoring.total)))throw Error('直接清檯需要依序進袋、全清過關且失敗結束。');
 const objects=s.setup.balls.filter(b=>b.id!=='cue'),cues=s.setup.balls.filter(b=>b.id==='cue');
 if(!objects.length||t==='A'&&(cues.length||s.setup.strikeMode!=='direct')||t==='B'&&(objects.length!==1||cues.length!==1)||t==='E'&&(objects.length!==2||cues.length!==1)||t==='D'&&objects.length!==s.scoring.total)throw Error('球數與流程模板不符；E v1 支援兩顆子球。');
 s.diagram??={};s.diagram.lines??=[];s.diagram.zones??=[];s.diagram.paths??=[];
 for(const k of ['lines','zones']){if(!Array.isArray(s.diagram[k])||!s.diagram[k].every(z=>['ball','cue'].includes(z.side)&&(z.shot==null||[1,2].includes(z.shot))&&['x1','y1','x2','y2'].every(v=>Number.isFinite(z[v])&&z[v]>=0&&z[v]<=1)))throw Error('目標幾何資料無效。');}
 const pockets=['top_left','top_right','bottom_left','bottom_right','top_center','bottom_center'];
 function rule(r,side,shot){if(!r||!targets.includes(r.target)||!Array.isArray(r.pockets)||!r.pockets.every(p=>pockets.includes(p)))throw Error('球目標規則無效。');
 const indexes=s.diagram.lines.flatMap((l,i)=>l.side===side&&(t!=='E'||l.shot==null||l.shot===shot)?[i]:[]);
 r.lineRequirement??={required:!!indexes.length,lineIndexes:indexes,match:'all',order:'any',event:'ball_body_touches_segment',scope:'current_shot',combineWithTarget:'and'};
 const q=r.lineRequirement;if(q.required!==!!indexes.length||!Array.isArray(q.lineIndexes)||new Set(q.lineIndexes).size!==q.lineIndexes.length||q.lineIndexes.length!==indexes.length||!q.lineIndexes.every(i=>indexes.includes(i))||q.match!=='all'||q.order!=='any'||q.event!=='ball_body_touches_segment'||q.scope!=='current_shot'||q.combineWithTarget!=='and')throw Error('必要線段規則不一致，不能略過。');
 if(['pocket','pocket_or_zone'].includes(r.target)&&!r.pockets.length)throw Error('進袋目標缺少袋口。');
 if(['zone','pocket_or_zone'].includes(r.target)&&!s.diagram.zones.some(z=>z.side===side&&(t!=='E'||z.shot==null||z.shot===shot)))throw Error('停球目標缺少區域。');
 }
 if(t==='E'){for(const [key,n] of [['first',1],['second',2]]){rule(s.shotRules?.[key]?.object,'ball',n);rule(s.shotRules?.[key]?.cue,'cue',n);}}else{rule(s.objectRules,'ball',1);rule(s.cueRules,'cue',1)}
 return s;
}
function create(spec){return {spec:load(spec),phase:'template',attempt:0,shot:1,score:0,active:[],history:[],last:null};}
function setup(r){const s=r.spec,t=s.flow.template;r.shot=1;r.targetKey=null;
 let balls=t==='C'?s.setup.rounds[r.attempt].balls:s.setup.balls;
 if(t==='A'&&!directClear(s)){let objs=balls.filter(b=>b.id!=='cue');if(s.objectRules.order==='ascending')objs=[...objs].sort((a,b)=>Number(a.id)-Number(b.id));balls=[objs[r.attempt%objs.length]];}
 r.active=clone(balls).map((b,i)=>({...b,key:i}));r.phase='placement';
}
function rules(r){return r.spec.flow.template==='E'?r.spec.shotRules[r.shot===1?'first':'second']:{object:r.spec.objectRules,cue:r.spec.cueRules};}
function target(r){let b=r.active.filter(b=>b.id!=='cue');if(r.spec.objectRules.order==='ascending')b.sort((a,b)=>Number(a.id)-Number(b.id));return b.find(x=>x.key===r.targetKey)||b[0];}
function judge(r,e){if(r.phase!=='judging')throw Error('尚未進入判定。');if(e.unknown){r.last='證據不足：請人工覆核後再判定。';return;}
 const q=rules(r),obj=target(r);if(!obj)throw Error('沒有目標球。');
 const ok=e.object&& (q.cue.target==='none'||e.cue)&&e.order!==false&&!e.foul&&[...q.object.lineRequirement.lineIndexes,...q.cue.lineRequirement.lineIndexes].every(i=>e.lines?.includes(i));
 if(ok&&q.cue.target!=='none'&&(!Number.isFinite(e.cueX)||!Number.isFinite(e.cueY)||e.cueX<0||e.cueX>8||e.cueY<0||e.cueY>4))throw Error('請填有效母球停球點。');
 if(ok&&(q.cue.target==='zone'||q.cue.target==='pocket_or_zone'&&e.cueInZone)){const fx=.0543+e.cueX/8*.891,fy=.0979+e.cueY/4*.8035;if(!r.spec.diagram.zones.some(z=>z.side==='cue'&&(r.spec.flow.template!=='E'||z.shot==null||z.shot===r.shot)&&fx>=Math.min(z.x1,z.x2)&&fx<=Math.max(z.x1,z.x2)&&fy>=Math.min(z.y1,z.y2)&&fy<=Math.max(z.y1,z.y2)))throw Error('母球停球點不在目標區內。');}
 r.history.push({attempt:r.attempt+1,shot:r.shot,success:ok,ball:obj.id});r.last=ok?'本桿成功':'本桿失敗';const t=r.spec.flow.template;
 if(ok){const cue=r.active.find(b=>b.id==='cue');if(cue){cue.x=e.cueX;cue.y=e.cueY;}
 if(['D','E'].includes(t)||directClear(r.spec)){r.active=r.active.filter(b=>b.key!==obj.key);r.targetKey=null;if(t==='D'||directClear(r.spec))r.score++;
 if(r.active.some(b=>b.id!=='cue')){r.shot++;r.phase='continuation';return;}
 if(t==='E')r.score++;else{r.phase='settlement';return;}}
 else r.score++;}
 if(t==='D'||directClear(r.spec)){r.phase='settlement';return;}r.attempt++;r.phase=r.attempt>=r.spec.scoring.total?'settlement':'result';
}
function result(r){const s=r.spec.scoring;return {passed:r.score>=s.pass,stars:s.stars.filter(n=>r.score>=n).length};}
return {load,create,setup,rules,target,judge,result};
});
