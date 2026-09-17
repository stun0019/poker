'use strict';

// ===== HOLDEM ENGINE: pure rules, independently testable =====
const HAND_NAMES=['高牌','一對','兩對','三條','順子','同花','葫蘆','四條','同花順'];
function rankFive(cards){
 const ranks=cards.map(c=>c%13+2).sort((a,b)=>b-a),counts=new Map();
 ranks.forEach(r=>counts.set(r,(counts.get(r)||0)+1));
 const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
 const flush=cards.every(c=>Math.floor(c/13)===Math.floor(cards[0]/13));
 const unique=[...new Set(ranks)];if(unique[0]===14)unique.push(1);
 let straight=0;for(let i=0;i<=unique.length-5;i++)if(unique[i]-unique[i+4]===4){straight=unique[i];break}
 let v;
 if(flush&&straight)v=[8,straight];
 else if(groups[0][1]===4)v=[7,groups[0][0],groups[1][0]];
 else if(groups[0][1]===3&&groups[1][1]===2)v=[6,groups[0][0],groups[1][0]];
 else if(flush)v=[5,...ranks];
 else if(straight)v=[4,straight];
 else if(groups[0][1]===3)v=[3,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
 else if(groups[0][1]===2&&groups[1][1]===2)v=[2,Math.max(groups[0][0],groups[1][0]),Math.min(groups[0][0],groups[1][0]),groups[2][0]];
 else if(groups[0][1]===2)v=[1,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
 else v=[0,...ranks];
 while(v.length<6)v.push(0);
 return {score:v.reduce((n,r)=>n*15+r,0),category:v[0],name:HAND_NAMES[v[0]],cards:[...cards]};
}
function bestHand(cards){
 let best=null;
 for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
  const v=rankFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(!best||v.score>best.score)best=v;
 }return best;
}
function pokerRandom(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296}
class Holdem {
 constructor(names,sb=1,stacks=null,rng=pokerRandom){
  this.sb=sb;this.bb=sb*2;this.rng=rng;this.players=names.map((name,i)=>({name,stack:stacks?stacks[i]:sb*200,cards:[],folded:false,bet:0,total:0,label:''}));
  this.dealer=names.length-1;this.hand=0;this.state='ready';this.log=[];this.actor=-1;
 }
 get pot(){return this.players.reduce((n,p)=>n+p.total,0)}
 get alive(){return this.players.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0)}
 get able(){return this.alive.filter(i=>this.players[i].stack>0)}
 next(i,ids){for(let n=1;n<=this.players.length;n++){const j=(i+n)%this.players.length;if(ids.includes(j))return j}return -1}
 note(s){this.log.push(s);if(this.log.length>80)this.log.shift()}
 pay(i,n){const p=this.players[i],v=Math.max(0,Math.min(p.stack,Math.floor(n)));p.stack-=v;p.bet+=v;p.total+=v;return v}
 start(){
  if(this.state!=='ready'&&this.state!=='done')return false;
  const funded=this.players.map((p,i)=>p.stack>0?i:-1).filter(i=>i>=0);if(funded.length<2)return false;
  this.dealer=this.next(this.dealer,funded);this.hand++;this.board=[];this.deck=Array.from({length:52},(_,i)=>i);
  for(let i=51;i>0;i--){const j=Math.floor(this.rng()*(i+1));[this.deck[i],this.deck[j]]=[this.deck[j],this.deck[i]]}
  this.players.forEach(p=>{p.folded=p.stack===0;p.cards=[];p.bet=0;p.total=0;p.startStack=p.stack;p.label=p.folded?'離座':''});
  let deal=this.dealer;for(let c=0;c<funded.length*2;c++){deal=this.next(deal,funded);this.players[deal].cards.push(this.deck.pop())}
  this.small=funded.length===2?this.dealer:this.next(this.dealer,funded);this.big=this.next(this.small,funded);
  this.pay(this.small,this.sb);this.pay(this.big,this.bb);this.players[this.small].label='小盲';this.players[this.big].label='大盲';
  this.current=this.bb;this.lastRaise=this.bb;this.street=0;this.raiseCount=0;this.payouts=[];this.pots=[];this.showdown=false;
  this.actedAt=this.players.map(()=>null);this.pending=new Set(this.able);this.state='betting';this.actor=this.next(this.big,this.able);
  this.note('第 '+this.hand+' 手 · 盲注 '+this.sb+' / '+this.bb);this.advance(this.big);return true;
 }
 legal(i=this.actor){
  const p=this.players[i];if(this.state!=='betting'||i!==this.actor||!p||p.folded||p.stack===0)return null;
  const call=Math.min(p.stack,Math.max(0,this.current-p.bet)),max=p.bet+p.stack;
  const min=this.current+this.lastRaise;
  const reopened=this.actedAt[i]===null||this.actedAt[i]===0||this.current-this.actedAt[i]>=this.lastRaise;
  return {call,max,min,canRaise:reopened&&max>this.current&&this.able.some(j=>j!==i),canCheck:call===0};
 }
 act(i,type,to=0){
  const l=this.legal(i);if(!l)return false;const p=this.players[i];let label;
  if(type==='fold'){p.folded=true;label='棄牌'}
  else if(type==='call'){const paid=this.pay(i,l.call);label=paid?'跟注 '+paid:'過牌';if(!p.stack)label='ALL IN '+p.bet}
  else if(type==='raise'){
   if(!l.canRaise||!Number.isInteger(to)||to>l.max||to<=this.current||(to<l.min&&to!==l.max))return false;
   const increment=to-this.current;this.pay(i,to-p.bet);
   if(increment>=this.lastRaise){this.lastRaise=increment;this.pending=new Set(this.able.filter(j=>j!==i))}
   else this.able.forEach(j=>{if(j!==i&&this.players[j].bet<to)this.pending.add(j)});
   label=(p.stack?'加注至 ':'ALL IN ')+to;this.current=to;this.raiseCount++;
  }else return false;
  p.label=label;this.note(p.name+' · '+label);this.actedAt[i]=this.current;this.pending.delete(i);this.advance(i);return true;
 }
 advance(after){
  if(this.alive.length===1){this.finish(false);return}
  this.pending=new Set([...this.pending].filter(i=>!this.players[i].folded&&this.players[i].stack>0));
  if(this.able.length<=1){
   const lone=this.able[0];
   if(lone===undefined||this.players[lone].bet>=this.current){this.pending.clear()}
  }
  if(this.pending.size){this.actor=this.next(after,[...this.pending]);return}
  this.actor=-1;this.state='street';
 }
 nextStreet(){
  if(this.state!=='street')return false;
  if(this.street===3){this.finish(true);return true}
  this.deck.pop();const n=this.street===0?3:1;for(let i=0;i<n;i++)this.board.push(this.deck.pop());
  this.street++;this.current=0;this.lastRaise=this.bb;this.raiseCount=0;this.actedAt=this.players.map(()=>null);
  this.players.forEach(p=>{p.bet=0;if(!p.folded)p.label=p.stack?'':'ALL IN'});
  this.note(['','翻牌','轉牌','河牌'][this.street]);this.pending=new Set(this.able);this.state='betting';
  this.advance(this.dealer);return true;
 }
 finish(showdown){
  this.showdown=showdown;this.state='done';this.actor=-1;this.pending.clear();this.payouts=this.players.map(()=>0);this.pots=[];
  const alive=this.alive,rank=new Map(alive.map(i=>[i,showdown?bestHand([...this.players[i].cards,...this.board]):null]));
  if(!showdown){this.payouts[alive[0]]=this.pot;this.pots.push({amount:this.pot,winners:[alive[0]],refund:false})}
  else{
   const levels=[...new Set(this.players.map(p=>p.total).filter(n=>n>0))].sort((a,b)=>a-b);let prev=0;
   for(const level of levels){
    const contributors=this.players.map((p,i)=>p.total>=level?i:-1).filter(i=>i>=0);
    const amount=(level-prev)*contributors.length;prev=level;
    const eligible=contributors.filter(i=>!this.players[i].folded);
    if(contributors.length===1){const i=contributors[0];this.payouts[i]+=amount;this.pots.push({amount,winners:[i],refund:true});continue}
    if(!eligible.length)throw new Error('Invalid pot eligibility');
    const score=Math.max(...eligible.map(i=>rank.get(i).score));
    const winners=eligible.filter(i=>rank.get(i).score===score).sort((a,b)=>((a-this.dealer+this.players.length-1)%this.players.length)-((b-this.dealer+this.players.length-1)%this.players.length));
    const previous=this.pots.at(-1);
    if(previous&&!previous.refund&&previous.eligible?.join(',')===eligible.join(','))previous.amount+=amount;
    else this.pots.push({amount,winners,refund:false,eligible});
   }
  }
  if(showdown)this.pots.filter(p=>!p.refund).forEach(p=>{
   const share=Math.floor(p.amount/p.winners.length);let odd=p.amount%p.winners.length;
   p.winners.forEach(i=>this.payouts[i]+=share+(odd-->0?1:0));
  });
  this.players.forEach((p,i)=>{p.stack+=this.payouts[i];p.result=rank.get(i);if(!p.folded)p.label=showdown?p.result.name:'贏得底池'});
  this.winners=[...new Set(this.pots.filter(p=>!p.refund).flatMap(p=>p.winners))];
  this.note(this.winners.map(i=>this.players[i].name+' 收取 '+this.payouts[i]).join(' / '));
 }
}
// ===== END HOLDEM ENGINE =====

// ===== TABLE SESSION & CANVAS VIEW =====
let tableSession=null,tableTimer=0,tablePlate=null;
const TABLE_PREF_KEY='river-table-preferences-v2',HISTORY_KEY='river-hand-history-v2';
const tablePrefs={squeeze:false,fourColor:false,confirmAllin:false,turnSeconds:25};
let savedHands=[];
try{const v=JSON.parse(localStorage.getItem(TABLE_PREF_KEY)||'null');if(v){for(const k of ['squeeze','fourColor','confirmAllin'])if(typeof v[k]==='boolean')tablePrefs[k]=v[k];if([20,25,30].includes(v.turnSeconds))tablePrefs.turnSeconds=v.turnSeconds}
 const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(Array.isArray(h))savedHands=h.filter(v=>v&&typeof v.hand==='number'&&Array.isArray(v.board)&&Array.isArray(v.cards)&&Array.isArray(v.log)).slice(0,100);
}catch{}
function saveTablePrefs(){try{localStorage.setItem(TABLE_PREF_KEY,JSON.stringify(tablePrefs))}catch{}invalidate()}
function toggleSound(){user.sound=!user.sound;save();if(user.sound)sound('turn');invalidate()}
function tableAmount(n){return money(n)}

const SEATS=[[143,935],[105,704],[105,338],[360,187],[615,338],[615,704]];
const tableExtra=()=>Math.max(0,VIEW_H-H);
function seatPosition(i){const [x,y]=SEATS[i],spread=[1,.57,.24,.12,.24,.57][i];return [x,y+tableExtra()*spread]}
const SEAT_COLORS=['#d7bc80','#709d98','#839cbd','#ac899e','#8ea276','#bd9f78'];
const streetName=n=>['翻牌前','翻牌','轉牌','河牌'][n];
const money=n=>Math.floor(n).toLocaleString();
function enterTable(room={id:'PRACTICE',name:'Practice Table',blind:5,mode:0}){
 if(room.mode!==0)return;
 open('buyin',{room,buyBB:100,title:'入座練習桌'});
}

function beginTable(room,buyBB=100){
 clearTimeout(tableTimer);tableTimer=0;
 const bb=room.blind*2,amount=Math.round(bb*buyBB);
 if(!room.tournament&&balance(room.club)<amount){notify('Not enough chips');return}
 const returnRoute=routeSnapshot();
 if(!room.tournament)adjustBalance(room.club,-amount);
 const stacks=Array(6).fill(room.tournament?room.starting:bb*100);stacks[0]=amount;
 tableSession={game:new Holdem([user.name,'Mika','Oliver','Luna','Kai','Avery'],room.blind,stacks),room,
  fast:false,raiseTo:bb*2,history:[],dealtAt:0,revealAt:0,effects:[],returnClub:room.club,returnRoute,
  invested:amount,clockKey:'',clockLeft:0,clockTick:performance.now(),peek:[0,0],revealed:[true,true],preaction:false,
  tournament:room.tournament?room:null,tournamentStart:performance.now(),level:1};
 tablePrefs.turnSeconds=room.actionTime||25;tableSession.isolatedEscrow=true;
 if(!room.tournament){user.activeCash={club:room.club,stack:amount};save()}
 go('PLAY');S.toast='';startTableHand();
}

function startTableHand(){
 const t=tableSession;if(!t)return;clearTimeout(tableTimer);tableTimer=0;
 const g=t.game;if(g.players[0].stack===0){if(!t.tournament)open('topup',{buyBB:100});return}
 if(!t.tournament)g.players.forEach((p,i)=>{if(i&&p.stack===0)p.stack=g.bb*100});
 if(t.tournament){if(t.finished)return;const level=1+Math.floor((performance.now()-t.tournamentStart)/(t.tournament.levelMinutes*60000));t.level=level;g.sb=tournamentBlind(t.tournament,level);g.bb=g.sb*2}
 else if(user.settings.autoTop){const target=g.bb*(t.room.maxBB||200),limit=target*user.settings.autoTop/100,p=g.players[0],add=Math.min(balance(t.room.club),Math.max(0,target-p.stack));if(p.stack<limit&&add){adjustBalance(t.room.club,-add);p.stack+=add;t.invested+=add}}
 if(!g.start())return;
 if(!t.tournament){user.activeCash={club:t.room.club,stack:g.players[0].startStack};save()}
 t.dealtAt=performance.now();t.revealAt=0;t.effects=[];t.raiseTo=g.current+g.lastRaise;t.peek=[0,0];
 t.revealed=[!tablePrefs.squeeze,!tablePrefs.squeeze];t.handStats={vpip:false,pfr:false};t.clockKey='';t.clockLeft=0;t.bankUsed=false;t.preaction=false;t.dealSound=0;
 announce.textContent='第 '+g.hand+' 手，開始發牌';
 animate(reduced?50:1500);scheduleTable();
}

function scheduleTable(){
 clearTimeout(tableTimer);tableTimer=0;const t=tableSession;
 if(!t||S.page!=='PLAY'||S.modal||document.hidden)return;
 const g=t.game;if(g.state==='done'){invalidate();return}
 const dealWait=Math.max(0,t.dealtAt+(reduced?0:1300)-performance.now());
 if(g.state==='betting'&&g.actor===0){
  const key=g.hand+':'+g.street+':'+g.log.length;
  if(t.clockKey!==key){t.clockKey=key;t.clockLeft=tablePrefs.turnSeconds*1000;t.clockTotal=t.clockLeft;t.clockTick=performance.now();t.lastWarning=6;if(!dealWait)sound('turn')}
  if(t.preaction&&!dealWait){t.preaction=false;heroAction(g.legal(0).canCheck?'call':'fold');return}
  if(dealWait)tableTimer=setTimeout(()=>{tableTimer=0;sound('turn');scheduleTable()},dealWait+5);
  invalidate();return;
 }
 const delay=dealWait+(t.fast?320:g.state==='street'?1050:900+Math.random()*600);
 t.botStart=performance.now();t.botDue=t.botStart+delay;
 tableTimer=setTimeout(()=>{
  tableTimer=0;if(t!==tableSession||S.modal||document.hidden||S.page!=='PLAY')return;
  if(g.state==='street'){const before=g.board.length;g.nextStreet();if(g.board.length>before){t.revealAt=performance.now();t.oldBoard=before;sound('deal');if(g.board.length-before>1)sound('deal',.11)}}
  else if(g.actor>0){const a=chooseBotAction(g,g.actor);performTableAction(a.type,a.to)}
  afterTableChange();scheduleTable();
 },delay);
}
/* One clock, monotonic elapsed time. Modals/background freeze rather than consume time. */
setInterval(()=>{
 const t=tableSession;if(!t)return;const now=performance.now(),dt=Math.min(250,Math.max(0,now-t.clockTick));t.clockTick=now;
 if(S.page!=='PLAY'||S.modal||document.hidden)return;
 const g=t.game,elapsed=now-t.dealtAt;
 if(elapsed<1400&&!reduced){const k=Math.min(12,Math.floor(elapsed/100));if(k>t.dealSound){t.dealSound=k;sound('deal')}}
 if(g.state==='betting'&&g.actor===0&&elapsed>=(reduced?0:1300)&&t.clockLeft>0){
  t.clockLeft=Math.max(0,t.clockLeft-dt);const sec=Math.ceil(t.clockLeft/1000);
  if(sec<=5&&sec>0&&sec<t.lastWarning){t.lastWarning=sec;sound('warning')}
  if(t.clockLeft===0){heroAction(g.legal(0)?.canCheck?'call':'fold');notify('行動逾時：已自動過牌／棄牌')}
  invalidate();
 }else if(g.state==='betting')invalidate();
},100);

function chooseBotAction(g,i){
 const p=g.players[i],l=g.legal(i);if(!l)return {type:'call'};
 const ranks=p.cards.map(c=>c%13+2);let strength;
 if(g.board.length){const h=bestHand([...p.cards,...g.board]);strength=[.17,.45,.65,.78,.87,.9,.96,.99,1][h.category]}
 else strength=.14+(Math.max(...ranks)-2)/30+(Math.min(...ranks)-2)/70+(ranks[0]===ranks[1]?.29:0)+(Math.floor(p.cards[0]/13)===Math.floor(p.cards[1]/13)?.07:0);
 const r=g.rng(),pressure=l.call/Math.max(1,g.pot+l.call);
 if(l.call&&r>Math.min(.96,.38+strength*.7-pressure*.55)&&l.call>g.bb)return {type:'fold'};
 if(l.canRaise&&g.raiseCount<3&&r<(strength>.68?.24:.065)){
  const target=Math.min(l.max,Math.max(l.min,g.current+Math.max(g.bb,Math.round(g.pot*.5/g.sb)*g.sb)));
  if(target>=l.min||target===l.max)return {type:'raise',to:target};
 }
 return {type:'call'};
}
function performTableAction(type,to){
 const t=tableSession,g=t.game,i=g.actor,before=g.players[i]?.stack||0;
 if(!g.act(i,type,to))return false;
 const paid=before-g.players[i].stack;
 if(i===0&&g.street===0&&t.handStats){if(paid>0)t.handStats.vpip=true;if(type==='raise')t.handStats.pfr=true}
 if(paid>0)t.effects.push({at:performance.now(),from:seatPosition(i),amount:paid});
 sound(type==='fold'?'fold':paid===0?'check':g.players[i].stack===0?'allin':'chips');
 return true;
}

function afterTableChange(){
 const t=tableSession,g=t.game;t.raiseTo=g.current+g.lastRaise;
 if(g.state==='done'&&t.lastRecorded!==g.hand){
  t.lastRecorded=g.hand;t.settledAt=performance.now();t.revealed=[true,true];t.peek=[1,1];
  const record={hand:g.hand,at:Date.now(),club:t.room.club,room:t.room.name,sb:g.sb,bb:g.bb,net:g.players[0].stack-g.players[0].startStack,
   result:g.winners.map(i=>g.players[i].name).join(' / '),pot:g.pot,board:g.board.slice(),cards:g.players[0].cards.slice(),
   players:g.players.map((p,i)=>({name:p.name,cards:g.showdown&&!p.folded||i===0?p.cards.slice():[],folded:p.folded,net:p.stack-p.startStack,label:p.result?.name||p.label})),
   pots:g.pots.map(p=>({amount:p.amount,refund:!!p.refund})),log:g.log.slice(g.log.findLastIndex(s=>s.startsWith('第 ')))};
  t.history.unshift(record);t.history=t.history.slice(0,30);savedHands.unshift(record);savedHands=savedHands.slice(0,100);
  if(!t.tournament){user.activeCash={club:t.room.club,stack:g.players[0].stack}}
  const st=clubStats(t.room.club);st.hands++;st.wins+=g.winners.includes(0)?1:0;st.vpip+=t.handStats?.vpip?1:0;st.pfr+=t.handStats?.pfr?1:0;st.net+=record.net;
  if(g.showdown&&!g.players[0].folded){st.showdowns++;if(g.winners.includes(0))st.showWins++}user.stats[t.room.club]=st;save();
  if(t.tournament&&(g.players[0].stack===0||g.players.filter(p=>p.stack>0).length===1)){
   t.finished=true;t.rank=g.players[0].stack>0?1:g.players.filter(p=>p.stack>0).length+1;
   const prize=Math.floor(t.tournament.prize*([.6,.3,.1][t.rank-1]||0));t.prize=prize;
   const reg=user.registrations[t.tournament.id];if(reg){reg.state='finished';reg.rank=t.rank;reg.prize=prize}
   if(prize)adjustBalance(t.room.club,prize);save();
  }
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify(savedHands))}catch{}
  if(g.winners.includes(0))sound('win');else sound('chips');
  announce.textContent=g.log.at(-1);
 }else if(g.actor===0)announce.textContent='輪到你，'+(g.legal().call?'需要跟注 '+g.legal().call:'可以過牌');
 animate(1100);
}

function heroAction(type,to){
 const t=tableSession;if(!t||t.game.actor!==0||performance.now()<t.dealtAt+(reduced?0:1300))return;
 if(performTableAction(type,to)){afterTableChange();scheduleTable()}
}

function leaveTable(){
 clearTimeout(tableTimer);tableTimer=0;const t=tableSession;if(!t)return;
 if(!t.tournament){adjustBalance(t.room.club,t.game.players[0].stack);delete user.activeCash;save()}
 else if(!t.finished){const r=user.registrations[t.tournament.id];if(r){r.state='finished';r.rank=null;save()}}
 tableSession=null;S.club=t.returnClub;S.routes=[{page:'HOME',club:null,scroll:0,data:{},tab:'ALL',detailTab:0}];go('CLUB',{},true);S.tab=t.tournament?'MTT':'NLH';
}
function tableBack(){open('tableMenu')}

function requestHeroAction(type,to){
 const t=tableSession,l=t?.game.legal(0);if(!l)return;
 if(tablePrefs.confirmAllin&&((type==='raise'&&to===l.max)||(type==='call'&&l.call===t.game.players[0].stack&&l.call>0))){
  open('confirmAllin',{title:'確認 ALL IN',action:type,to});return;
 }
 heroAction(type,to);
}
function revealHole(i){const t=tableSession;if(!t)return;t.revealed[i]=true;t.peek[i]=1;sound('peel');invalidate()}
function openSqueeze(){
 const t=tableSession;if(!t||t.game.players[0].folded||performance.now()-t.dealtAt<(reduced?0:1300))return;
 open('squeeze',{title:'咪牌'});sound('peel');
}

function oval(x,y,rx,ry,fill,stroke,width=1){
 ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);
 if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
}

function tableSurface(){
 rect(0,0,W,VIEW_H,'#101318');
 const top=226,bottom=VIEW_H-178,depth=bottom-top;
 // Perspective rail: arched far edge, broad near edge. UI remains unscaled.
 const outline=()=>{
  ctx.beginPath();ctx.moveTo(360,top);
  ctx.bezierCurveTo(520,top,611,top+76,637,top+204);
  ctx.bezierCurveTo(669,top+depth*.55,748,bottom-220,720,bottom-144);
  ctx.bezierCurveTo(679,bottom-43,509,bottom,360,bottom);
  ctx.bezierCurveTo(211,bottom,41,bottom-43,0,bottom-144);
  ctx.bezierCurveTo(-28,bottom-220,51,top+depth*.55,83,top+204);
  ctx.bezierCurveTo(109,top+76,200,top,360,top);ctx.closePath();
 };
 ctx.save();outline();ctx.shadowColor='#000b';ctx.shadowBlur=22;ctx.shadowOffsetY=10;
 ctx.fillStyle='#17232c';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.strokeStyle='#080c10';ctx.lineWidth=25;ctx.stroke();
 ctx.strokeStyle='#303a42';ctx.lineWidth=15;ctx.stroke();
 ctx.strokeStyle='#1b252d';ctx.lineWidth=11;ctx.stroke();
 const felt=ctx.createLinearGradient(0,top,0,bottom);felt.addColorStop(0,'#203e53');felt.addColorStop(.48,'#254d65');felt.addColorStop(1,'#193448');
 ctx.fillStyle=felt;ctx.fill();ctx.strokeStyle='#66809355';ctx.lineWidth=1;ctx.stroke();
 ctx.restore();
 const brandY=580+tableExtra()*.39;text('ClubGG',360,brandY,48,'#b9d3e345','center',750);rect(320,brandY+20,80,34,'#b9d3e326',9);text('NLH',360,brandY+37,24,'#b9d3e36b','center',700);
}

function liveCard(card,x,y,w=78,h=108,hidden=false,highlight=false,angle=0){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);
 ctx.shadowColor='#0007';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
 rect(-w/2,-h/2,w,h,hidden?'#191e25':'#ffffff',5);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 border(-w/2,-h/2,w,h,highlight?'#e6c370':hidden?'#8c939a':'#bbbdb7',5,highlight?3:1);
 if(hidden){
  rect(-w/2+3,-h/2+3,w-6,h-6,linear(0,-h/2,0,h,'#ac3534','#532024'),3);
  ctx.save();path(-w/2+5,-h/2+5,w-10,h-10,2);ctx.clip();
  for(let q=-h;q<h;q+=8){line(-w/2,q,w/2,q+w,'#f0ce9c27');line(w/2,q,-w/2,q+w,'#f0ce9c27')}ctx.restore();
  border(-w*.28,-h*.24,w*.56,h*.48,'#d2b69880',2);text('GG',0,1,w*.27,'#eed9b8','center',800);ctx.restore();return;
 }
 const rank=card%13+2,suit=Math.floor(card/13),color=tablePrefs.fourColor?['#202630','#d6313e','#246dc1','#16804c'][suit]:suit===1||suit===2?'#cf292c':'#171a1e';
 const label=rank>10?['J','Q','K','A'][rank-11]:String(rank);
 if(w>=150){largeCardFace(rank,suit,w,h,label,color);ctx.restore();return}
 text(label,-w/2+w*.11,-h/2+h*.22,w*.42,color,'left',750,w*.76);
 const sym=['spade','heart','diamond','club'][suit];
 glyph(sym,0,h*.18,w*.4,color);
 ctx.restore();
}
function largeCardFace(rank,suit,w,h,label,color){
 const sym=['spade','heart','diamond','club'][suit],cw=w*.135;
 for(let k=0;k<2;k++){
  ctx.save();if(k)ctx.rotate(Math.PI);
  text(label,-w*.355,-h*.38,cw*1.28,color,'center',750);
  glyph(sym,-w*.355,-h*.25,cw*.79,color);ctx.restore();
 }
 const pip=(x,y,size=w*.145,reverse=false)=>{
  ctx.save();ctx.translate(x*w,y*h);if(reverse)ctx.rotate(Math.PI);glyph(sym,0,0,size,color);ctx.restore();
 };
 if(rank===14){pip(0,0,w*.35);text('ClubGG',0,h*.26,w*.07,'#9c9281','center',600);return}
 if(rank>=11){
  const a=w*.225,b=h*.29;
  border(-a,-b,a*2,b*2,color+'66',4);
  ctx.save();ctx.beginPath();ctx.moveTo(0,-b*.89);ctx.lineTo(a*.88,0);ctx.lineTo(0,b*.89);ctx.lineTo(-a*.88,0);ctx.closePath();ctx.fillStyle=color+'12';ctx.fill();ctx.strokeStyle=color+'77';ctx.stroke();ctx.restore();
  for(let k=0;k<2;k++){ctx.save();if(k)ctx.rotate(Math.PI);text(label,0,-h*.072,w*.32,color,'center',700);glyph(sym,0,-h*.215,w*.09,color);ctx.restore()}
  line(-a*.68,0,a*.68,0,color+'55');return;
 }
 const points={
  2:[[0,-.25],[0,.25]],3:[[0,-.26],[0,0],[0,.26]],
  4:[[-.17,-.25],[.17,-.25],[-.17,.25],[.17,.25]],
  5:[[-.17,-.25],[.17,-.25],[0,0],[-.17,.25],[.17,.25]],
  6:[[-.17,-.26],[.17,-.26],[-.17,0],[.17,0],[-.17,.26],[.17,.26]],
  7:[[-.17,-.26],[.17,-.26],[0,-.13],[-.17,0],[.17,0],[-.17,.26],[.17,.26]],
  8:[[-.17,-.26],[.17,-.26],[0,-.13],[-.17,0],[.17,0],[0,.13],[-.17,.26],[.17,.26]],
  9:[[-.17,-.3],[.17,-.3],[-.17,-.1],[.17,-.1],[0,0],[-.17,.1],[.17,.1],[-.17,.3],[.17,.3]],
  10:[[-.17,-.3],[.17,-.3],[0,-.2],[-.17,-.1],[.17,-.1],[-.17,.1],[.17,.1],[0,.2],[-.17,.3],[.17,.3]]
 };
 (points[rank]||[]).forEach(([x,y])=>pip(x,y,w*.13,y>0));
}
function moneyChips(x,y,amount,color='#64a99d',scale=1){
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 const count=Math.min(5,Math.max(1,Math.ceil(Math.log2(Math.max(2,amount))/2)));
 for(let k=0;k<count;k++){
  const yy=-k*4;oval(0,yy+3,15,6,'#15292a','#09191c');oval(0,yy,15,6,color,'#b8d0bd');
  for(let j=0;j<6;j++){const a=j*TAU/6;line(Math.cos(a)*10,yy+Math.sin(a)*4,Math.cos(a)*14,yy+Math.sin(a)*5,'#f0ecd3',2)}
  oval(0,yy,8,3,null,'#284b46');
 }ctx.restore();
}
function seatView(p,i){
 const t=tableSession,g=t.game,[x,y]=seatPosition(i),hero=i===0,active=g.actor===i&&g.state==='betting',win=g.state==='done'&&g.winners.includes(i);
 const ready=reduced||performance.now()-t.dealtAt>1100,show=g.showdown&&!p.folded;
 const width=hero?210:150,bx=x-width/2,by=hero?968+tableExtra():y+20;
 ctx.save();if(p.folded&&!hero)ctx.globalAlpha=.43;
 if(ready&&p.cards.length){
  if(hero)p.cards.forEach((c,j)=>liveCard(c,x+(j-.5)*82,901+tableExtra(),84,116,!t.revealed[j],win&&(p.result?.cards.includes(c)??true),(j-.5)*.055));
  else p.cards.forEach((c,j)=>liveCard(c,x+(j-.5)*38,y-21,44,61,!show,win&&p.result?.cards.includes(c),(j-.5)*.09));
 }
 ctx.save();if(active||win){ctx.shadowColor=win?'#e9b84b':'#e4d07b';ctx.shadowBlur=active?15:20}
 rect(bx,by,width,hero?60:52,'#0c1117e8',7);ctx.restore();
 border(bx,by,width,hero?60:52,active?'#e4c76e':win?'#d8b65a':'#65777b',7,active||win?2:1);
 rect(bx+1,by+1,width-2,23,'#242d34',5);
 text(p.name+(hero?' · 你':''),x,by+13,hero?18:15,'#f1f3ef','center',650,width-13);
 text(user.settings.bb?(p.stack/g.bb).toFixed(1)+' BB':money(p.stack),x,by+(hero?43:39),hero?25:20,win?'#f2d276':'#8ddac1','center',750,width-13);
 if(active){
  const f=hero?Math.max(0,t.clockLeft/Math.max(1,t.clockTotal)):Math.max(0,(t.botDue-performance.now())/Math.max(1,t.botDue-t.botStart));
  rect(bx+8,by+(hero?56:49),width-16,3,'#343d36',2);
  rect(bx+8,by+(hero?56:49),(width-16)*f,3,hero&&t.clockLeft<6000?'#f0715f':'#d8b45e',2);
 }
 if(!hero&&p.label){
  const isRaise=p.label.startsWith('加注')||p.label.startsWith('ALL');
  const c=win?'#caa24e':isRaise?'#b43a39':p.folded?'#353c3c':'#255b4c';
  rect(x-64,y+77,128,24,c,4);text(p.label,x,y+89,13,win?'#18180f':'#e1e7df','center',600,120);
 }
 if(hero&&p.folded){rect(x-80,882+tableExtra(),160,41,'#171d1def',5);text('已棄牌',x,903+tableExtra(),23,'#b8c5c0','center',650)}
 if(win){
  ctx.save();ctx.shadowColor='#f1b95366';ctx.shadowBlur=12;
  text('WIN',x,hero?831+tableExtra():y-60,hero?32:27,'#f7d17c','center',850);ctx.restore();
 }
 if(g.dealer===i){
  const dx=hero?x+137:x+(i===4||i===5?-99:99),dy=by+40;
  circle(dx,dy,12,'#eed692','#806840');text('D',dx,dy+1,14,'#22201a','center',800);
 }
 if(p.bet>0&&g.state!=='done'){
  const bx=hero?360:i===3?360:i<3?233:487,by=(hero?797:i===3?327:i===2||i===4?438:718)+tableExtra()*[.83,.58,.27,.17,.27,.58][i];
  moneyChips(bx-23,by,p.bet,i%2?'#74bb94':'#cb7b61',.95);
  text(money(p.bet),bx+1,by-5,18,'#eef1d9','left',650);
 }
 ctx.restore();
}
function setRaise(v){const t=tableSession,l=t.game.legal(0);if(!l||!l.canRaise)return;t.raiseTo=Math.max(Math.min(l.min,l.max),Math.min(l.max,Math.round(v)));invalidate()}


function drawActions(){
 const t=tableSession,g=t.game,p=g.players[0],extra=tableExtra();
 rect(0,1080+extra,720,200,linear(0,1080+extra,0,200,'#101821ef','#080c10'));
 line(0,1080+extra,720,1080+extra,'#9bb7bb24');
 if(g.state==='done'){
  if(t.finished){text('Tournament Finished',360,1104+extra,28,'#eee','center',600);text('Rank '+t.rank+' · Prize '+money(t.prize),360,1149+extra,24,'#eed394','center');button('tournament-finish','BACK TO CLUB',28,1190+extra,664,67,leaveTable,{primary:true});return}
  const net=p.stack-p.startStack;text('Result '+(net>=0?'+':'')+money(net),28,1111+extra,30,net>=0?'#daca76':'#ddaba4','left',650);
  if(!t.tournament)button('topup-table','TOP UP',526,1087+extra,166,51,()=>open('topup',{buyBB:t.room.maxBB||200}),{disabled:p.stack>=g.bb*(t.room.maxBB||200)});
  button('next-hand',p.stack?'NEXT HAND':'TOP UP',28,1190+extra,664,71,startTableHand,{primary:true});return;
 }
 const l=g.legal(0),ready=elapsedReady(t);
 if(!l||!ready){
  text(!ready?'Dealing…':p.folded?'Folded':g.state==='street'?'Dealing board':(g.players[g.actor]?.name||'Player')+' is thinking',360,1129+extra,22,'#aebac4','center');
  button('table-menu-bottom','MENU',28,1190+extra,219,70,()=>open('tableMenu'));
  button('preaction',t.preaction?'Check / Fold · ON':'Check / Fold',265,1190+extra,427,70,()=>{t.preaction=!t.preaction;invalidate()},{primary:t.preaction,disabled:p.folded||!p.stack||!ready});return;
 }
 const min=Math.min(l.min,l.max);t.raiseTo=Math.max(min,Math.min(l.max,t.raiseTo));
 const percentages=user.settings.bet||[.33,.5,.75,1];
 percentages.toReversed().forEach((pct,i)=>{
  const amount=Math.min(l.max,Math.max(min,g.current+Math.max(g.lastRaise,Math.floor((g.pot+l.call)*pct))));
  const x=506,y=941+extra+i*80,id='raise-preset-'+i;
  rect(x,y,187,74,'#232529',5);border(x,y,187,74,'#515358',5);
  text(pct===1?'Pot':Math.round(pct*100)+'%',x+14,y+17,15,'#b5b6b9','left',600);
  text('Raise to',x+172,y+17,14,'#b5b6b9','right');
  text(money(amount),x+93,y+49,27,l.canRaise?'#f0d277':'#696b70','center',700);
  hit(id,'Raise to '+amount+' ('+Math.round(pct*100)+'%)',x,y,187,74,()=>requestHeroAction('raise',amount),!l.canRaise);
 });
 button('bet-keypad','',273,1107+extra,89,65,()=>open('betKeypad',{value:String(t.raiseTo)}),{icon:'menu',disabled:!l.canRaise});
 button('bet-hold','',378,1107+extra,89,65,()=>requestHeroAction('raise',min),{icon:'plus',disabled:!l.canRaise});
 button('act-fold','Fold',28,1192+extra,214,69,()=>heroAction('fold'));
 button('act-call',l.call?'Call '+money(l.call):'Check',257,1192+extra,227,69,()=>requestHeroAction('call'));
 if(pointer?.betHold){
  const v=t.raiseTo,x=340,y=652+extra*.65;rect(x,y,140,432,'#171a20f5',10);border(x,y,140,432,'#6c7278',10);
  rect(x+66,y+70,8,309,'#45494d',4);const f=l.max===min?0:(v-min)/(l.max-min);rect(x+66,y+70+(1-f)*309,8,f*309,'#c6a755',4);circle(x+70,y+70+(1-f)*309,15,'#e4c879');
  text(pointer.betCancelled?'Cancel':money(v),x+70,y+34,23,'#eed48c','center',700);
 }
}

function tablePage(){
 const t=tableSession;if(!t)return;const g=t.game,extra=tableExtra(),mid=extra*.39;tableSurface();
 rect(0,0,W,92,linear(0,0,0,92,'#0c1011f5','#111617ce'));line(0,91,W,91,'#424a4355');
 button('exit-table','',24,24,51,49,tableBack,{icon:'back'});hit('exit-table-touch','返回',16,10,68,80,tableBack);
 text(t.room.name,93,40,23,P.light,'left',650,340);small('NLH  ·  '+g.sb+' / '+g.bb+'  ·  6 MAX',94,69);
 button('table-audio',user.sound?'音效開':'音效關',460,26,78,48,toggleSound);
 button('table-history','紀錄',548,26,70,48,()=>open('tableHistory'));
 button('table-settings','',633,26,63,48,()=>open('tableMenu'),{icon:'menu'});
 small('HAND #'+String(g.hand).padStart(3,'0'),30,116,'#8b9f9f');small(t.tournament?'LEVEL '+t.level:'CLUB '+t.room.club,690,116,'#8b9f9f','right');
 const potY=495+mid;rect(289,potY-28,142,57,'#0a202eab',27);
 small(g.state==='done'?'本手底池':'Total Pot',360,potY-13,'#b7c9d1','center');
 text(money(g.pot),360,potY+12,26,'#ecd380','center',750);
 const best=g.board.length>=3?bestHand([...g.players[0].cards,...g.board]):null;
 for(let i=0;i<5;i++){
  const x=188+i*86,y=688+mid;
  if(i<g.board.length){
   const progress=reduced?1:Math.min(1,(performance.now()-t.revealAt-(i-(t.oldBoard||0))*90)/300);
   const fresh=t.revealAt&&i>=(t.oldBoard||0)&&progress<1;
   ctx.save();if(fresh){ctx.translate(x,y);ctx.scale(Math.max(.04,Math.abs(progress*2-1)),1);liveCard(g.board[i],0,0,80,112,progress<.5);ctx.restore()}
   else {ctx.restore();liveCard(g.board[i],x,y,80,112,false,g.state==='done'&&g.winners.includes(0)&&best?.cards.includes(g.board[i]))}
  }
 }
 if(g.board.length)text(g.state==='done'?'本手結束':streetName(g.street),360,762+mid,17,'#a9c8b8','center',650);
 if(g.state==='done'){
  const names=g.winners.map(i=>g.players[i].name).join(' / ');
  rect(225,782+mid,290,64,'#102734eb',6);line(242,783+mid,498,783+mid,'#d1b77480');
  text(names,370,803+mid,21,'#f4d890','center',700,270);
  text(g.showdown?g.players[g.winners[0]].result.name:'其他玩家棄牌',370,831+mid,17,'#c1d9c5','center');
 }else if(best&&!g.players[0].folded&&t.revealed.every(Boolean))small('你的牌型 · '+best.name,360,790+extra*.68,'#b5d4bf','center');
 g.players.forEach(seatView);
 if(elapsedReady(t)&&!g.players[0].folded&&g.state!=='done'){
  hit('peek-hole','咪牌查看手牌',48,839+extra,190,122,openSqueeze);
  if(!t.revealed.every(Boolean)){
   rect(66,910+extra,158,35,'#081416dc',5);text('Squeeze',145,928+extra,18,'#eddbac','center',650);
   button('show-hole','SHOW',294,929+extra,130,45,()=>{revealHole(0);revealHole(1)});
  }
 }
 if(g.actor===0&&g.state==='betting'&&elapsedReady(t)){
  const sec=Math.ceil(t.clockLeft/1000);text(String(sec).padStart(2,'0'),304,991+extra,27,sec<=5?'#f48470':'#e3c881','center',750);
  button('time-bank',t.bankUsed?'Used':'+15s',344,983+extra,96,43,()=>{t.bankUsed=true;t.clockLeft+=15000;t.clockTotal+=15000;sound('turn')},{disabled:t.bankUsed});
 }
 if(!g.board.length&&!g.showdown&&g.state!=='done'){small('盲注 '+g.sb+' / '+g.bb+'   ·   6 MAX',360,708+mid,'#c2d7b760','center')}
 const elapsed=performance.now()-t.dealtAt;
 if(!reduced&&elapsed<1250){
  for(let k=0;k<12;k++){const a=(elapsed-k*65)/290;if(a<0||a>1)continue;const [sx,sy]=seatPosition((g.dealer+1+k%6)%6),q=1-(1-a)**3;liveCard(0,360+(sx-360)*q,370+(sy-65-370)*q,26,36,true,false,(1-q)*.3)}
 }
 t.effects=t.effects.filter(e=>performance.now()-e.at<650);t.effects.forEach(e=>{const f=Math.min(1,(performance.now()-e.at)/650),q=1-(1-f)**3;ctx.save();ctx.globalAlpha=1-f*.6;moneyChips(e.from[0]+(360-e.from[0])*q,e.from[1]+(482+mid-e.from[1])*q,e.amount,'#d0b775',.9);ctx.restore()});
 if(!reduced&&g.state==='done'&&performance.now()-t.settledAt<1000){
  const q=Math.min(1,(performance.now()-t.settledAt)/1000);
  g.winners.forEach(i=>{const [x,y]=seatPosition(i);moneyChips(360+(x-360)*q,482+mid+(y-482-mid)*q,g.payouts[i],'#dac185',1)});invalidate();
 }
 drawActions();
 if(!reduced&&(elapsed<1500||performance.now()-t.revealAt<650||t.effects.length))invalidate();
}

function elapsedReady(t){return performance.now()-t.dealtAt>=(reduced?0:1300)}
function squeezeModal(){
 const t=tableSession;if(!t){back();return}
 rect(0,0,720,VIEW_H,'#03090ceb');
 const z=ctx.createRadialGradient(360,615,30,360,615,470);z.addColorStop(0,'#214f41');z.addColorStop(1,'#071211');rect(24,242,672,789,z,24);border(24,242,672,789,'#66877a77',24);
 small('PRIVATE CARDS',360,287,'#94b4a6','center');
 text('慢慢掀開，看看你的底牌',360,333,29,'#f3e7cf','center',650);
 small('按住牌面下緣向上拖曳 · 鬆手回彈',360,376,'#b3c5b8','center');
 t.game.players[0].cards.forEach((card,i)=>{
  const x=206+i*308,y=608,w=228,h=320,p=t.revealed[i]?1:t.peek[i];
  ctx.save();ctx.shadowColor='#000b';ctx.shadowBlur=28;ctx.shadowOffsetY=18;rect(x-w/2,y-h/2,w,h,'#eee',11);ctx.restore();
  liveCard(card,x,y,w,h);
  // Mirrored corner indices emerge before the center pips.
  if(p<.995){
   const edge=y+h/2-p*h,curl=Math.sin(Math.min(1,p)*Math.PI)*44;
   ctx.save();ctx.beginPath();ctx.rect(x-w/2-2,y-h/2-2,w+4,Math.max(0,edge-(y-h/2)+2));ctx.clip();liveCard(card,x,y,w,h,true);ctx.restore();
   if(p>.01){
    rect(x-w/2,edge,w,24,linear(0,edge,0,24,'#00000055','#00000000'));
    ctx.beginPath();ctx.moveTo(x-w/2,edge);ctx.bezierCurveTo(x-w*.22,edge-curl*1.15,x+w*.2,edge-curl*.95,x+w/2,edge-4);ctx.lineTo(x+w/2,edge-curl-8);ctx.quadraticCurveTo(x,edge-curl-22,x-w/2,edge-curl);ctx.closePath();
    ctx.fillStyle=linear(0,edge-curl-16,0,curl+20,'#f4f0e3','#a4a298');ctx.fill();line(x-w/2,edge,x+w/2,edge,'#fefce79c',1);
   }
  }
  if(p===0){line(x-34,y+h/2-19,x+34,y+h/2-19,'#f2d899',4);text('向上掀牌',x,810,19,'#d9cba9','center',650)}
  else text(t.revealed[i]?'已翻開':Math.round(p*100)+'%',x,810,19,'#d9cba9','center',650);
  hit('squeeze-card-'+i,'拖曳掀開第 '+(i+1)+' 張牌',x-w/2-12,y-h/2-10,w+24,h+25,()=>{});
 });
 button('squeeze-reveal','全部翻開',73,864,277,65,()=>{revealHole(0);revealHole(1)},{primary:true,disabled:t.revealed.every(Boolean)});
 button('squeeze-done','返回牌桌',370,864,277,65,back);
 small('行動倒數已暫停 · 本機練習',360,977,'#8da599','center');
 button('squeeze-close','',640,164,52,52,back,{icon:'close'});
}
function tableModal(m,x,y,w,h){
 if(m.type==='buyin'||m.type==='topup'){
  const topup=m.type==='topup',t=tableSession,room=topup?t.room:m.room,bb=room.blind*2;
  text(room.name,x+30,y+134,27,P.light,'left',650,w-60);
  small('NO LIMIT HOLD’EM  ·  '+room.blind+' / '+bb+'  ·  6 MAX',x+30,y+176);
  text(m.buyBB+' BB',360,y+245,49,'#f2d58c','center',750);
  small((topup?'補至 ':'買入 ')+money(m.buyBB*bb)+' 練習籌碼',360,y+292,'#c4d3c8','center');
  [40,60,100,200].forEach((n,i)=>button('buyin-'+n,n+' BB',x+30+i*147,y+329,135,54,()=>{m.buyBB=n;invalidate()},{primary:m.buyBB===n,disabled:topup&&t.game.players[0].stack>=n*bb}));
  button('buyin-sound',user.sound?'音效：開啟':'音效：關閉',x+30,y+414,277,53,toggleSound);
  button('buyin-squeeze',tablePrefs.squeeze?'咪牌：開啟':'咪牌：關閉',x+323,y+414,291,53,()=>{tablePrefs.squeeze=!tablePrefs.squeeze;saveTablePrefs()});
  small('單機 AI 練習 · 無現金 · 不扣大廳點數',360,y+518,'#99aca3','center');
  button('buyin-confirm',topup?'補碼並返回':'坐下並開始',x+30,y+h-105,w-60,72,()=>{
   if(topup){const p=t.game.players[0],add=Math.max(0,m.buyBB*bb-p.stack);p.stack+=add;t.invested+=add;sound('chips');back()}
   else beginTable(room,m.buyBB);
  },{primary:true,disabled:topup&&t.game.players[0].stack>=m.buyBB*bb});return;
 }
 if(m.type==='tableSettings'){
  const rows=[
   ['音效',user.sound?'開啟':'關閉',toggleSound],
   ['底牌咪牌',tablePrefs.squeeze?'拖曳掀牌':'直接亮牌',()=>{tablePrefs.squeeze=!tablePrefs.squeeze;saveTablePrefs()}],
   ['四色撲克牌',tablePrefs.fourColor?'四色':'紅黑雙色',()=>{tablePrefs.fourColor=!tablePrefs.fourColor;saveTablePrefs()}],
   ['ALL IN 確認',tablePrefs.confirmAllin?'開啟':'關閉',()=>{tablePrefs.confirmAllin=!tablePrefs.confirmAllin;saveTablePrefs()}],
   ['行動時間',tablePrefs.turnSeconds+' 秒',()=>{tablePrefs.turnSeconds=tablePrefs.turnSeconds===30?20:tablePrefs.turnSeconds+5;saveTablePrefs()}]
  ];
  rows.forEach(([label,value,fn],i)=>{const yy=y+125+i*78;text(label,x+30,yy+25,23,P.light);button('table-pref-'+i,value,x+w-205,yy,175,53,fn);line(x+30,yy+67,x+w-30,yy+67,'#65766c35')});
  small('咪牌於下一手；秒數於下次行動套用。',x+30,y+549);
  button('settings-done','完成',x+30,y+h-95,w-60,62,back,{primary:true});return;
 }
 if(m.type==='confirmAllin'){
  const t=tableSession,g=t.game,p=g.players[0];
  text('將投入全部剩餘籌碼',360,y+160,27,P.light,'center',650);
  text(money(p.stack),360,y+236,51,'#f0cd86','center',750);
  small('ALL IN  /  '+(p.stack/g.bb).toFixed(1)+' BB',360,y+293,'#b8c6be','center');
  wrap('確認後無法收回本次行動。其他玩家仍會依序決定跟注或棄牌。',x+30,y+360,w-60,22,P.muted);
  button('allin-confirm','確認 ALL IN',x+30,y+490,w-60,70,()=>{const a=m.action,n=m.to;back();heroAction(a,n)},{primary:true});
  button('allin-cancel','返回調整',x+30,y+578,w-60,61,back);return;
 }
 if(m.type==='exitTable'){
  const t=tableSession,net=t.game.players[0].stack-t.invested;
  text('結束這次練習？',x+30,y+146,29,P.light,'left',650);
  wrap('桌上籌碼不影響大廳點數。已完成的最近 30 手會保留在這台裝置。',x+30,y+207,w-60,22,P.muted);
  text('目前桌上 '+money(t.game.players[0].stack),x+30,y+338,25,P.light);
  small(t.game.state==='done'?'本次淨變化 '+(net>=0?'+':'')+money(net):'本手尚未完成，離開將放棄本手。',x+30,y+382);
  button('confirm-exit-table','離開練習桌',x+30,y+470,w-60,67,leaveTable,{primary:true});
  button('continue-table','繼續遊戲',x+30,y+553,w-60,61,back);return;
 }
 if(m.type==='handDetail'){
  const v=m.record;
  small('#'+v.hand+'  ·  盲注 '+v.sb+' / '+v.bb,x+30,y+119);
  text((v.net>=0?'+':'')+money(v.net),x+w-30,y+122,27,v.net>=0?P.teal:'#f19d89','right',700);
  small('公共牌',x+30,y+160);
  v.board.forEach((c,i)=>liveCard(c,x+62+i*69,y+221,59,82));
  small('你的底牌',x+w-158,y+160);v.cards.forEach((c,i)=>liveCard(c,x+w-123+i*67,y+221,57,82));
  text(v.result+'  贏得底池 '+money(v.pot),x+30,y+293,23,'#e2d7b8','left',650,w-60);
  const page=m.logPage||0,logs=v.log.slice(page*10,page*10+10);
  rect(x+24,y+323,w-48,369,'#101a20',8);
  logs.forEach((v,i)=>text(v,x+41,y+347+i*33,18,'#c4d3cb','left',500,w-83));
  const max=Math.max(1,Math.ceil(v.log.length/10));
  button('log-prev','上一頁',x+30,y+712,169,48,()=>{m.logPage=Math.max(0,page-1);invalidate()},{disabled:page===0});
  small((page+1)+' / '+max,360,y+738,P.muted,'center');
  button('log-next','下一頁',x+w-199,y+712,169,48,()=>{m.logPage=Math.min(max-1,page+1);invalidate()},{disabled:page>=max-1});
  button('detail-back','返回紀錄',x+30,y+h-87,w-60,58,back);return;
 }
 const rows=savedHands,page=m.page||0,start=page*5;
 small('此裝置最近 30 手 · 點選查看明細',x+30,y+118);
 if(!rows.length)text('完成第一手後顯示結算',360,y+218,23,P.muted,'center');
 rows.slice(start,start+5).forEach((v,i)=>{
  const yy=y+158+i*75;rect(x+24,yy-15,w-48,67,'#142128',7);
  text('#'+v.hand+'  '+v.result,x+40,yy+5,19,P.light,'left',600,w-200);
  text((v.net>=0?'+':'')+money(v.net),x+w-42,yy+5,22,v.net>=0?P.teal:'#e6a293','right',700);
  small('底池 '+money(v.pot)+'  ·  '+new Date(v.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),x+40,yy+32);
  hit('history-row-'+i,'查看第 '+v.hand+' 手明細',x+24,yy-15,w-48,67,()=>open('handDetail',{record:v,logPage:0}));
 });
 button('history-prev','上一頁',x+30,y+552,173,48,()=>{m.page=Math.max(0,page-1);invalidate()},{disabled:page===0});
 small((page+1)+' / '+Math.max(1,Math.ceil(rows.length/5)),360,y+576,P.muted,'center');
 button('history-next','下一頁',x+w-203,y+552,173,48,()=>{m.page=page+1;invalidate()},{disabled:start+5>=rows.length});
 button('history-close',S.page==='PLAY'?'返回牌桌':'返回',x+30,y+h-85,w-60,56,back);
}

// ===== END TABLE SESSION =====
