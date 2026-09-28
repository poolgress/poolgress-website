(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CoachModel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const GRID={left:.0543,right:.9453,top:.0979,bottom:.9014};
  const POCKETS=[['top_left','左上袋',.0498,.0858],['top_right','右上袋',.9497,.0858],['bottom_left','左下袋',.0498,.9133],['bottom_right','右下袋',.9497,.9133],['top_center','上中袋',.4998,.0605],['bottom_center','下中袋',.4998,.9387]];
  const FLOWS={A:{name:'只有子球',description:'不使用母球，直接擊打一顆或多顆子球。',steps:['擺子球','直接擊打','判定','進入下一球或下一次']},B:{name:'固定位置擊球',description:'每次用母球打子球，只打一桿；成功或失敗後都重擺。',steps:['擺母球與子球','打一桿','雙重判定','重擺']},C:{name:'子/母球換位練習',description:'一次只擺一顆母球與一顆子球；判定後進入下一位置。',steps:['本輪球位','打一桿','判定','下一位置']},D:{name:'球形挑戰',description:'使用母球挑戰整副球形；合法進球後原位續桿，失誤即結束。',steps:['擺整副球','母球擊打子球','合法則續桿','清檯或失誤結算']},E:{name:'打一顆做一顆',description:'輪內成功後原位續桿；清完算一輪成功，失誤算一輪失敗，再重擺下一輪。',steps:['擺本輪球型','輪內續桿','清完才得分','重擺下一輪']}};
  const copy=x=>JSON.parse(JSON.stringify(x));
  function eraseDrawing(s,kind,index,side){const next=copy(s);if(kind==='all'){next.balls=[];next.paths=[];next.zones=[];next.pockets=Array(6).fill(false);next.pockets2=Array(6).fill(false);if(next.original){next.original.lines=[];next.original.balls=[];next.original.paths=[];next.original.zones=[];next.original.pockets=Array(6).fill(false);}}else if(kind==='ball'){next.balls.splice(index,1);next.paths=next.paths.filter(p=>p.ball!==index).map(p=>({...p,ball:p.ball>index?p.ball-1:p.ball}));}else if(kind==='path')next.paths.splice(index,1);else if(kind==='zone')next.zones.splice(index,1);else if(kind==='pocket'){const p=next.pockets[index];next.pockets[index]=p==='both'?(side==='ball'?'cue':'ball'):false;}return next;}
  const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'level-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const round=n=>Math.round(n*1e6)/1e6;
  const star=(fx,fy)=>({x:round((fx-GRID.left)/(GRID.right-GRID.left)*8),y:round((fy-GRID.top)/(GRID.bottom-GRID.top)*4)});
  const frac=(x,y)=>({fx:round(GRID.left+x/8*(GRID.right-GRID.left)),fy:round(GRID.top+y/4*(GRID.bottom-GRID.top))});
  const repeatable=id=>['cue','gray','red'].includes(id);
  const ballName=id=>({cue:'母球',gray:'灰球',red:'紅球'})[id]||id+' 號球';
  const ballColor=id=>({cue:'#ffffff',gray:'#6b7280',red:'#e53935'})[id]||['#f2dc4e','#074282','#bf000d','#d94a66','#563f8e','#03774d','#964117','#151515'][((Number(id)-1)%8)]||'#ffcb67';
  function snapPoint(p,enabled=true){let {x,y}=star(p.fx,p.fy);if(enabled){x=Math.round(x*4)/4;y=Math.round(y*4)/4;}return frac(Math.max(0,Math.min(8,x)),Math.max(0,Math.min(4,y)));}
  function routeSegments(points,gap=9){const raw=[];return points.slice(1).map((to,i)=>{const from=points[i],dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy)||1;const returnCount=raw.filter(s=>{const px=s.x2-s.x1,py=s.y2-s.y1,plen=Math.hypot(px,py)||1,dot=(px*dx+py*dy)/(plen*len);if(dot>-.985)return false;const distance=Math.abs(px*(from.y-s.y1)-py*(from.x-s.x1))/plen;if(distance>2.5)return false;const project=p=>((p.x-s.x1)*px+(p.y-s.y1)*py)/(plen*plen),a=project(from),b=project(to),overlap=Math.min(1,Math.max(a,b))-Math.max(0,Math.min(a,b));return overlap*plen>3;}).length;raw.push({x1:from.x,y1:from.y,x2:to.x,y2:to.y});if(!returnCount)return {x1:from.x,y1:from.y,x2:to.x,y2:to.y,offset:false};const shift=gap*returnCount,nx=-dy/len,ny=dx/len;return {x1:from.x+nx*shift,y1:from.y+ny*shift,x2:to.x+nx*shift,y2:to.y+ny*shift,offset:true,joinX:from.x,joinY:from.y};});}
  // Authoring aid, not a physics simulation: lock contact points crossed by the drag ray.
  function extendRoute(balls,index,locked,target,lastHit=null){
    const vertices=copy(locked),end=star(target.fx,target.fy),diameter=.19;
    for(let iteration=0;iteration<16;iteration++){
      const start=star((vertices.at(-1)||balls[index]).fx,(vertices.at(-1)||balls[index]).fy);
      const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);if(length<1e-6)break;
      const ux=dx/length,uy=dy/length;let distance=length,hit=null;
      balls.forEach((ball,i)=>{if(i===index||i===lastHit)return;const b=star(ball.fx,ball.fy),ox=start.x-b.x,oy=start.y-b.y,projection=ux*ox+uy*oy,disc=projection*projection-(ox*ox+oy*oy-diameter*diameter);if(disc<0)return;const t=-projection-Math.sqrt(disc);if(t>1e-4&&t<distance){distance=t;hit=i;}});
      const edges=[Math.abs(ux)>1e-9?(.095-start.x)/ux:NaN,Math.abs(ux)>1e-9?(7.905-start.x)/ux:NaN,Math.abs(uy)>1e-9?(.095-start.y)/uy:NaN,Math.abs(uy)>1e-9?(3.905-start.y)/uy:NaN];
      for(const t of edges){if(!(t>1e-4&&t<distance))continue;const x=start.x+ux*t,y=start.y+uy*t;const nearPocket=[[0,0],[8,0],[0,4],[8,4],[4,0],[4,4]].some(([px,py])=>Math.hypot(x-px,y-py)<.32);if(x>=.095-1e-6&&x<=7.905+1e-6&&y>=.095-1e-6&&y<=3.905+1e-6&&!nearPocket){distance=t;hit='cushion';}}
      if(hit===null)break;vertices.push({...frac(start.x+ux*distance,start.y+uy*distance),ghost:true});lastHit=hit;
    }
    return {locked:vertices,lastHit,live:snapPoint(target,false)};
  }
  function animationPlan(s){
    if(s.cuePlacement==='free')return {available:false,reason:'自由母球沒有固定起點，不提供動畫。',tracks:[]};
    const paths=s.paths.filter(p=>s.balls[p.ball]&&p.vertices?.length);
    if(!paths.length)return {available:false,reason:'請先為球畫上路線。',tracks:[]};
    const makeTrack=(p,delay=0)=>{const points=[s.balls[p.ball],...p.vertices],lengths=[];let distance=0;for(let i=1;i<points.length;i++){const a=star(points[i-1].fx,points[i-1].fy),b=star(points[i].fx,points[i].fy),n=Math.hypot(b.x-a.x,b.y-a.y);lengths.push(n);distance+=n;}const duration=Math.max(562.5,distance*350),keyframes=points.map((point,i)=>({fx:point.fx,fy:point.fy,offset:i===0?0:distance?lengths.slice(0,i).reduce((a,b)=>a+b,0)/distance:1}));return {ball:p.ball,delay,duration,keyframes,distance,pocketed:false};};
    const markPocketed=(track,p,shot=1)=>{const ball=s.balls[p.ball],side=ball.id==='cue'?'cue':'ball',target=side==='cue'?(shot===2?s.cueTarget2:s.cueTarget):(shot===2?s.objectTarget2:s.objectTarget);if(!['pocket','pocket_or_zone'].includes(target))return track;const pockets=shot===2?s.pockets2:s.pockets,end=star(p.vertices.at(-1).fx,p.vertices.at(-1).fy);track.pocketed=POCKETS.some((pocket,i)=>[side,'both'].includes(pockets[i])&&Math.hypot(end.x-star(pocket[2],pocket[3]).x,end.y-star(pocket[2],pocket[3]).y)<=.7);return track;};
    const objectPaths=paths.filter(p=>s.balls[p.ball].id!=='cue'),orderedPaths=s.order?[...objectPaths].sort((a,b)=>Number(s.balls[a.ball].id)-Number(s.balls[b.ball].id)):objectPaths;
    if(s.strike==='direct'){const tracks=orderedPaths.map(p=>markPocketed(makeTrack(p),p));if(s.order){let cursor=0;for(const track of tracks){track.delay=cursor;cursor+=track.duration+180;}}return {available:true,reason:'',tracks};}
    const cuePath=paths.find(p=>s.balls[p.ball].id==='cue');
    if(!cuePath)return {available:false,reason:'請先畫出母球路線。',tracks:[]};
    const cueTrack=makeTrack(cuePath),objectBalls=s.balls.filter(b=>b.id!=='cue'),contactVertex=cuePath.vertices.findIndex(v=>v.ghost&&objectBalls.some(ball=>{const a=star(v.fx,v.fy),b=star(ball.fx,ball.fy);return Math.hypot(a.x-b.x,a.y-b.y)<=.27;}));
    if(contactVertex>=0&&cueTrack.distance>0){const contactFrame=cueTrack.keyframes[contactVertex+1],contactDistance=cueTrack.distance*contactFrame.offset,postDistance=cueTrack.distance-contactDistance,postCollisionSpeed=.6,totalTimeDistance=contactDistance+postDistance/postCollisionSpeed,baseDuration=cueTrack.duration;cueTrack.duration=baseDuration*(totalTimeDistance/cueTrack.distance);cueTrack.keyframes=cueTrack.keyframes.map(frame=>{const d=cueTrack.distance*frame.offset,timeDistance=d<=contactDistance?d:contactDistance+(d-contactDistance)/postCollisionSpeed;return {...frame,offset:timeDistance/totalTimeDistance};});}
    let sequenceCursor=0,cueEnd=cueTrack.keyframes.at(-1);const objects=orderedPaths.map(p=>{const ball=s.balls[p.ball],hit=cuePath.vertices.findIndex(v=>{const a=star(v.fx,v.fy),b=star(ball.fx,ball.fy);return Math.hypot(a.x-b.x,a.y-b.y)<=.27;});let delay=hit>=0?cueTrack.duration*cueTrack.keyframes[hit+1].offset:cueTrack.duration;
      if(hit<0&&s.order){const from=star(cueEnd.fx,cueEnd.fy),to=star(ball.fx,ball.fy),dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length>.27){const travel=Math.max(250,(length-.19)*350),oldDuration=cueTrack.duration,pause=s.flow==='E'?2000:0,newDuration=oldDuration+pause+travel,contact=frac(to.x-dx/length*.19,to.y-dy/length*.19);cueTrack.keyframes=cueTrack.keyframes.map(frame=>({...frame,offset:frame.offset*oldDuration/newDuration}));if(pause)cueTrack.keyframes.push({...cueEnd,offset:(oldDuration+pause)/newDuration});cueTrack.keyframes.push({...contact,offset:1});cueTrack.duration=newDuration;cueTrack.distance+=length-.19;cueEnd={...contact,offset:1};delay=newDuration;}}
      const shot=s.flow==='E'&&orderedPaths.indexOf(p)>0?2:1,track=markPocketed(makeTrack(p,delay),p,shot);if(s.order){track.delay=Math.max(track.delay,sequenceCursor);sequenceCursor=track.delay+track.duration+180;}return track;});
    markPocketed(cueTrack,cuePath,s.flow==='E'?2:1);return {available:true,reason:'',tracks:[cueTrack,...objects]};
  }
  function blank(){return {id:uid(),name:'我的新關卡',flow:'B',strike:'cue',cuePlacement:'fixed',rotation:'object',cycles:1,balls:[],paths:[],zones:[],pockets:Array(6).fill(false),pockets2:Array(6).fill(false),objectTarget:'pocket',cueTarget:'stay',objectTarget2:'pocket',cueTarget2:'stay',order:false,noContact:false,total:10,pass:7,stars:[7,9,10],teaching:'',grid:true,snap:true,source:'教練新題',original:null};}
  const hasPocket=(s,side,shot=1)=>(shot===2?s.pockets2:s.pockets).some(p=>p===side||p==='both');
  const hasZone=(s,side,shot=1)=>s.zones.some(z=>z.side===side&&(z.shot==null||z.shot===shot));
  const names=(s,side,shot=1)=>(shot===2?s.pockets2:s.pockets).flatMap((p,i)=>p===side||p==='both'?[POCKETS[i][1]]:[]).join('、')||'尚未指定袋口';
  function roundCount(s){const n=s.balls.filter(b=>s.rotation==='cue'?b.id==='cue':b.id!=='cue').length;return n*s.cycles;}
  function total(s){return s.flow==='D'?s.balls.filter(b=>b.id!=='cue').length:s.flow==='C'?roundCount(s):s.total;}
  function roundPlan(s){if(s.flow!=='C'||!Number.isInteger(s.cycles)||s.cycles<1||s.cycles>100)return null;const cues=s.balls.filter(b=>b.id==='cue'),objs=s.balls.filter(b=>b.id!=='cue');const changing=s.rotation==='cue'?cues:[...objs].sort((a,b)=>Number(a.id)-Number(b.id));const out=[];for(let cycle=0;cycle<s.cycles;cycle++)for(const b of changing){const pair=s.rotation==='cue'?[b,objs[0]]:[cues[0],b];out.push({round:out.length+1,balls:pair.filter(Boolean).map(x=>({...x}))});}return out;}
  function assertShape(s){
    if(!s||typeof s!=='object'||!FLOWS[s.flow])throw Error('關卡流程格式不正確。');
    if(!['direct','cue'].includes(s.strike)||!['none','fixed','free'].includes(s.cuePlacement)||!['object','cue'].includes(s.rotation))throw Error('擺球設定格式不正確。');
    if(![s.objectTarget,s.cueTarget,s.objectTarget2,s.cueTarget2].every(v=>['pocket','zone','stay','pocket_or_zone'].includes(v)))throw Error('球目標規則格式不正確。');
    if(!Array.isArray(s.balls)||!Array.isArray(s.zones)||s.zones.length>30||!Array.isArray(s.paths))throw Error('球型資料格式不正確或停球區過多。');
    const fraction=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
    for(const b of s.balls)if(!b||!['cue','gray','red',...Array.from({length:15},(_,i)=>String(i+1))].includes(b.id)||!fraction(b.fx)||!fraction(b.fy))throw Error('球號或球位座標不正確。');
    for(const z of s.zones)if(!z||!['cue','ball'].includes(z.side)||z.shot!=null&&![1,2].includes(z.shot)||!['x1','y1','x2','y2'].every(k=>fraction(z[k])))throw Error('停球區資料不正確。');
    for(const p of s.paths)if(!p||!Number.isInteger(p.ball)||p.ball<0||p.ball>=s.balls.length||!Array.isArray(p.vertices)||p.vertices.length>200||!p.vertices.every(v=>fraction(v.fx)&&fraction(v.fy)))throw Error('路線或其對應球不正確。');
    if(![s.pockets,s.pockets2].every(a=>Array.isArray(a)&&a.length===6&&a.every(v=>[false,'ball','cue','both'].includes(v))))throw Error('袋口必須包含兩組六個合法設定。');
    if(!Array.isArray(s.stars)||s.stars.length!==3||typeof s.name!=='string'||s.name.length>100||typeof s.teaching!=='string'||s.teaching.length>5000)throw Error('名稱、教學說明或星等格式不正確。');
    if(!Number.isInteger(s.cycles)||s.cycles<1||s.cycles>100)throw Error('輪換循環次數必須為 1–100 的整數。');
    return s;
  }
  function validate(s){
    const errors=[],warnings=[];try{assertShape(s)}catch(e){return {errors:[e.message],warnings}}
    const cues=s.balls.filter(b=>b.id==='cue'),objs=s.balls.filter(b=>b.id!=='cue');
    if(!s.name.trim())errors.push('請填寫關卡名稱。');
    if(!objs.length)errors.push('請至少放置一顆目標子球。');
    if(s.strike==='direct'&&(cues.length||s.cuePlacement!=='none'))errors.push('直接擊球不使用母球，請移除白球並使用「無母球」。');
    if(s.flow==='A'&&s.strike!=='direct')errors.push('流程 A 必須由球桿直接擊打子球，不使用母球。');
    if(['B','C','E'].includes(s.flow)&&s.strike!=='cue')errors.push('此流程需要使用母球。');
    if(s.flow==='D'&&s.strike!=='cue')errors.push('球形挑戰必須使用母球撞擊子球。');
    if(s.strike==='cue'&&s.cuePlacement==='none')errors.push('請選擇固定母球或自由母球。');
    if(s.cuePlacement==='free'&&s.flow!=='D')errors.push('自由母球目前僅搭配球形挑戰流程。');
    if(s.strike==='cue'&&s.cuePlacement==='free'&&cues.length)errors.push('自由母球不指定固定起點，請移除圖上的白球。');
    if(s.strike==='cue'&&s.cuePlacement==='fixed'&&s.flow!=='C'&&cues.length!==1)errors.push('固定母球需要恰好一顆白球。');
    if(s.flow==='B'&&objs.length!==1)errors.push('固定位置擊球需要恰好一顆子球。');
    if(s.flow==='C'){
      if(s.rotation==='cue'&&(objs.length!==1||cues.length<1))errors.push('輪換母球：一顆子球與至少一個母球起點。');
      if(s.rotation==='object'&&(cues.length!==1||objs.length<1))errors.push('輪換子球：一顆母球與至少一個子球位置。');
    }
    const numbered=objs.filter(b=>!repeatable(b.id));if(new Set(numbered.map(b=>b.id)).size!==numbered.length)errors.push('編號子球不可重複；白、灰、紅球可重複擺放。');
    if(s.order&&objs.some(b=>['gray','red'].includes(b.id)))errors.push('灰球與紅球沒有號碼，請取消依號碼順序，或改用編號球。');
    if(cues.length>1&&s.flow!=='C')warnings.push('白球可不限顆數繪圖；目前流程仍需指定單一母球，未完成規則時可下載草稿。');
    if(['pocket','pocket_or_zone'].includes(s.objectTarget)&&!hasPocket(s,'ball'))errors.push('請選擇子球目標袋口。');
    if(['zone','pocket_or_zone'].includes(s.objectTarget)&&!hasZone(s,'ball',1))errors.push('請畫出子球停球區。');
    if(['stay','zone'].includes(s.objectTarget)&&hasPocket(s,'ball'))errors.push('子球需留桌，請取消子球袋口標記。');
    if(s.strike==='cue'){
      if(['pocket','pocket_or_zone'].includes(s.cueTarget)&&!hasPocket(s,'cue'))errors.push('請選擇母球目標袋口。');
      if(['zone','pocket_or_zone'].includes(s.cueTarget)&&!hasZone(s,'cue',1))errors.push('請畫出母球停球區。');
      if(['stay','zone'].includes(s.cueTarget)&&hasPocket(s,'cue'))errors.push('母球需留桌，請取消母球袋口標記。');
    }else if(hasPocket(s,'cue')||s.zones.some(z=>z.side==='cue'))errors.push('無母球關卡不能有母球袋口或停球區。');
    if(s.flow==='E'){
      if(['pocket','pocket_or_zone'].includes(s.objectTarget2)&&!hasPocket(s,'ball',2))errors.push('請選擇第二桿子球目標袋口。');
      if(['zone','pocket_or_zone'].includes(s.objectTarget2)&&!hasZone(s,'ball',2))errors.push('請畫出第二桿子球停球區。');
      if(['stay','zone'].includes(s.objectTarget2)&&hasPocket(s,'ball',2))errors.push('第二桿子球需留桌，請取消第二桿子球袋口。');
      if(['pocket','pocket_or_zone'].includes(s.cueTarget2)&&!hasPocket(s,'cue',2))errors.push('請選擇第二桿母球目標袋口。');
      if(['zone','pocket_or_zone'].includes(s.cueTarget2)&&!hasZone(s,'cue',2))errors.push('請畫出第二桿母球停球區。');
      if(['stay','zone'].includes(s.cueTarget2)&&hasPocket(s,'cue',2))errors.push('第二桿母球需留桌，請取消第二桿母球袋口。');
    }
    if(s.flow==='D'&&s.objectTarget!=='pocket')errors.push('球形挑戰需要以子球進袋為目標。');
    if(s.flow==='D'&&['pocket','pocket_or_zone'].includes(s.cueTarget)&&s.strike==='cue')errors.push('球形挑戰的母球須留桌，不能設定母球進袋。');
    if(s.order&&!['pocket','pocket_or_zone'].includes(s.objectTarget))errors.push('號碼順序目前適用於進袋目標。');
    if(s.zones.some(z=>Math.abs(z.x2-z.x1)<.005||Math.abs(z.y2-z.y1)<.005))errors.push('停球區太小，請重新繪製。');
    const n=total(s);if(!Number.isInteger(n)||n<1||n>1000)errors.push('總次數／輪數須為 1–1000 的整數。');
    if(!Number.isInteger(s.pass)||s.pass<1||s.pass>n)errors.push('過關門檻必須介於 1 與總次數之間。');
    if(!s.stars.every(v=>Number.isInteger(v)&&v>=1&&v<=n)||s.stars[0]>s.stars[1]||s.stars[1]>s.stars[2])errors.push('星等須為遞增整數，且不得超過總次數／球數。');
    if(s.stars[0]<s.pass)errors.push('一星門檻不可低於過關門檻。');
    if(s.flow==='D'&&(s.pass!==n||s.stars.some(v=>v!==n)))errors.push('本工具的清檯通關模板須全清；過關與星等請設為子球總數。');
    const groups=s.flow==='C'?roundPlan(s).map(r=>r.balls):[s.balls];
    let overlap=false;for(const group of groups)for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=star(group[i].fx,group[i].fy),b=star(group[j].fx,group[j].fy);if(Math.hypot(a.x-b.x,a.y-b.y)<.16)overlap=true;}
    if(overlap)errors.push('同一輪有球位重疊，請把球分開。');
    if(s.balls.some(b=>b.fx<GRID.left||b.fx>GRID.right||b.fy<GRID.top||b.fy>GRID.bottom))errors.push('球心位於庫鼻範圍之外，請移回桌面。');
    if(s.paths.length)warnings.push('路線只作教學示意，不自動驗證碰庫、推桿或拉桿。');
    if(s.noContact)warnings.push('現有遊戲以明顯位移推測碰球，輕微擦碰仍可能漏判。');
    if(s.original?.lines?.length)warnings.push('已保留匯入的舊線段；本工作台不編輯或判定線段。');
    return {errors:[...new Set(errors)],warnings};
  }
  function describe(s){
    const n=total(s),obj=({pocket:`子球進入${names(s,'ball')}。`,zone:'子球停在金色目標區塊內。',stay:'子球留在桌面上。',pocket_or_zone:`子球進入${names(s,'ball')}，或停在金色目標區塊內，二擇一。`})[s.objectTarget];
    let cue='不使用母球，球桿直接擊打目標球。';
    if(s.strike==='cue')cue=({stay:'母球留在桌面上，洗袋失敗。',pocket:`母球進入${names(s,'cue')}。`,zone:'母球須停在白色目標區塊內。',pocket_or_zone:`母球進入${names(s,'cue')}，或停在白色目標區塊內，二擇一。`})[s.cueTarget];
    const second=s.flow==='E'?[({pocket:`第二桿子球進入${names(s,'ball',2)}。`,zone:'第二桿子球停在金色目標區塊內。',stay:'第二桿子球留在桌面上。',pocket_or_zone:`第二桿子球進入${names(s,'ball',2)}，或停在金色目標區塊內。`})[s.objectTarget2],({stay:'第二桿母球留在桌面上。',pocket:`第二桿母球進入${names(s,'cue',2)}。`,zone:'第二桿母球停在白色目標區塊內。',pocket_or_zone:`第二桿母球進入${names(s,'cue',2)}，或停在白色目標區塊內。`})[s.cueTarget2]]:[];
    const setup=s.strike==='direct'?'直接擊打目標球':s.cuePlacement==='free'?'開局母球自由放置，之後原位續桿':'依圖擺放母球與子球';
    const simultaneousObjects=['D','E'].includes(s.flow)?s.balls.filter(b=>b.id!=='cue').length:1;
    const order=simultaneousObjects>1?(s.order?'按剩餘子球號碼由小到大進袋':'子球順序不限'):'';
    const extra=s.noContact?'不得碰動其他子球，每桿最多進一顆':'';
    const score=s.flow==='D'?`單局清完 ${n} 顆才過關，失誤即結束；全清獲三星。`:`${s.flow==='E'?'清完一輪才算成功一次；':''}共 ${n} ${s.flow==='E'?'輪':'次'}，成功 ${s.pass} 次過關；${s.stars.join('／')} 次為一／二／三星。`;
    const gameRule=order||extra?`${[order,extra].filter(Boolean).join('；')}。`:null;
    return [`${FLOWS[s.flow].name}：${setup}。${s.flow==='C'?`依${s.rotation==='cue'?'母球加入位置':'子球號碼'}輪換，循環 ${s.cycles} 次。`:''}`,s.flow==='E'?'第一桿：'+obj:obj,s.flow==='E'?'第一桿：'+cue:cue,...second,gameRule,score].filter(Boolean);
  }
  function toSpec(s){
    const withStar=b=>({...b,...star(b.fx,b.fy)});
    return {format:'poolgress.coach-level',version:1,id:s.id,name:s.name,
      flow:{template:s.flow,name:FLOWS[s.flow].name,onSuccess:['D','E'].includes(s.flow)?'continue_until_clear':'next_attempt',onFailure:s.flow==='D'?'end_game':'next_attempt'},
      setup:{strikeMode:s.strike,cuePlacement:s.cuePlacement,rotation:s.flow==='C'?s.rotation:null,cycles:s.cycles,coordinateSystem:{diagram:'table7-image-fraction',game:{unit:'star',xMax:8,yMax:4,origin:'top-left-cushion-nose'},imageBounds:GRID},balls:s.balls.map(withStar),rounds:roundPlan(s)?.map(r=>({...r,balls:r.balls.map(withStar)}))||null},
      objectRules:{target:s.objectTarget,pockets:POCKETS.filter((p,i)=>['ball','both'].includes(s.pockets[i])).map(p=>p[0]),order:s.order?'ascending':'any'},
      cueRules:{target:s.strike==='direct'?'none':s.cueTarget,pockets:POCKETS.filter((p,i)=>['cue','both'].includes(s.pockets[i])).map(p=>p[0]),zoneAppliesTo:s.flow==='E'&&s.cueTarget!==s.cueTarget2?'first_shot':'every_shot'},
      shotRules:s.flow==='E'?{first:{object:{target:s.objectTarget,pockets:POCKETS.filter((p,i)=>['ball','both'].includes(s.pockets[i])).map(p=>p[0])},cue:{target:s.cueTarget,pockets:POCKETS.filter((p,i)=>['cue','both'].includes(s.pockets[i])).map(p=>p[0])}},second:{object:{target:s.objectTarget2,pockets:POCKETS.filter((p,i)=>['ball','both'].includes(s.pockets2[i])).map(p=>p[0])},cue:{target:s.cueTarget2,pockets:POCKETS.filter((p,i)=>['cue','both'].includes(s.pockets2[i])).map(p=>p[0])}}}:null,
      fouls:{otherObjectBallsMustNotMove:s.noContact,multipleObjectPotsForbidden:s.noContact},
      scoring:{unit:s.flow==='D'?'balls':s.flow==='E'?'cleared_rounds':'successful_shots',total:total(s),pass:s.pass,stars:[...s.stars]},
      diagram:{zones:copy(s.zones),paths:copy(s.paths),grid:s.grid,snap:s.snap},teaching:s.teaching,source:s.source,
      legacyEditorExtras:s.original?copy(s.original):null};
  }
  function fromSpec(j){if(j.version!==1)throw Error('不支援此完整關卡版本。');const s=blank();Object.assign(s,{id:typeof j.id==='string'?j.id:uid(),name:j.name,flow:j.flow?.template,strike:j.setup?.strikeMode,cuePlacement:j.setup?.cuePlacement,rotation:j.setup?.rotation||'object',cycles:j.setup?.cycles??1,balls:(j.setup?.balls||[]).map(b=>({id:b.id,fx:b.fx,fy:b.fy})),paths:j.diagram?.paths||[],zones:j.diagram?.zones||[],grid:j.diagram?.grid??true,snap:j.diagram?.snap??true,objectTarget:j.objectRules?.target,cueTarget:j.cueRules?.target==='none'?'stay':j.cueRules?.target,order:j.objectRules?.order==='ascending',noContact:!!j.fouls?.otherObjectBallsMustNotMove,total:j.scoring?.total,pass:j.scoring?.pass,stars:j.scoring?.stars,teaching:j.teaching||'',source:typeof j.source==='string'?j.source:'匯入完整關卡',original:j.legacyEditorExtras||null});if(s.flow==='D'&&s.strike==='direct')s.flow='A';s.objectTarget2=j.shotRules?.second?.object?.target||s.objectTarget;s.cueTarget2=j.shotRules?.second?.cue?.target||(j.cueRules?.zoneAppliesTo==='first_shot'?'stay':s.cueTarget);
    for(const p of j.objectRules?.pockets||[]){const i=POCKETS.findIndex(x=>x[0]===p);if(i<0)throw Error('未知袋口代碼');s.pockets[i]='ball'}for(const p of j.cueRules?.pockets||[]){const i=POCKETS.findIndex(x=>x[0]===p);if(i<0)throw Error('未知袋口代碼');s.pockets[i]=s.pockets[i]==='ball'?'both':'cue'}for(const p of j.shotRules?.second?.object?.pockets||[]){const i=POCKETS.findIndex(x=>x[0]===p);if(i<0)throw Error('未知袋口代碼');s.pockets2[i]='ball'}for(const p of j.shotRules?.second?.cue?.pockets||[]){const i=POCKETS.findIndex(x=>x[0]===p);if(i<0)throw Error('未知袋口代碼');s.pockets2[i]=s.pockets2[i]==='ball'?'both':'cue'}if(!j.shotRules?.second)s.pockets2=[...s.pockets];return assertShape(s);}
  function fromLegacy(input,source='匯入 Table7 存檔'){
    let d=copy(input.data||input);if(!Array.isArray(d.balls)||!d.note)throw Error('找不到 Table7 的 balls 與 note。');
    const game=input.schemaVersion===2&&input.coordSystem?.unit==='star';
    if(game){d.balls=d.balls.map(b=>({id:b.id,...frac(b.x,b.y)}));d.zones=(d.zones||[]).map(z=>{const a=frac(z.x1,z.y1),b=frac(z.x2,z.y2);return {side:z.side,x1:a.fx,y1:a.fy,x2:b.fx,y2:b.fy}});d.paths=(d.paths||[]).map(p=>({ball:p.ball,vertices:p.vertices.slice(1).map(v=>({...frac(v.x,v.y),ghost:!!v.ghost}))}));if(d.lines?.length)throw Error('此星座標檔含有線段，請先由 Table7 匯出比例座標存檔。');const opts={classic_fixed:0,object_only:1,object_moves:2,cue_moves:3};if(typeof d.note.opt==='string')d.note.opt=opts[d.note.opt]??0;const st=d.note.stars||[];d.note.star1=st[0]??d.note.pass;d.note.star2=st[1]??d.note.pass;d.note.star3=st[2]??d.note.pass;}
    const n=d.note,cues=d.balls.filter(b=>b.id==='cue'),objs=d.balls.filter(b=>b.id!=='cue');const s=blank();
    s.id=d.levelId||uid();s.name=n.name||'匯入關卡';s.teaching=n.desc||'';s.balls=d.balls.map(b=>({id:String(b.id),fx:b.fx,fy:b.fy}));s.paths=d.paths||[];s.zones=d.zones||[];s.pockets=(d.pockets||Array(6).fill(false)).map(p=>p===true?'ball':p);s.grid=d.grid??true;s.snap=d.snap??true;s.source=source;s.original=d;
    s.strike=(n.no_cue||!cues.length&&n.mode!=='clear'||cues.length===1&&!objs.length)?'direct':'cue';
    if(n.type==='pattern'&&n.opt===0)s.strike='direct';
    if(n.type==='pattern'&&n.opt!==0)s.strike='cue';
    if(s.strike==='direct'&&!objs.length&&cues.length===1)s.balls[0].id='1';
    s.cuePlacement=s.strike==='direct'?'none':!cues.length?'free':'fixed';
    const count=Number(n.total);s.flow=s.strike==='direct'?'A':n.mode==='repeat_clear'?'E':n.mode==='clear'||n.type==='pattern'?'D':cues.length>1||cues.length===1&&objs.length>1&&objs.length===count?'C':'B';
    s.rotation=cues.length>1?'cue':'object';s.cycles=s.flow==='C'?Math.max(1,count/(s.rotation==='cue'?cues.length:objs.length)):1;
    const ballZone=s.zones.some(z=>z.side==='ball')||(s.strike==='direct'&&s.zones.length);s.objectTarget=hasPocket(s,'ball')?(ballZone?'pocket_or_zone':'pocket'):s.zones.length&&s.strike==='direct'?'zone':n.reqs?.ball==='stay_in_target_zone'?'zone':'stay';
    if(s.strike==='direct')s.zones=s.zones.map(z=>({...z,side:'ball'}));
    const cueZone=s.strike==='cue'&&s.zones.some(z=>z.side==='cue');s.cueTarget=hasPocket(s,'cue')?(cueZone?'pocket_or_zone':'pocket'):cueZone?'zone':'stay';
    if(s.strike==='cue'&&s.zones.some(z=>z.side==='ball'))s.objectTarget=hasPocket(s,'ball')?'pocket_or_zone':'zone';
    s.objectTarget2=s.objectTarget;s.cueTarget2=n.zone_first_only?'stay':s.cueTarget;s.pockets2=[...s.pockets];s.order=!!n.order;s.noContact=!!n.no_contact;s.total=count||10;s.pass=Number(n.pass)||s.total;s.stars=[Number(n.star1||n.pass)||s.pass,Number(n.star2||n.star3||n.pass)||s.pass,Number(n.star3||n.pass)||s.pass];return assertShape(s);
  }
  function toLegacy(s){
    const req={stay:0,pocket:1,zone:2,pocket_or_zone:0};let cueIdx=0;
    const d=copy(s.original||{});Object.assign(d,{v:2,levelId:s.id,ballScale:d.ballScale||1,balls:s.balls.map(b=>({...b,...(b.id==='cue'?{cueIndex:++cueIdx}:{})})),paths:copy(s.paths),pockets:[...s.pockets],zones:copy(s.zones),lines:d.lines||[],grid:s.grid,snap:s.snap,cue:d.cue||{shown:false,fx:.015,fy:.04,sx:'50%',sy:'50%'}});
    const n=d.note||{};for(const key of ['mode','order','no_contact','zone_first_only','no_cue'])delete n[key];
    d.note={...n,shown:true,fx:n.fx??.60,fy:n.fy??.2,name:s.name,type:s.flow==='D'?'pattern':'repeat',opt:s.flow==='D'?(s.strike==='direct'?0:s.order?1:2):s.strike==='direct'?1:s.flow==='C'?(s.rotation==='cue'?3:2):0,desc:describe(s).join('\n')+(s.teaching?'\n教學提醒：'+s.teaching:''),pass:String(s.pass),total:String(total(s)),star1:String(s.stars[0]),star2:String(s.stars[1]),star3:String(s.stars[2]),reqs:{...(n.reqs||{}),req_ball:req[s.objectTarget],req_cue:req[s.cueTarget]},...(s.flow==='D'?{mode:'clear'}:{}),...(s.flow==='E'?{mode:'repeat_clear'}:{}),...(s.strike==='direct'?{no_cue:true}:{}),...(s.order?{order:true}:{}),...(s.noContact?{no_contact:true}:{}),...(s.flow==='E'&&s.cueTarget2==='stay'&&['zone','pocket_or_zone'].includes(s.cueTarget)?{zone_first_only:true}:{})};
    return {v:1,savedAt:Date.now(),data:d,coachSpec:toSpec(s),compatibility:{purpose:'table7-editor-exchange',notGameDeployment:true,warnings:['舊 Table7 可能把 both 袋口轉成子球，且不保留所有新規則；完整規則以 coachSpec 或完整關卡檔為準。','與舊 drill 的座標及載入規則需工程端確認後才可遊玩。']}};
  }
  function read(j){if(!j||typeof j!=='object')throw Error('不是有效關卡物件。');if(j.format==='poolgress.coach-level')return fromSpec(j);if(j.coachSpec?.format==='poolgress.coach-level')return fromSpec(j.coachSpec);return fromLegacy(j);}
  return {GRID,POCKETS,FLOWS,blank,copy,eraseDrawing,uid,star,frac,repeatable,ballName,ballColor,snapPoint,routeSegments,extendRoute,animationPlan,total,roundPlan,validate,describe,toSpec,fromSpec,fromLegacy,toLegacy,read,assertShape};
});
