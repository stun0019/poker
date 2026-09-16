'use strict';
/*
 ClubGG-only H5 interaction prototype. Public screenshots inform layout.
 Local independent implementation; no ClubGG account or game-server connection.
 Reference inventory and unsupported behaviors are recorded in REFERENCE.md.
*/

const W=720,H=1280,TAU=Math.PI*2;
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
const stage=document.getElementById('stage'),entry=document.getElementById('entry'),controls=document.getElementById('controls'),announce=document.getElementById('announce');
const P={bg:'#ffffff',panel:'#f5f6f8',gold:'#00ad64',light:'#17202b',text:'#303841',muted:'#89929d',line:'#e5e7eb',teal:'#08b568'};
const MODES=[{id:'NLH',name:"HOLD'EM",zh:'德州撲克',color:'#c98324'},{id:'PLO',name:'OMAHA',zh:'奧馬哈',color:'#c98324'},{id:'6+',name:'SHORT DECK',zh:'短牌',color:'#c98324'}];
const KEY='clubgg-h5-prototype-v1',LEGACY_KEY='river-poker-client-v1';
let savedOK=true;
let user={id:'845481',name:'demopd',sound:true,joined:['100001','200002'],customClubs:[],customRooms:[],tournaments:[],registrations:{},balances:{},clubEdits:{},members:{},requests:{},stats:{},settings:{bb:false,vibration:false,smartFocus:true,autoTop:0,bet:[.33,.5,.75,1]},messages:[]};
try{
 let v=JSON.parse(localStorage.getItem(KEY)||'null');
 if(!v){const old=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');if(old)v={name:old.name,sound:old.sound,joined:old.joined,customClubs:old.customClubs,customRooms:old.customRooms}}
 if(v&&typeof v==='object'){
  if(typeof v.name==='string')user.name=v.name.slice(0,24);
  if(typeof v.sound==='boolean')user.sound=v.sound;
  for(const k of ['joined','customClubs','customRooms','tournaments','messages'])if(Array.isArray(v[k]))user[k]=v[k];
  for(const k of ['registrations','balances','clubEdits','members','requests','stats'])if(v[k]&&typeof v[k]==='object'&&!Array.isArray(v[k]))user[k]=v[k];
  if(v.settings)Object.assign(user.settings,v.settings);
  if(v.activeCash&&typeof v.activeCash.club==='string'&&Number.isFinite(v.activeCash.stack)){const id=v.activeCash.club;user.balances[id]=(Number.isFinite(user.balances[id])?user.balances[id]:10000)+Math.max(0,v.activeCash.stack)}
  for(const reg of Object.values(user.registrations))if(reg.state==='playing')reg.state='finished';
 }
}catch{savedOK=false}
const DIRECTORY=[
 {id:'100001',name:'Poker Friends',members:128,owner:false,mark:'P',color:'#18334e',notice:'Welcome to Poker Friends. Enjoy the game!',tables:8},
 {id:'200002',name:'My Poker Club',members:6,owner:true,mark:'M',color:'#54262a',notice:'Welcome! Create a table and invite your friends.',tables:6},
 {id:'300003',name:'Weekend Club',members:24,owner:false,mark:'W',color:'#303b2b',notice:'Welcome to the Weekend Club.',tables:4},
 {id:'222222',name:'The Waiting Room',members:16,owner:false,mark:'GG',color:'#171717',notice:'Welcome to The Waiting Room.',tables:3}
];
const SEEDED_ROOMS=DIRECTORY.flatMap((c,ci)=>Array.from({length:6},(_,i)=>({
 id:c.id+'-cash-'+i,club:c.id,name:['NLH 01','Deep Stack','Evening Game','Hold’em 04','Fast Table','High Stakes'][i],mode:0,
 blind:[1,2,5,10,25,50][i],seats:6,seated:[4,5,3,6,2,0][(i+ci)%6],minBB:40,maxBB:200,actionTime:25,ante:0,duration:120
})));
const SEEDED_TOURNEYS=DIRECTORY.flatMap(c=>[
 {id:c.id+'-mtt-1',club:c.id,name:'Daily Hold’em',kind:'MTT',mode:0,fee:100,starting:3000,blind:10,levelMinutes:5,seats:6,registered:3,status:'Registering',prize:600,late:0},
 {id:c.id+'-mtt-2',club:c.id,name:'Weekend Deep Stack',kind:'MTT',mode:0,fee:200,starting:5000,blind:25,levelMinutes:8,seats:6,registered:2,status:'Registering',prize:1200,late:0}
]);
function save(){try{localStorage.setItem(KEY,JSON.stringify(user));savedOK=true;return true}catch{savedOK=false;return false}}
save();
const allClubs=()=>DIRECTORY.concat(user.customClubs).map(c=>({...c,...user.clubEdits[c.id]}));
const myClubs=()=>allClubs().filter(c=>user.joined.includes(c.id));
const clubById=id=>allClubs().find(c=>c.id===id);
const allRooms=()=>SEEDED_ROOMS.concat(user.customRooms).filter(r=>!r.closed);
const allTournaments=()=>SEEDED_TOURNEYS.concat(user.tournaments);
function balance(id=S.club){return Number.isFinite(user.balances[id])?user.balances[id]:10000}
function adjustBalance(id,amount){user.balances[id]=Math.max(0,balance(id)+amount);save()}
function clubMembers(id){
 if(!user.members[id])user.members[id]=[
 {id:user.id,name:user.name,role:clubById(id)?.owner?'Owner':'Member',chips:balance(id),online:true},
 ...['Mika','Oliver','Luna','Kai','Avery'].map((name,i)=>({id:String(700001+i),name,role:'Member',chips:1000,online:i<3}))];
 return user.members[id];
}
function clubStats(id){return user.stats[id]||{hands:0,wins:0,vpip:0,pfr:0,showdowns:0,showWins:0,net:0}}
const S={page:'HOME',club:null,mode:-1,stake:0,onlyOpen:false,onlyRunning:false,onlyFav:false,scroll:0,eventType:0,
 modal:null,stack:[],routes:[],hits:[],pressed:null,hover:null,focus:null,keyboard:false,toast:'',toastUntil:0,entered:0,
 data:{},clubSlide:0,tab:'ALL',filterOpen:false,detailTab:0,form:null,returnRoute:null};

let raf=0,signature='',formStamp='',audio=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function invalidate(){if(!raf&&!document.hidden)raf=requestAnimationFrame(render)}
function resize(){
 const viewport=visualViewport,vw=viewport?.width||innerWidth,vh=viewport?.height||innerHeight;
 // Preserve the authored 9:16 geometry. Tall phones cannot show the complete
 // canvas edge-to-edge without either cropping or distortion, so keep uniform
 // scaling and anchor the canvas to the top of the visual viewport instead of
 // stretching it or vertically centering it between two letterbox bands.
 const scale=Math.min(vw/W,vh/H),displayW=W*scale,displayH=H*scale;
 const tallPhone=vw<=600&&vh/vw>1.7;
 if(tallPhone){
  stage.style.position='fixed';
  stage.style.left=(viewport?.offsetLeft+(vw-displayW)/2||0)+'px';stage.style.top=(viewport?.offsetTop||0)+'px';
 }else{
  stage.style.position='relative';stage.style.left='auto';stage.style.top='auto';
 }
 stage.style.width=displayW+'px';stage.style.height=displayH+'px';
 const d=Math.min(devicePixelRatio||1,3);
 canvas.width=Math.round(displayW*d);canvas.height=Math.round(displayH*d);invalidate();
}
addEventListener('resize',resize);visualViewport?.addEventListener('resize',resize);
function path(x,y,w,h,r=12){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function rect(x,y,w,h,color,r=0){path(x,y,w,h,r);ctx.fillStyle=color;ctx.fill()}
function border(x,y,w,h,color=P.line,r=12,n=1){path(x+.5,y+.5,w-1,h-1,r);ctx.strokeStyle=color;ctx.lineWidth=n;ctx.stroke()}
function linear(x,y,w,h,a,b){const z=ctx.createLinearGradient(x,y,x+w,y+h);z.addColorStop(0,a);z.addColorStop(1,b);return z}
function line(x,y,a,b,color=P.line,n=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.strokeStyle=color;ctx.lineWidth=n;ctx.stroke()}
function circle(x,y,r,color,stroke){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(color){ctx.fillStyle=color;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.4;ctx.stroke()}}
function text(t,x,y,size=20,color=P.text,align='left',weight=500,max){
 ctx.font=weight+' '+size+'px Arial,"Microsoft JhengHei",sans-serif';ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;
 if(max)ctx.fillText(String(t),x,y,max);else ctx.fillText(String(t),x,y);
}
function small(t,x,y,color=P.muted,align='left'){text(t,x,y,15,color,align)}
function panel(x,y,w,h,{fill=P.panel,edge=P.line,r=10}={}){
 ctx.save();ctx.shadowColor='#0006';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
 rect(x,y,w,h,linear(x,y,0,h,fill,'#15191d'),r);ctx.restore();
 border(x,y,w,h,edge,r);line(x+r,y+1,x+w-r,y+1,'#ffffff12');
}
function wrap(t,x,y,width,size=21,color=P.text){
 ctx.font='500 '+size+'px Arial,"Microsoft JhengHei",sans-serif';let s='',yy=y;
 for(const ch of t){if(ch==='\n'||ctx.measureText(s+ch).width>width){text(s,x,yy,size,color);s=ch==='\n'?'':ch;yy+=size*1.6}else s+=ch}
 if(s)text(s,x,yy,size,color);return yy+size*1.6;
}
function glyph(type,x,y,size=22,color=P.gold){
 ctx.save();ctx.translate(x,y);ctx.scale(size/24,size/24);ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.fillStyle=color;
 ctx.beginPath();
 switch(type){
 case 'home':ctx.moveTo(-17,0);ctx.lineTo(0,-15);ctx.lineTo(17,0);ctx.moveTo(-11,-5);ctx.lineTo(-11,17);ctx.lineTo(11,17);ctx.lineTo(11,-5);ctx.moveTo(-3,17);ctx.lineTo(-3,6);ctx.lineTo(3,6);ctx.lineTo(3,17);ctx.stroke();break;
 case 'group':circle(-6,-9,6,null,color);circle(9,-6,5,null,color);ctx.moveTo(-19,14);ctx.quadraticCurveTo(-16,0,-6,0);ctx.quadraticCurveTo(4,0,7,14);ctx.moveTo(9,2);ctx.quadraticCurveTo(18,3,21,14);ctx.stroke();break;
 case 'clock':circle(0,0,17,null,color);ctx.moveTo(0,-10);ctx.lineTo(0,1);ctx.lineTo(8,5);ctx.stroke();break;

 case 'spade':ctx.moveTo(0,-19);ctx.bezierCurveTo(-4,-12,-18,-4,-17,5);ctx.bezierCurveTo(-16,15,-7,15,-3,9);ctx.lineTo(-7,19);ctx.lineTo(7,19);ctx.lineTo(3,9);ctx.bezierCurveTo(7,15,16,15,17,5);ctx.bezierCurveTo(18,-4,4,-12,0,-19);ctx.closePath();ctx.fill();break;
 case 'heart':ctx.moveTo(0,18);ctx.bezierCurveTo(-31,-2,-15,-25,0,-10);ctx.bezierCurveTo(15,-25,31,-2,0,18);ctx.fill();break;
 case 'diamond':ctx.moveTo(0,-20);ctx.lineTo(15,0);ctx.lineTo(0,20);ctx.lineTo(-15,0);ctx.closePath();ctx.fill();break;
 case 'club':[[0,-9],[-9,3],[9,3]].forEach(([a,b])=>{ctx.moveTo(a+9,b);ctx.arc(a,b,9,0,TAU)});ctx.moveTo(-2,3);ctx.lineTo(2,3);ctx.lineTo(7,20);ctx.lineTo(-7,20);ctx.closePath();ctx.fill();break;
 case 'coin':circle(0,0,18,color);circle(0,0,14,null,'#624820');glyph('spade',0,0,15,'#614923');break;
 case 'gem':ctx.moveTo(-18,-6);ctx.lineTo(-9,-16);ctx.lineTo(9,-16);ctx.lineTo(18,-6);ctx.lineTo(0,18);ctx.closePath();ctx.fill();line(-18,-6,18,-6,'#cbe3df');line(-8,-6,0,18,'#ffffff66');line(8,-6,0,18,'#ffffff66');break;
 case 'menu':[-9,0,9].forEach(y=>{ctx.moveTo(-13,y);ctx.lineTo(13,y)});ctx.stroke();break;
 case 'plus':ctx.moveTo(-10,0);ctx.lineTo(10,0);ctx.moveTo(0,-10);ctx.lineTo(0,10);ctx.stroke();break;
 case 'close':ctx.moveTo(-9,-9);ctx.lineTo(9,9);ctx.moveTo(9,-9);ctx.lineTo(-9,9);ctx.stroke();break;
 case 'arrow':ctx.moveTo(-5,-9);ctx.lineTo(4,0);ctx.lineTo(-5,9);ctx.stroke();break;
 case 'search':circle(-3,-3,10,null,color);line(5,5,15,15,color,2);break;
 case 'back':ctx.moveTo(6,-10);ctx.lineTo(-5,0);ctx.lineTo(6,10);ctx.stroke();break;
 case 'person':circle(0,-8,6,color);ctx.beginPath();ctx.arc(0,13,12,Math.PI,0);ctx.fill();break;
 case 'table':path(-16,-10,32,20,8);ctx.stroke();[-1,1].forEach(s=>{circle(s*10,-15,2,color);circle(s*10,15,2,color)});break;
 case 'star':for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?8:18;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.stroke();break;
 case 'check':ctx.moveTo(-10,0);ctx.lineTo(-3,8);ctx.lineTo(12,-9);ctx.stroke();break;
 case 'notice':path(-12,-17,24,34,3);ctx.stroke();[-7,0,7].forEach(y=>line(-6,y,6,y,color,1.5));break;
 case 'mail':path(-17,-12,34,25,3);ctx.stroke();ctx.moveTo(-15,-10);ctx.lineTo(0,2);ctx.lineTo(15,-10);ctx.stroke();break;
 case 'chart':rect(-15,2,7,15,color,1);rect(-3,-14,7,31,color,1);rect(9,-5,7,22,color,1);break;
 case 'shop':ctx.moveTo(-18,-15);ctx.lineTo(-11,-15);ctx.lineTo(-5,7);ctx.lineTo(13,7);ctx.lineTo(18,-9);ctx.lineTo(-9,-9);ctx.stroke();circle(-3,15,2,color);circle(12,15,2,color);break;
 case 'trophy':ctx.moveTo(-11,-15);ctx.lineTo(11,-15);ctx.lineTo(9,0);ctx.quadraticCurveTo(0,15,-9,0);ctx.closePath();ctx.stroke();ctx.moveTo(-11,-11);ctx.lineTo(-18,-11);ctx.quadraticCurveTo(-19,4,-7,4);ctx.moveTo(11,-11);ctx.lineTo(18,-11);ctx.quadraticCurveTo(19,4,7,4);ctx.moveTo(0,7);ctx.lineTo(0,16);ctx.moveTo(-9,18);ctx.lineTo(9,18);ctx.stroke();break;
 case 'gift':path(-15,-3,30,23,2);ctx.stroke();path(-18,-8,36,7,1);ctx.stroke();line(0,-8,0,20,color,2);ctx.beginPath();ctx.moveTo(0,-8);ctx.bezierCurveTo(-27,-24,-7,-29,0,-8);ctx.bezierCurveTo(27,-24,7,-29,0,-8);ctx.stroke();break;
 case 'wheel':circle(0,0,19,null,color);circle(0,0,12,null,color);for(let i=0;i<12;i++){const a=i*TAU/12;line(Math.cos(a)*12,Math.sin(a)*12,Math.cos(a)*18,Math.sin(a)*18,color)}glyph('spade',0,0,12,color);break;
 }
 ctx.restore();
}


/* ART DIRECTION: physical poker assets, separately rendered labels and states.
   Embedded artwork generated with ImageGen: dark tournament still life; 3x2
   poker cards / enamel club badges / satin gift atlas. No text baked into UI.
   Crops are normalized; image downloads never occur at runtime. */
let heroArt=null,iconArt=null,visualUntil=0,frameTime=0;
function animate(ms=380){visualUntil=Math.max(visualUntil,performance.now()+ms);invalidate()}
function roundedArt(img,x,y,w,h,r=12,source=null){
 if(!img?.complete||!img.naturalWidth)return false;
 ctx.save();path(x,y,w,h,r);ctx.clip();
 if(source){const [sx,sy,sw,sh]=source;ctx.drawImage(img,sx*img.width,sy*img.height,sw*img.width,sh*img.height,x,y,w,h)}
 else {const k=Math.max(w/img.width,h/img.height),sw=w/k,sh=h/k;ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h)}
 ctx.restore();return true;
}
function sprite(i,x,y,w,h){
 return roundedArt(iconArt,x,y,w,h,9,[(i%3)/3,Math.floor(i/3)/2,1/3,1/2]);
}
function goldText(label,x,y,size=24,align='left',max){
 text(label,x,y+1,size,'#0008',align,750,max);
 text(label,x,y,size,'#f3f1e9',align,750,max);
}
function fineRule(x,y,w,color='#ad9760'){
 const z=ctx.createLinearGradient(x,y,x+w,y);z.addColorStop(0,color+'00');z.addColorStop(.35,color+'aa');z.addColorStop(.65,color+'aa');z.addColorStop(1,color+'00');rect(x,y,w,1,z);
}
function sheen(x,y,w,h){
 if(reduced||frameTime>visualUntil)return;
 ctx.save();path(x,y,w,h,12);ctx.clip();
 const t=1-(visualUntil-frameTime)/550,xx=x-w*.4+t*w*1.7;
 const z=ctx.createLinearGradient(xx-35,y,xx+35,y);z.addColorStop(0,'#ffffff00');z.addColorStop(.5,'#ffffff0c');z.addColorStop(1,'#ffffff00');
 ctx.fillStyle=z;ctx.beginPath();ctx.moveTo(xx-60,y);ctx.lineTo(xx+10,y);ctx.lineTo(xx+65,y+h);ctx.lineTo(xx-5,y+h);ctx.fill();ctx.restore();
}

function hit(id,label,x,y,w,h,fn,disabled=false){if(w>0&&h>0)S.hits.push({id,label,x,y,w,h,fn,disabled})}
function feedback(id,x,y,w,h,r=12){
 const selected=S.hover===id||S.pressed===id;
 if(selected){rect(x+2,y+2,w-4,h-4,S.pressed===id?'#dfc18a20':'#ffffff07',r);border(x+1,y+1,w-2,h-2,S.pressed===id?'#f4dba4':'#97bcb58a',r);sheen(x,y,w,h)}
 if(S.keyboard&&S.focus===id)border(x+3,y+3,w-6,h-6,P.gold,r,2);
}
function button(id,label,x,y,w,h,fn,{primary=false,icon,disabled=false}={}){
 const dark=isDark(),pressed=S.pressed===id,table=S.page==='PLAY';
 const fill=primary?(dark?'#bf2f36':'#0eb369'):table?'#242427':dark?'#343438':'#f1f3f6';
 ctx.save();if(disabled)ctx.globalAlpha=.36;
 rect(x,y+(pressed?1:0),w,h,fill,table?5:9);if(!primary)border(x,y,w,h,dark?'#47474c':'#e0e4eb',table?5:9);
 const col=primary||dark?'#f7f7f8':'#596575';
 if(icon)glyph(icon,x+(label?23:w/2),y+h/2,21,col);
 if(label)text(label,x+w/2+(icon?10:0),y+h/2,id.startsWith('act-')?25:20,col,'center',600,w-(icon?43:22));
 ctx.restore();hit(id,label||icon,x,y,w,h,fn,disabled);feedback(id,x,y,w,h,8);
}

function link(id,label,x,y,w,fn){text(label,x+w,y,16,P.gold,'right',500);hit(id,label,x,y-22,w,44,fn);feedback(id,x,y-22,w,44,6)}
function pill(label,x,y,w,color=P.gold){rect(x,y,w,24,color+'19',5);text(label,x+w/2,y+12,12,color,'center',600)}
/* Sound is synthesized locally: no downloads and no autoplay before interaction. */
function sound(kind='tap',delay=0){
 if(!user.sound||document.hidden)return;
 try{
  audio??=new (window.AudioContext||window.webkitAudioContext)();
  if(audio.state==='suspended')audio.resume().catch(()=>{});
  const t=audio.currentTime+delay;
  const tone=(f,end,duration,volume,type='sine',offset=0)=>{
   const o=audio.createOscillator(),a=audio.createGain(),at=t+offset;
   o.type=type;o.frequency.setValueAtTime(f,at);o.frequency.exponentialRampToValueAtTime(Math.max(25,end),at+duration);
   a.gain.setValueAtTime(.0001,at);a.gain.linearRampToValueAtTime(volume,at+.005);a.gain.exponentialRampToValueAtTime(.0001,at+duration);
   o.connect(a);a.connect(audio.destination);o.start(at);o.stop(at+duration+.01);
  };
  const noise=(duration,volume,freq,offset=0)=>{
   if(!sound.buffer){const b=audio.createBuffer(1,audio.sampleRate*.24,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;sound.buffer=b}
   const n=audio.createBufferSource(),f=audio.createBiquadFilter(),a=audio.createGain(),at=t+offset;
   n.buffer=sound.buffer;f.type='bandpass';f.frequency.value=freq;f.Q.value=.8;
   a.gain.setValueAtTime(volume,at);a.gain.exponentialRampToValueAtTime(.0001,at+duration);
   n.connect(f);f.connect(a);a.connect(audio.destination);n.start(at);n.stop(at+duration);
  };
  if(kind==='deal'){noise(.065,.065,4200);tone(620,180,.05,.012)}
  else if(kind==='peel'){noise(.12,.028,1800)}
  else if(kind==='chips'){[0,.035,.083].forEach((o,i)=>{tone(2200-i*230,1100,.075,.025,'triangle',o);noise(.025,.027,6400,o)})}
  else if(kind==='check'){tone(190,75,.045,.09);tone(230,80,.04,.065,'sine',.095)}
  else if(kind==='fold'){noise(.1,.045,2300)}
  else if(kind==='turn'){tone(620,620,.12,.035);tone(830,830,.18,.035,'sine',.13)}
  else if(kind==='warning'){tone(960,760,.09,.027)}
  else if(kind==='win'){[523,659,784,1046].forEach((f,i)=>tone(f,f,.38,.026,'sine',i*.1));noise(.17,.018,5700,.2)}
  else if(kind==='allin'){tone(170,55,.24,.06);[440,554,659].forEach((f,i)=>tone(f,f,.3,.025,'triangle',i*.08))}
  else tone(510,340,.055,.018);
 }catch{}
}
function clickSound(){sound('tap')}

function activate(h){if(!h||h.disabled)return;clickSound();S.pressed=null;h.fn();animate(550)}
function transition(){S.entered=performance.now();S.focus=null;S.hover=null;S.pressed=null;animate(220)}
function routeSnapshot(){return {page:S.page,club:S.club,scroll:S.scroll,data:{...S.data},tab:S.tab,detailTab:S.detailTab}}
function go(page,data={},replace=false){
 if(!replace&&S.page!==page)S.routes.push(routeSnapshot());
 S.page=page;S.data=data;S.modal=null;S.stack=[];S.scroll=0;S.detailTab=0;entry.blur();formStamp='';transition();
}
function open(type,data={}){
 if(S.modal)S.stack.push(S.modal);S.modal={type,...data};formStamp='';entry.blur();transition();
 announce.textContent=data.title||type;if(S.page==='PLAY'){clearTimeout(tableTimer);tableTimer=0}
}
function back(){
 if(S.modal){S.modal=S.stack.pop()||null;formStamp='';entry.blur();transition();if(S.page==='PLAY')scheduleTable();return}
 const prev=S.routes.pop();if(prev){Object.assign(S,prev);S.modal=null;S.stack=[];formStamp='';entry.blur();transition();if(S.page==='PLAY')scheduleTable()}
 else go('HOME',{},true);
}
function closeAll(){S.modal=null;S.stack=[];formStamp='';entry.blur();transition()}
function notify(t){S.toast=t;S.toastUntil=performance.now()+2400;announce.textContent=t;invalidate()}
function enterClub(id){S.club=id;S.tab='ALL';S.onlyOpen=false;S.onlyRunning=false;go('CLUB');}
function roomRoute(club=null){if(club){enterClub(club)}else go('HOME',{},true)}
function isDark(){return ['HOME','CLUBS','CLUB','TABLES','EVENTS','DETAIL','TOURNAMENT','CREATE_GAME','CREATE_CASH','CREATE_TOURNAMENT','MEMBERS','MANAGEMENT','MEMBER','STATS','HISTORY','PLAY'].includes(S.page)}
function palette(){
 const dark=isDark();Object.assign(P,dark?{bg:'#080808',panel:'#222224',light:'#eeeeef',text:'#ceced2',muted:'#858589',line:'#333336',gold:'#ed3237',teal:'#9dda2e'}:
 {bg:'#ffffff',panel:'#f5f6f8',light:'#1d252f',text:'#454d57',muted:'#939ba5',line:'#e7e9ee',gold:'#0bb46b',teal:'#0bb46b'});
}
function appHeader(title,{right=null,fn=null,backward=true}={}){
 rect(0,0,720,103,P.bg);line(0,102,720,102,isDark()?'#222226':'#eff0f4');
 if(backward){glyph('back',38,56,26,P.light);hit('screen-back','返回',6,15,70,78,back)}
 text(title,360,56,27,P.light,'center',600,475);
 if(right){text(right,683,55,21,P.light,'right',600);hit('header-action',right,556,14,148,80,fn)}
}
function primary(id,label,fn,y=1168,disabled=false){button(id,label,28,y,664,72,fn,{primary:true,disabled})}
function avatar(x,y,size=66,label=user.name){
 const dark=isDark();rect(x-size/2,y-size/2,size,size,dark?'#20242b':'#e8edf2',size*.24);border(x-size/2,y-size/2,size,size,dark?'#424851':'#e8edf2',size*.24);
 text(label.slice(0,1).toUpperCase(),x,y+1,size*.43,dark?'#f2f4f7':'#415168','center',700);
}
function clubArtwork(c,x,y,w,h){
 rect(x,y,w,h,linear(x,y,w,h,c.color||'#233047','#090d12'),12);
 if(c.id==='222222'&&clubIcon.complete&&clubIcon.naturalWidth){ctx.drawImage(clubIcon,x+(w-h*.78)/2,y+h*.11,h*.78,h*.78);return}
 const size=Math.min(w,h)*.32;ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(Math.PI/4);rect(-size,-size,size*2,size*2,'#ffffff0b',15);border(-size,-size,size*2,size*2,'#ffffff20',15);ctx.restore();
 glyph('club',x+w/2,y+h*.39,Math.min(w,h)*.29,'#e8e8e8');text(c.name.toUpperCase(),x+w/2,y+h*.75,Math.min(w*.068,25),'#fafafa','center',700,w-24);
}
function screenEmpty(title,sub,y=520){
 glyph('spade',360,y,44,P.muted);text(title,360,y+67,26,P.light,'center',600);text(sub,360,y+113,19,P.muted,'center',400,640);
}
function list(top,bottom,rows,rowH,draw){
 const max=Math.max(0,rows.length*rowH-(bottom-top));S.scroll=Math.max(0,Math.min(S.scroll,max));S.viewport=[top,bottom];
 ctx.save();ctx.beginPath();ctx.rect(0,top,720,bottom-top);ctx.clip();
 rows.forEach((r,i)=>{const y=top+i*rowH-S.scroll;if(y+rowH<=top||y>=bottom)return;const n=S.hits.length;draw(r,y,i);
  for(let j=n;j<S.hits.length;j++){const b=S.hits[j],end=Math.min(bottom,b.y+b.h);b.y=Math.max(top,b.y);b.h=Math.max(0,end-b.y)}
 });ctx.restore();
 if(max){const h=Math.max(38,(bottom-top)**2/(rows.length*rowH));rect(713,top+S.scroll/max*(bottom-top-h),3,h,isDark()?'#666':'#bcc3cc',2)}
}
function bottomMain(){
 const lobby=S.page==='HOME'||S.page==='CLUBS',top=lobby?1156:1167,height=lobby?124:113;
 rect(0,top,720,height,lobby?linear(0,top,0,height,'#1c1f24','#060709'):'#ffffff');line(0,top,720,top,lobby?'#393d44':'#e7e9ef');
 const items=[['Club','club','HOME'],['Live Event','trophy','EVENTS_HOME'],['Stage 1','spade',null],['Stage 2','spade',null],['Final Stage','trophy',null],['Casino','grid',null],['Me','person','ME']];
 items.forEach(([label,icon,page],i)=>{const x=i*720/7+720/14,on=S.page===page,c=lobby?(on?'#f3f4f6':'#707781'):(on?'#323c49':'#b1b8c2');
  if(lobby&&i){const sx=i*720/7;line(sx-7,top+10,sx+7,1275,'#353a41',1)}
  glyph(icon==='grid'?'menu':icon,x,lobby?1198:1202,lobby?29:25,on&&lobby?'#ef365d':c);text(label,x,lobby?1241:1239,lobby?14:13,c,'center',500,99);
  hit('main-nav-'+i,label,i*720/7,top,720/7,height,()=>page==='HOME'?go('HOME',{},true):page==='ME'?go('ME'):page==='EVENTS_HOME'?open('info',{title:'Live Event',body:'Live Event 不在這次俱樂部 Prototype 的範圍。'}):null,!page);
 });
 rect(271,1265,178,5,lobby?'#f1f3f5':'#222832',3);
}
function home(){
 avatar(62,65,66);hit('profile','Player Profile',18,17,91,91,()=>go('PROFILE'));
 text(user.name,115,48,25,'#f4f5f7','left',650,299);rect(115,75,152,23,'#191c20',12);text('GET MEMBERSHIP',187,87,10,'#9aa1ac','center',600);circle(275,87,7,'#0bb46b');
 rect(518,37,174,40,'#16181c',20);border(518,37,174,40,'#363a41',20);circle(542,57,12,'#f2b62f');text('L',542,57,14,'#60470f','center',700);text('0',672,58,18,'#f2b62f','right');
 rect(28,151,664,68,'#17191d',15);border(28,151,664,68,'#34383f',15);
 glyph('search',59,185,21,'#a4abb6');text('SEARCH CLUB',95,186,20,'#a4abb6');
 hit('search-club','Search Club',28,151,664,68,()=>go('JOIN',{value:''}));
 // ClubGG club cards form a horizontal carousel, not a vertical game-mode catalog.
 const cards=[...myClubs(),{id:'create',name:'Create Club'}],cw=424,ch=523,gap=27;
 S.clubSlide=Math.max(0,Math.min(cards.length-1,S.clubSlide));
 ctx.save();ctx.beginPath();ctx.rect(0,245,720,690);ctx.clip();
 cards.forEach((c,i)=>{
  const x=148+(i-S.clubSlide)*(cw+gap),y=354;if(x>720||x+cw<0)return;
  ctx.save();ctx.shadowColor='#000b';ctx.shadowBlur=25;ctx.shadowOffsetY=12;rect(x,y,cw,ch,linear(x,y,cw,ch,'#25282e','#141619'),32);ctx.restore();border(x,y,cw,ch,'#3c4047',32);
  if(c.id==='create'){
   clubArtwork({name:'CLUB',color:'#481426'},x+27,y+25,cw-54,313);text('Create a club and run your own poker club',x+cw/2,y+374,15,'#9299a2','center',400,cw-36);
   button('create-club','CREATE CLUB',x+26,y+426,cw-52,64,()=>go('CREATE_CLUB',{name:''}),{primary:true});
  }else{
   clubArtwork(c,x+27,y+25,cw-54,313);
   text(c.name,x+cw/2,y+369,28,'#f5f6f8','center',700,cw-36);text('ID · '+c.id,x+cw/2,y+402,17,'#9299a5','center');
   rect(x+27,y+447,169,37,'#090a0c',18);border(x+27,y+447,169,37,'#32363c',18);rect(x+211,y+447,185,37,'#090a0c',18);border(x+211,y+447,185,37,'#32363c',18);
   glyph('group',x+47,y+466,19,'#858d99');text(c.members,x+175,y+466,17,'#e8ebef','right');
   glyph('spade',x+235,y+466,18,'#858d99');text(allRooms().filter(r=>r.club===c.id).length,x+369,y+466,17,'#e8ebef','right');
   hit('club-'+c.id,'進入 '+c.name,Math.max(0,x),y,Math.min(720,x+cw)-Math.max(0,x),ch,()=>enterClub(c.id));
  }
 });ctx.restore();
 cards.forEach((c,i)=>rect(360-(cards.length*20)/2+i*20,895,i===S.clubSlide?14:6,6,i===S.clubSlide?'#e9edf3':'#444952',3));
 hit('clubs-prev','上一個俱樂部',0,320,80,600,()=>{S.clubSlide=Math.max(0,S.clubSlide-1);invalidate()},S.clubSlide===0);
 hit('clubs-next','下一個俱樂部',640,320,80,600,()=>{S.clubSlide=Math.min(cards.length-1,S.clubSlide+1);invalidate()},S.clubSlide===cards.length-1);
 // Membership banner stays in its reference slot; it does not introduce a new flow.
 rect(28,947,664,162,linear(28,947,664,162,'#f1f2f4','#cfd3d9'),20);border(28,947,664,162,'#ffffffb8',20);
 if(clubIcon.complete&&clubIcon.naturalWidth)ctx.drawImage(clubIcon,48,970,116,116);
 text('PLAY WITH FRIENDS',191,1007,30,'#111317','left',750,469);
 text('Club Games',191,1051,24,'#555d69','left',500);glyph('arrow',659,1028,23,'#30353d');
 bottomMain();
}
function joinPage(){
 appHeader('SEARCH CLUB');labelField('Club ID',S.data.value||'',28,156,664,()=>open('edit',{title:'Club ID',value:S.data.value||'',numeric:true,max:6,onSave:v=>{S.data.value=v;S.data.found=null}}));
 labelField('Referrer ID',S.data.referrer||'',28,291,664,()=>open('edit',{title:'Referrer ID',value:S.data.referrer||'',onSave:v=>S.data.referrer=v}), 'Search Member Nickname or ID');
 if(S.data.error)text(S.data.error,29,407,19,'#db4c50');
 const c=S.data.found&&clubById(S.data.found);
 if(c){clubArtwork(c,178,472,364,263);text(c.name,360,777,28,P.light,'center',650);text('ID : '+c.id,360,817,20,P.muted,'center');
  button('join-result',user.joined.includes(c.id)?'ENTER CLUB':'JOIN CLUB',118,878,484,67,()=>{if(!user.joined.includes(c.id)){user.joined.push(c.id);save()}enterClub(c.id)},{primary:true});
 }
 primary('search-submit','SEARCH',()=>{const c=clubById(S.data.value);S.data.error=c?'':'Club not found. Try 300003 or 222222.';S.data.found=c?.id;invalidate()});
}
function labelField(label,value,x,y,w,fn,placeholder=''){
 text(label,x,y,21,P.text);rect(x,y+27,w,68,isDark()?'#252529':'#fff',10);border(x,y+27,w,68,isDark()?'#3d3d41':'#d9dfe7',10);
 text(value||placeholder||label,x+20,y+62,23,value?P.light:P.muted,'left',400,w-64);hit('field-'+label,label,x,y+22,w,82,fn);
}
function createClubPage(){
 appHeader('CREATE CLUB');clubArtwork({name:S.data.name||'CLUB',color:'#461a2b'},248,155,224,224);
 text('Club Image',360,413,20,P.muted,'center');
 labelField('Club Name',S.data.name||'',28,469,664,()=>open('edit',{title:'Club Name',value:S.data.name||'',onSave:v=>S.data.name=v,max:24}));
 if(S.data.error)text(S.data.error,28,600,20,'#df5559');
 primary('create-club-submit','CREATE',()=>{
  const name=(S.data.name||'').trim();if(name.length<2){S.data.error='Enter at least 2 characters.';invalidate();return}
  let id;do{id=String(400000+Math.floor(Math.random()*500000))}while(clubById(id));
  user.customClubs.push({id,name,owner:true,members:1,color:'#34283d',notice:'Welcome to '+name,mark:name[0]});user.joined.push(id);save();
  open('club-created',{title:'CLUB CREATED',club:id});
 });
}
function clubFooter(){
 rect(0,1186,720,94,'#090909');line(0,1186,720,1186,'#27272a');
 const actions=[['Create Game','plus',()=>go('CREATE_GAME')],['Members','group',()=>go('MEMBERS')],['Menu','menu',()=>open('clubMenu')]];
 actions.forEach(([label,icon,fn],i)=>{const x=120+i*240;glyph(icon,x,1218,24,'#d0d0d2');text(label,x,1251,16,'#929297','center');hit('club-bottom-'+i,label,i*240,1190,240,84,fn,i===0&&!clubById(S.club)?.owner)});
}
function clubPage(){
 const c=clubById(S.club);if(!c){back();return}
 appHeader('CLUB');clubArtwork(c,28,117,107,107);text(c.name,153,135,25,P.light,'left',650,435);text('(ID : '+c.id+')',153,170,17,P.muted);
 glyph('group',161,207,17,P.muted);text(c.members+' Players',183,207,17,P.muted);glyph('spade',351,207,17,P.muted);text(allRooms().filter(r=>r.club===c.id).length+' Tables',375,207,17,P.muted);
 rect(153,234,390,38,'#232325',19);circle(175,253,12,'#d53832');text(money(balance()),521,253,23,'#e9e9eb','right',550);
 text('NOTICE',29,299,13,P.muted);rect(28,319,664,65,'#222225',9);text(c.notice||'Welcome to '+c.name,46,351,19,'#babac0','left',400,628);
 const tabs=['ALL','NLH','PLO','6+','SNG','MTT'];tabs.forEach((t,i)=>{text(t,60+i*120,427,21,S.tab===t?'#fff':'#8d8d92','center',S.tab===t?700:400);if(S.tab===t)rect(i*120+14,458,92,4,'#ee353c');hit('club-tab-'+t,t,i*120,392,120,74,()=>{S.tab=t;S.page=t==='MTT'||t==='SNG'?'EVENTS':'TABLES';S.scroll=0;invalidate()})});
 checkbox('running','Running Tables',28,492,S.onlyRunning,()=>{S.onlyRunning=!S.onlyRunning;S.scroll=0;invalidate()});
 checkbox('hide-full','Hide Full Tables',284,492,S.onlyOpen,()=>{S.onlyOpen=!S.onlyOpen;S.scroll=0;invalidate()});
 button('filter','Filter',553,477,139,43,()=>{S.filterOpen=!S.filterOpen;invalidate()});
 let top=540;
 if(S.filterOpen){rect(28,537,664,146,'#222225',8);text('Blinds Filter',45,565,17,P.text);
  [0,1,5,25].forEach((v,i)=>button('blind-'+v,v===0?'ALL':v+' / '+v*2,43+i*163,591,150,58,()=>{S.stake=v;S.scroll=0;invalidate()},{primary:S.stake===v}));top=697;
 }
 const cash=allRooms().filter(r=>r.club===S.club&&(S.tab==='ALL'||S.tab==='NLH')&&(!S.onlyOpen||r.seated<r.seats)&&(!S.onlyRunning||r.seated>0)&&(!S.stake||r.blind===S.stake)).map(r=>({...r,type:'cash'}));
 const tours=allTournaments().filter(r=>r.club===S.club&&(S.tab==='ALL'||S.tab===r.kind)&&(!S.onlyOpen||r.registered+(user.registrations[r.id]?1:0)<r.seats)).map(r=>({...r,type:'tournament'}));
 const rows=[...cash,...tours];list(top,1178,rows,126,(r,y)=>{
  rect(28,y+4,664,114,'#222224',10);rect(28,y+4,39,114,r.type==='cash'?'#ad781e':'#ce810a',8);
  ctx.save();ctx.translate(48,y+61);ctx.rotate(-Math.PI/2);text(r.type==='cash'?'NLH':r.kind,0,0,18,'#fff','center',600);ctx.restore();
  text(r.name,81,y+26,19,P.light,'left',450,438);
  if(r.type==='cash'){text(r.blind+' / '+r.blind*2,81,y+62,27,'#e6cf9a','left',650);text(r.seated+'/'+r.seats,669,y+64,23,'#c9c9cb','right');text('Buy-in '+money(r.blind*2*(r.minBB||40))+' – '+money(r.blind*2*(r.maxBB||200)),81,y+96,16,P.muted)}
  else{rect(80,y+45,130,29,'#689e10',15);text(user.registrations[r.id]?'Registered':'Registering',145,y+60,14,'#fff','center',550);text('Start when full',223,y+61,20,'#aee637','left');text('Buy-in',536,y+61,14,P.muted);text(money(r.fee),673,y+61,23,'#f2d284','right');text((r.registered+(user.registrations[r.id]?1:0))+'/'+r.seats+' Players',81,y+95,16,P.muted);text('Prize '+money(r.prize),670,y+95,19,'#e5c97d','right')}
  hit('row-'+r.id,'查看 '+r.name,28,y+4,664,114,()=>go(r.type==='cash'?'DETAIL':'TOURNAMENT',{id:r.id}));
 });
 if(!rows.length)screenEmpty('No games','There are no games matching the selected filters.',top+170);
 clubFooter();
}
function checkbox(id,label,x,y,on,fn){
 rect(x,y-12,24,24,'#0d0d0f',4);border(x,y-12,24,24,on?'#dc363c':'#58585c',4);
 if(on)glyph('check',x+12,y,17,'#e84248');text(label,x+35,y,18,P.text);hit(id,label,x-5,y-23,248,48,fn);
}
function detailRows(rows,y=310){
 rows.forEach(([k,v],i)=>{const yy=y+i*69;text(k,29,yy,22,P.muted);text(v,691,yy,23,P.light,'right',550,403);line(28,yy+33,692,yy+33,P.line)});
}
function detailPage(tournament=false){
 const r=tournament?allTournaments().find(r=>r.id===S.data.id):allRooms().find(r=>r.id===S.data.id);if(!r){back();return}
 appHeader(tournament?'TOURNAMENT':'TABLE DETAIL');text(r.name,360,149,31,P.light,'center',650,654);
 text(tournament?r.kind+' · Hold’em':'No Limit Hold’em',360,193,20,P.muted,'center');
 const tabs=tournament?['Information','Players','Prizes','Structure']:['Information','Players'];
 tabs.forEach((v,i)=>{const w=720/tabs.length;text(v,(i+.5)*w,257,20,S.detailTab===i?'#fff':'#86868b','center');if(S.detailTab===i)rect(i*w+12,286,w-24,3,'#e33a3f');hit('detail-tab-'+i,v,i*w,226,w,65,()=>{S.detailTab=i;S.scroll=0;invalidate()})});
 if(S.detailTab===0){
  detailRows(tournament?[['Status',user.registrations[r.id]?'Registered':r.status],['Buy-in',money(r.fee)],['Prize Pool',money(r.prize)],['Players',(r.registered+(user.registrations[r.id]?1:0))+' / '+r.seats],['Starting Chips',money(r.starting)],['Level Duration',r.levelMinutes+' min'],['Starting Blinds',r.blind+' / '+r.blind*2],['Game', 'Hold’em · 6 Max']]:
  [['Blinds',r.blind+' / '+r.blind*2],['Buy-in',money(r.blind*2*(r.minBB||40))+' – '+money(r.blind*2*(r.maxBB||200))],['Players',r.seated+' / '+r.seats],['Action Time',(r.actionTime||25)+' sec'],['Ante',r.ante||0],['Game Duration',(r.duration||120)+' min'] ],342);
 }else if(S.detailTab===1){
  const names=['Mika','Oliver','Luna','Kai','Avery'].slice(0,tournament?r.registered:r.seated);if(tournament&&user.registrations[r.id])names.push(user.name);
  list(316,1120,names,88,(name,y,i)=>{text(i+1,36,y+43,21,P.muted);text(name,92,y+43,24,P.light);text(tournament?money(r.starting):money(r.blind*200),685,y+43,23,P.text,'right');line(28,y+86,692,y+86,P.line)});
 }else if(S.detailTab===2){detailRows([['1st',money(r.prize*.6)],['2nd',money(r.prize*.3)],['3rd',money(r.prize*.1)]],361)}
 else {list(316,1120,Array.from({length:12},(_,i)=>i),66,(i,y)=>{const b=tournamentBlind(r,i+1);text('Level '+(i+1),30,y+32,22,P.text);text(b+' / '+b*2,420,y+32,23,P.light,'right');text(r.levelMinutes+' min',689,y+32,20,P.muted,'right');line(28,y+64,692,y+64,P.line)})}
 if(tournament){
  const reg=user.registrations[r.id];
  if(reg){button('unregister','UNREGISTER',28,1168,253,72,()=>open('unregister',{tournament:r}),{disabled:reg.state!=='registered'});button('tournament-enter',reg.state==='finished'?'FINISHED':'ENTER TABLE',299,1168,393,72,()=>startTournament(r),{primary:true,disabled:reg.state==='finished'})}
  else primary('register','REGISTER',()=>open('register',{tournament:r}),1168,balance(r.club)<r.fee);
 }else primary('join-table',r.seated>=r.seats?'TABLE FULL':'JOIN TABLE',()=>enterTable(r),1168,r.seated>=r.seats);
}
function createGamePage(){
 appHeader('CREATE GAME');
 [['Ring Game','Create Cash Table','CREATE_CASH'],['Tournament','Create Tournament','CREATE_TOURNAMENT']].forEach(([name,label,page],i)=>{
  const y=160+i*171;rect(28,y,664,144,'#242427',10);glyph(i?'trophy':'spade',82,y+70,37,'#dedede');text(name,137,y+53,27,P.light);text('No Limit Hold’em',137,y+96,19,P.muted);glyph('arrow',662,y+71,23,P.muted);hit('create-type-'+i,label,28,y,664,144,()=>initGameForm(page));
 });
}
function initGameForm(page){
 S.form=page==='CREATE_CASH'?{name:'Hold’em '+(allRooms().filter(r=>r.club===S.club).length+1),blind:5,minBB:40,maxBB:200,seats:6,actionTime:25,duration:120}:
 {name:'Daily Tournament',fee:100,starting:3000,blind:10,levelMinutes:5,seats:6,prize:600,kind:'MTT'};
 go(page);
}
function chooseSetting(title,key,values,labels=null){open('choice',{title,values,labels,value:S.form[key],onSelect:v=>{S.form[key]=v;invalidate()}})}
function createGameForm(tour=false){
 appHeader(tour?'CREATE TOURNAMENT':'CREATE TABLE');
 if(!clubById(S.club)?.owner){screenEmpty('Owner only','Only the club owner can create games.');return}
 const f=S.form;if(!f){initGameForm(tour?'CREATE_TOURNAMENT':'CREATE_CASH');return}
 const fields=tour?[
 ['Name',f.name,()=>open('edit',{title:'Tournament Name',value:f.name,onSave:v=>f.name=v})],
 ['Game Type',"Hold’em",null],['Table Size','6 Max',null],
 ['Buy-in',f.fee,()=>chooseSetting('Buy-in','fee',[0,50,100,200,500])],
 ['Starting Chips',f.starting,()=>chooseSetting('Starting Chips','starting',[1500,3000,5000,10000])],
 ['Starting Blinds',f.blind+' / '+f.blind*2,()=>chooseSetting('Starting Blinds','blind',[5,10,25,50])],
 ['Level Duration',f.levelMinutes+' min',()=>chooseSetting('Level Duration','levelMinutes',[3,5,8,10])],
 ['Guaranteed Prize',f.prize,()=>chooseSetting('Guaranteed Prize','prize',[300,600,1200,3000])]
 ]:[
 ['Name',f.name,()=>open('edit',{title:'Table Name',value:f.name,onSave:v=>f.name=v})],['Game Type',"Hold’em",null],['Table Size','6 Max',null],
 ['Blinds',f.blind+' / '+f.blind*2,()=>chooseSetting('Blinds','blind',[1,2,5,10,25,50])],
 ['Min Buy-in',f.minBB+' BB',()=>chooseSetting('Min Buy-in','minBB',[20,40,60,100])],
 ['Max Buy-in',f.maxBB+' BB',()=>chooseSetting('Max Buy-in','maxBB',[100,200,300])],
 ['Action Time',f.actionTime+' sec',()=>chooseSetting('Action Time','actionTime',[15,20,25,30])],
 ['Game Duration',f.duration+' min',()=>chooseSetting('Game Duration','duration',[60,120,240])]
 ];
 fields.forEach(([label,value,fn],i)=>{const y=128+i*106;text(label,29,y+29,21,P.muted);text(value,fn?650:690,y+29,24,P.light,'right',500,396);if(fn){glyph('arrow',682,y+29,18,P.muted);hit('setting-'+i,label,24,y,672,91,fn)}line(28,y+82,692,y+82,P.line)});
 if(S.data.error)text(S.data.error,28,1047,20,'#ff7777');
 primary('create-submit','CREATE',()=>{
  if(!f.name.trim()||f.name.length>32){S.data.error='Enter a name (1–32 characters).';invalidate();return}
  if(!tour&&f.minBB>f.maxBB){S.data.error='Minimum buy-in cannot exceed maximum.';invalidate();return}
  const id='local-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*999);
  if(tour)user.tournaments.push({...f,id,club:S.club,mode:0,registered:0,status:'Registering'});
  else user.customRooms.push({...f,id,club:S.club,mode:0,seated:0,ante:0});
  save();S.routes=S.routes.filter(r=>!['CREATE_CASH','CREATE_TOURNAMENT','CREATE_GAME'].includes(r.page));while(['CLUB','TABLES','EVENTS'].includes(S.routes.at(-1)?.page))S.routes.pop();go('CLUB',{},true);S.tab=tour?'MTT':'NLH';notify(tour?'Tournament created':'Table created');
 });
}
function membersPage(){
 appHeader('MEMBERS');const rows=clubMembers(S.club);text('Members ('+rows.length+')',28,142,23,P.text);
 list(181,1155,rows,112,(r,y)=>{avatar(62,y+51,59,r.name);text(r.id===user.id?user.name:r.name,112,y+32,24,P.light);text('ID '+r.id+' · '+r.role,112,y+69,17,P.muted);circle(676,y+51,6,r.online?'#88bb42':'#666');line(28,y+110,692,y+110,P.line);hit('member-'+r.id,'Member '+r.name,24,y,674,110,()=>go('MEMBER',{id:r.id}))});
}
function memberPage(){
 const m=clubMembers(S.club).find(m=>m.id===S.data.id)||clubMembers(S.club)[0];appHeader('MEMBER DETAIL');avatar(360,185,96,m.name);text(m.name,360,270,29,P.light,'center',650);text('ID : '+m.id,360,311,20,P.muted,'center');
 detailRows([['Role',m.role],['Chips',money(m.id===user.id?balance():m.chips)]],385);
 if(m.id===user.id){rowLink('member-history','Hand History',555,()=>go('HISTORY'));rowLink('member-stats','Career Statistics',642,()=>go('STATS'))}
 else if(clubById(S.club)?.owner){rowLink('member-role','Role',555,()=>open('choice',{title:'Role',values:['Member','Manager'],value:m.role,onSelect:v=>{m.role=v;save()}}));rowLink('member-chips','Adjust Chips',642,()=>open('edit',{title:'Member Chips',value:String(m.chips),numeric:true,onSave:v=>{m.chips=Math.max(0,Number(v)||0);save()}}))}
}
function rowLink(id,label,y,fn,sub=''){
 text(label,29,y+35,24,P.light);if(sub)text(sub,650,y+35,19,P.muted,'right');glyph('arrow',685,y+35,18,P.muted);line(28,y+78,692,y+78,P.line);hit(id,label,20,y,680,80,fn);
}
function managementPage(){
 const c=clubById(S.club);appHeader('CLUB MANAGEMENT');
 detailRows([['Club Name',c.name],['Club ID',c.id],['Role',c.owner?'Owner':'Member']],153);
 rowLink('manage-members','Members',386,()=>go('MEMBERS'));
 if(c.owner){
 rowLink('manage-notice','Club Notice',475,()=>open('edit',{title:'Club Notice',value:c.notice||'',max:120,onSave:v=>{user.clubEdits[c.id]={...user.clubEdits[c.id],notice:v};save()}}));
 rowLink('manage-name','Club Name',564,()=>open('edit',{title:'Club Name',value:c.name,max:24,onSave:v=>{if(v.trim()){user.clubEdits[c.id]={...user.clubEdits[c.id],name:v};save()}}}));
 rowLink('manage-create','Create Game',653,()=>go('CREATE_GAME'));
 }
 rowLink('manage-history','Hand History',c.owner?742:475,()=>go('HISTORY'));
 rowLink('manage-stats','Career Statistics',c.owner?831:564,()=>go('STATS'));
 if(!c.owner)primary('quit-club','QUIT CLUB',()=>open('quitClub'));
}
function profilePage(){
 appHeader('MY ACCOUNT');avatar(360,197,116);text(user.name,360,300,31,P.light,'center',650);
 rowLink('rename','Nickname',366,()=>open('edit',{title:'Nickname',value:user.name,max:16,onSave:v=>{if(v.length>=2){user.name=v;save()}}}),user.name);
 detailRows([['Player ID',user.id]],500);
}
function mePage(){
 appHeader('ME',{backward:false});avatar(65,157,70);text(user.name,118,143,27,P.light,'left',600);text('ID : '+user.id,118,179,18,P.muted);
 const rows=[['My Account',()=>go('PROFILE')],['Hand History',()=>{S.club=null;go('HISTORY')}],['Career Statistics',()=>{S.club=null;go('STATS')}],['Game Settings',()=>settingsPageOpen()]];
 rows.forEach(([name,fn],i)=>rowLink('me-'+i,name,249+i*102,fn));
 text('ClubGG · H5 Prototype',360,1048,22,P.muted,'center');text('Local experience · no account connection',360,1093,17,P.muted,'center');bottomMain();
}
function settingsPageOpen(){S.settingsDraft={...user.settings,sound:user.sound,fourColor:tablePrefs.fourColor,squeeze:tablePrefs.squeeze};go('SETTINGS')}
function settingsPage(){
 appHeader('GAME SETTINGS');const d=S.settingsDraft||{...user.settings,sound:user.sound,fourColor:tablePrefs.fourColor,squeeze:tablePrefs.squeeze};S.settingsDraft=d;
 [['Sound Effects','sound'],['Vibration','vibration'],['Chips Display (Big Blinds)','bb'],['Smart Focus','smartFocus']].forEach(([label,k],i)=>{
  const y=139+i*107;text(label,29,y+31,23,P.light);const on=d[k];rect(605,y+12,86,43,on?'#10b96e':'#bdc3c8',23);circle(627+(on?42:0),y+33,19,'#fff');line(28,y+83,692,y+83,P.line);
  hit('pref-'+k,label,25,y,672,94,()=>{d[k]=!d[k];invalidate()});
 });
 rowLink('auto-top','Auto Top Up',570,()=>open('choice',{title:'Auto Top Up',values:[0,50,100],labels:['OFF','50%','100%'],value:d.autoTop,onSelect:v=>d.autoTop=v}),d.autoTop?d.autoTop+'%':'OFF');
 rowLink('bet-prefs','Customize Betting Buttons',662,()=>open('betPrefs'));
 text('Cards',28,790,24,P.light);border(146,837,428,152,'#d4d8dd',18);
 [12,25,38,51].forEach((c,i)=>{const before=tablePrefs.fourColor;tablePrefs.fourColor=d.fourColor;liveCard(c,211+i*100,900,72,99);tablePrefs.fourColor=before});
 text(d.fourColor?'SET 2 · FOUR COLOR':'SET 1 · TWO COLOR',360,1018,18,P.muted,'center');
 glyph('back',74,911,24,P.muted);glyph('arrow',646,911,24,P.muted);hit('cards-switch','Change Cards',23,829,674,224,()=>{d.fourColor=!d.fourColor;invalidate()});
 primary('settings-confirm','CONFIRM',()=>{user.sound=d.sound;user.settings={...user.settings,bb:d.bb,vibration:d.vibration,smartFocus:d.smartFocus,autoTop:d.autoTop,bet:d.bet||user.settings.bet};tablePrefs.fourColor=d.fourColor;saveTablePrefs();save();back()});
}
function statsPage(){
 appHeader('CAREER STATISTICS');const st=S.club?clubStats(S.club):Object.values(user.stats).reduce((a,b)=>{for(const k of Object.keys(a))a[k]+=Number(b[k])||0;return a},clubStats('__empty__'));
 const pct=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';text(S.club?clubById(S.club)?.name:'All Clubs',360,147,22,P.muted,'center');
 [['Hands',st.hands],['Win',pct(st.wins,st.hands)],['VPIP',pct(st.vpip,st.hands)],['PFR',pct(st.pfr,st.hands)],['Went to Showdown',pct(st.showdowns,st.hands)],['Won at Showdown',pct(st.showWins,st.showdowns)]].forEach(([k,v],i)=>{
  const x=28+i%2*344,y=208+Math.floor(i/2)*222;rect(x,y,320,194,'#202023',10);text(k,x+160,y+47,20,P.muted,'center');text(v,x+160,y+117,43,P.light,'center',650);
 });text('Based on completed hands in this device',360,953,19,P.muted,'center');
}
function historyPage(){
 appHeader('HAND HISTORY');const rows=savedHands.filter(v=>!S.club||v.club===S.club);text(S.club?clubById(S.club)?.name:'All Clubs',28,143,22,P.muted);
 list(183,1198,rows,132,(v,y)=>{
  rect(28,y,664,119,'#222225',8);text('#'+v.hand+'  '+(v.room||'Hold’em'),44,y+28,22,P.light,'left',600,490);text((v.net>=0?'+':'')+money(v.net),674,y+30,25,v.net>=0?'#a4d141':'#ee7d79','right',650);
  v.cards.forEach((c,i)=>liveCard(c,66+i*47,y+82,38,52));text(new Date(v.at).toLocaleString(),167,y+82,17,P.muted,'left',400,490);
  hit('history-'+v.at+'-'+v.hand,'Hand '+v.hand,28,y,664,119,()=>open('handDetail',{record:v,logPage:0}));
 });
 if(!rows.length)screenEmpty('No hand history','Your completed hands will appear here.');
}
function tournamentBlind(r,level){return Math.max(1,Math.round(r.blind*Math.pow(1.5,level-1)))}
function startTournament(r){
 if(!user.registrations[r.id])return;const registration=user.registrations[r.id];
 if(registration.state==='finished'){notify('Tournament finished.');return}
 const room={...r,tournament:true,actionTime:25};beginTable(room,r.starting/(r.blind*2));tableSession.tournament=r;tableSession.tournamentStart=performance.now();tableSession.level=1;
 registration.state='playing';save();
}
function field(label,x,y,w,value,type='text',placeholder=''){
 const scale=stage.clientWidth/W;
 Object.assign(entry.style,{display:'block',left:x/W*100+'%',top:y/H*100+'%',width:w/W*100+'%',height:65/H*100+'%',fontSize:Math.max(16,23*scale)+'px',color:isDark()?'#eee':'#202630',background:isDark()?'#26262a':'#fff',borderColor:isDark()?'#505058':'#cdd4df'});
 entry.type='text';entry.inputMode=type==='number'?'numeric':'text';entry.maxLength=S.modal?.max||32;entry.placeholder=placeholder;entry.setAttribute('aria-label',label);
 const stamp=S.modal?.type+'|'+S.modal?.title+'|'+S.stack.length;if(formStamp!==stamp){entry.value=value||'';formStamp=stamp}
}
function handleSubmit(){
 const m=S.modal;if(m?.type!=='edit')return;
 const value=entry.value.trim();if(m.numeric&&!/^\d+$/.test(value)){m.error='Enter a number.';invalidate();return}
 if(!value){m.error='This field is required.';invalidate();return}
 m.onSave(value);back();
}
entry.addEventListener('input',()=>{if(S.modal){S.modal.value=entry.value;S.modal.error='';invalidate()}});
entry.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();handleSubmit()}if(e.key==='Escape'){e.preventDefault();back()}});
function sheetFrame(title,height=530){
 const y=1280-height,q=reduced?1:Math.min(1,(performance.now()-S.entered)/180);
 rect(0,0,720,1280,'#0009');rect(0,y+(1-q)*40,720,height+40,isDark()?'#202024':'#fff',22);rect(315,y+13,90,5,isDark()?'#5b5b60':'#d3d6dd',3);
 text(title,360,y+62,27,P.light,'center',600);glyph('close',673,y+60,22,P.muted);hit('sheet-close','Close',639,y+29,69,69,back);return y;
}
function modal(){
 const m=S.modal;
 if(m.type==='squeeze'){squeezeModal();return}
 if(m.type==='betKeypad'){
  const l=tableSession?.game.legal(0);if(!l){back();return}
  const y=sheetFrame('RAISE TO',652),v=Number(m.value)||0;
  rect(28,y+100,664,73,'#101215',7);text(m.value||'0',661,y+139,35,'#f0d277','right',650);
  const keys=['1','2','3','4','5','6','7','8','9','Clear','0','⌫'];
  keys.forEach((k,i)=>button('key-'+i,k,28+i%3*225,y+195+Math.floor(i/3)*77,213,65,()=>{
   if(k==='Clear')m.value='';else if(k==='⌫')m.value=m.value.slice(0,-1);else m.value=(m.value==='0'?'':m.value).slice(0,8)+k;invalidate();
  }));
  button('key-allin','ALL IN',28,y+516,188,51,()=>{m.value=String(l.max);invalidate()});
  text('Min '+Math.min(l.min,l.max)+' / Max '+l.max,682,y+540,19,P.muted,'right');
  button('key-bet','RAISE '+money(v),28,y+578,664,60,()=>{back();requestHeroAction('raise',v)},{primary:true,disabled:!Number.isInteger(v)||v>l.max||v<=tableSession.game.current||(v<l.min&&v!==l.max)});return;
 }
 if(m.type==='buyin'||m.type==='topup'){
  const top=m.type==='topup',r=top?tableSession.room:m.room,bb=r.blind*2,y=sheetFrame(top?'TOP UP':'BUY-IN',541),min=r.minBB||40,max=r.maxBB||200;
  m.buyBB=Math.max(min,Math.min(max,m.buyBB||100));
  text('Available Chips',28,y+123,22,P.muted);text(money(balance(r.club)),692,y+123,25,P.light,'right');
  text(money(m.buyBB*bb),360,y+211,47,P.light,'center',650);text(m.buyBB+' BB',360,y+255,21,P.muted,'center');
  [min,Math.max(min,Math.min(max,60)),Math.max(min,Math.min(max,100)),max].forEach((n,i)=>button('buy-'+i,n+' BB',28+i*170,y+299,154,57,()=>{m.buyBB=n;invalidate()},{primary:n===m.buyBB}));
  const current=top?tableSession.game.players[0].stack:0,cost=Math.max(0,m.buyBB*bb-current);
  button('buy-confirm','CONFIRM',28,y+431,664,74,()=>{if(top){adjustBalance(r.club,-cost);tableSession.game.players[0].stack+=cost;tableSession.invested+=cost;user.activeCash={club:r.club,stack:tableSession.game.players[0].stack};save();back()}else beginTable(r,m.buyBB)},{primary:true,disabled:cost>balance(r.club)||top&&!cost});
  return;
 }
 if(m.type==='clubMenu'||m.type==='tableMenu'){
  const table=m.type==='tableMenu',y=sheetFrame(table?'TABLE MENU':'CLUB MENU',table?605:514);
  const rows=table?[['Hand History',()=>{back();open('tableHistory')}],['Game Settings',()=>{back();settingsPageOpen()}],['Display in BB',()=>{user.settings.bb=!user.settings.bb;save();invalidate()}],['Top Up',()=>{back();if(tableSession.game.state==='done')open('topup',{buyBB:200});else notify('Top up after this hand.')}],['Exit Table',leaveTable]]:
  [['Members',()=>{closeAll();go('MEMBERS')}],['Admin',()=>{closeAll();go('MANAGEMENT')}],['Hand History',()=>{closeAll();go('HISTORY')}],['Career',()=>{closeAll();go('STATS')}]];
  rows.forEach(([label,fn],i)=>rowLink('menu-'+i,label,y+107+i*85,fn));return;
 }
 if(m.type==='choice'){
  const y=sheetFrame(m.title,Math.min(870,180+m.values.length*88));
  m.values.forEach((v,i)=>{const yy=y+107+i*83;text(m.labels?.[i]??v,35,yy+26,25,P.light);if(v===m.value)glyph('check',670,yy+26,23,P.gold);line(28,yy+67,692,yy+67,P.line);hit('choice-'+i,String(m.labels?.[i]??v),28,yy,664,70,()=>{m.onSelect(v);back()})});return;
 }
 if(['handDetail','tableHistory','confirmAllin','exitTable','tableSettings'].includes(m.type)){
  const y=m.type==='handDetail'?174:265,h=m.type==='handDetail'?954:755;
  rect(0,0,720,1280,'#000a');rect(24,y,672,h,'#232327',14);text(m.title||({handDetail:'HAND DETAIL',tableHistory:'HAND HISTORY',exitTable:'EXIT TABLE',tableSettings:'SETTINGS',confirmAllin:'ALL IN'})[m.type],55,y+45,25,'#fff','left',600);glyph('close',663,y+44,22,'#aaa');hit('close-modal','Close',629,y+13,66,65,back);tableModal(m,24,y,672,h);return;
 }
 const h=m.type==='edit'?440:m.type==='register'?590:440,y=sheetFrame(m.title||({register:'REGISTER',unregister:'UNREGISTER',quitClub:'QUIT CLUB',clubCreated:'CLUB CREATED'})[m.type]||'CLUB',h);
 if(m.type==='edit'){
  text(m.title,28,y+119,21,P.muted);field(m.title,28,y+153,664,m.value,m.numeric?'number':'text',m.title);
  if(m.error)text(m.error,28,y+253,20,'#e35e62');
  button('edit-save','CONFIRM',28,y+h-105,664,74,handleSubmit,{primary:true});return;
 }
 if(m.type==='register'){
  const r=m.tournament;detailRows([['Tournament',r.name],['Buy-in',money(r.fee)],['Available Chips',money(balance(r.club))]],y+140);
  button('register-confirm','REGISTER',28,y+h-109,664,75,()=>{
   if(user.registrations[r.id])return;
   if(balance(r.club)<r.fee){notify('Not enough chips');return}
   adjustBalance(r.club,-r.fee);user.registrations[r.id]={state:'registered',at:Date.now(),fee:r.fee};save();back();notify('Registration successful');
  },{primary:true,disabled:balance(r.club)<r.fee});return;
 }
 if(m.type==='unregister'){text('Cancel your registration?',360,y+152,27,P.light,'center');button('unregister-confirm','CONFIRM',28,y+h-106,664,74,()=>{
  const r=m.tournament,reg=user.registrations[r.id];if(reg&&reg.state==='registered'){adjustBalance(r.club,reg.fee);delete user.registrations[r.id];save();back()}else notify('This tournament has already started.');
 },{primary:true});return}
 if(m.type==='club-created'){const c=clubById(m.club);text(c.name,360,y+153,29,P.light,'center',600);text('Club ID : '+c.id,360,y+208,27,P.text,'center');button('created-enter','ENTER',28,y+h-106,664,74,()=>{closeAll();enterClub(c.id)},{primary:true});return}
 if(m.type==='quitClub'){text('Leave '+clubById(S.club)?.name+'?',360,y+158,26,P.light,'center');button('quit-confirm','CONFIRM',28,y+h-106,664,74,()=>{user.joined=user.joined.filter(id=>id!==S.club);save();S.club=null;S.routes=[];go('HOME',{},true)},{primary:true});return}
 if(m.type==='betPrefs'){
  text('Post-flop / facing a bet',28,y+118,21,P.muted);[.25,.33,.5,.66,.75,1].forEach((v,i)=>button('bet-size-'+i,Math.round(v*100)+'%',28+(i%3)*225,y+165+Math.floor(i/3)*71,213,57,()=>{const d=S.settingsDraft;d.bet=[.33,.5,.75,v];back()},{primary:true}));return;
 }
 text(m.body||'This view is not included in the club prototype.',360,y+159,21,P.text,'center',400,654);button('info-ok','OK',28,y+h-106,664,74,back,{primary:true});
}

// Poker engine and table view are provided by js/poker.js.

function syncControls(){
 const key=S.hits.map(h=>h.id+h.label+h.disabled).join('|');if(key===signature)return;signature=key;
 const frag=document.createDocumentFragment();
 S.hits.forEach(h=>{const b=document.createElement('button');b.type='button';b.tabIndex=-1;b.textContent=h.label;b.disabled=h.disabled;b.onclick=()=>activate(S.hits.find(v=>v.id===h.id));frag.append(b)});
 controls.replaceChildren(frag);
}

function render(now){
 raf=0;frameTime=now;ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);S.hits=[];S.viewport=null;palette();rect(0,0,W,H,P.bg);
 if(S.page==='PLAY')tablePage();
 else if(S.page==='HOME'||S.page==='CLUBS')home();
 else if(S.page==='JOIN')joinPage();
 else if(S.page==='CREATE_CLUB')createClubPage();
 else if(['CLUB','TABLES','EVENTS'].includes(S.page))clubPage();
 else if(S.page==='DETAIL')detailPage(false);
 else if(S.page==='TOURNAMENT')detailPage(true);
 else if(S.page==='CREATE_GAME')createGamePage();
 else if(S.page==='CREATE_CASH')createGameForm(false);
 else if(S.page==='CREATE_TOURNAMENT')createGameForm(true);
 else if(S.page==='MEMBERS')membersPage();
 else if(S.page==='MEMBER')memberPage();
 else if(S.page==='MANAGEMENT')managementPage();
 else if(S.page==='PROFILE')profilePage();
 else if(S.page==='SETTINGS')settingsPage();
 else if(S.page==='STATS')statsPage();
 else if(S.page==='HISTORY')historyPage();
 else mePage();
 if(!S.modal||S.modal.type!=='edit')entry.style.display='none';
 if(S.modal){S.hits=[];modal()}
 if(!savedOK){rect(0,0,720,22,'#a23a3a');text('Storage unavailable — changes last for this session only',360,11,13,'#fff','center')}
 if(S.toast&&now<S.toastUntil){rect(65,1071,590,66,'#303037f5',9);text(S.toast,360,1104,20,'#fff','center',500,554)}
 syncControls();
 if((S.modal&&!reduced&&now-S.entered<190)||(S.toast&&now<S.toastUntil)||(!reduced&&now<visualUntil))invalidate();
}

function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}}
function target(p){return [...S.hits].reverse().find(h=>!h.disabled&&p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h)}
function scrollArea(){return S.modal?null:S.viewport||null}
let pointer=null;
canvas.addEventListener('pointerdown',e=>{
 if(pointer)return;const p=point(e),area=scrollArea();pointer={id:e.pointerId,start:p,last:p,drag:false,scroll:area&&p.y>=area[0]&&p.y<=area[1]};
 S.pressed=target(p)?.id||null;pointer.carousel=(S.page==='HOME'||S.page==='CLUBS')&&!S.modal&&p.y>300&&p.y<930;S.keyboard=false;canvas.setPointerCapture(e.pointerId);animate(350);
 if(S.pressed?.startsWith('squeeze-card-')){
  pointer.squeeze=Number(S.pressed.slice(-1));pointer.peekStart=tableSession.peek[pointer.squeeze];pointer.sounded=false;sound('peel');
 }
 if(S.pressed==='bet-hold'){pointer.betHold=true;pointer.betCancelled=false;setRaise(Math.min(tableSession.game.legal(0).min,tableSession.game.legal(0).max))}
 if(S.pressed==='raise-track'){pointer.slider=true;const l=tableSession.game.legal(0);setRaise(Math.min(l.min,l.max)+(l.max-Math.min(l.min,l.max))*Math.max(0,Math.min(1,(p.x-96)/528)))}
});
canvas.addEventListener('pointermove',e=>{
 const p=point(e);if(pointer?.id===e.pointerId){if(Math.hypot(p.x-pointer.start.x,p.y-pointer.start.y)>9){pointer.drag=true;S.pressed=null}
 if(pointer.squeeze!==undefined&&tableSession){
  const i=pointer.squeeze;if(!tableSession.revealed[i]){tableSession.peek[i]=Math.max(0,Math.min(1,pointer.peekStart+(pointer.start.y-p.y)/280));if(tableSession.peek[i]>.4&&!pointer.sounded){sound('peel');pointer.sounded=true}invalidate()}
 }
 if(pointer.betHold){const l=tableSession?.game.legal(0);if(l){pointer.betCancelled=p.y>pointer.start.y+35;const f=Math.max(0,Math.min(1,(pointer.start.y-p.y)/350));setRaise(Math.min(l.min,l.max)+(l.max-Math.min(l.min,l.max))*f);invalidate()}}
 if(pointer.slider){const l=tableSession?.game.legal(0);if(l)setRaise(Math.min(l.min,l.max)+(l.max-Math.min(l.min,l.max))*Math.max(0,Math.min(1,(p.x-96)/528)))}
 if(pointer.drag&&pointer.scroll){S.scroll-=p.y-pointer.last.y;invalidate()}pointer.last=p;
 }else {const h=target(p);canvas.style.cursor=h?'pointer':'default';if(S.hover!==h?.id){S.hover=h?.id||null;animate(350)}}
});
canvas.addEventListener('pointerup',e=>{
 if(pointer?.id!==e.pointerId)return;
 if(pointer.betHold){const cancelled=pointer.betCancelled,v=tableSession?.raiseTo;pointer=null;S.pressed=null;if(!cancelled)requestHeroAction('raise',v);invalidate();return}
 if(pointer.squeeze!==undefined){settlePeel(pointer.squeeze);pointer=null;S.pressed=null;invalidate();return}
 if(pointer.carousel&&pointer.drag){const dx=point(e).x-pointer.start.x;if(Math.abs(dx)>45)S.clubSlide=Math.max(0,Math.min(myClubs().length,S.clubSlide+(dx<0?1:-1)));pointer=null;S.pressed=null;invalidate();return}
 if(S.page==='PLAY'&&!S.modal&&pointer.drag&&pointer.start.y>950&&point(e).y-pointer.start.y<-100){pointer=null;S.pressed=null;open('tableMenu');return}
 const h=target(point(e)),ok=!pointer.drag&&h?.id===S.pressed;pointer=null;S.pressed=null;if(ok)activate(h);invalidate();
});
function settlePeel(i,force=false){
 const t=tableSession;if(!t||t.revealed[i])return;
 if(!force&&t.peek[i]>.84){revealHole(i);return}
 const from=t.peek[i],start=performance.now();t.peelVersion=(t.peelVersion||0)+1;const ver=t.peelVersion;
 const step=now=>{if(t!==tableSession||t.peelVersion!==ver||t.revealed[i]||pointer?.squeeze===i)return;const q=Math.min(1,(now-start)/190);t.peek[i]=from*(1-q)**3;invalidate();if(q<1)requestAnimationFrame(step)};
 requestAnimationFrame(step);
}
function cancel(){const i=pointer?.squeeze;pointer=null;S.pressed=null;if(i!==undefined)settlePeel(i,true);invalidate()}
canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',()=>{if(pointer)cancel()});
canvas.addEventListener('pointerleave',()=>{S.hover=null;invalidate()});
canvas.addEventListener('wheel',e=>{if(scrollArea()){e.preventDefault();S.scroll+=e.deltaY*(e.deltaMode===1?16:1);invalidate()}},{passive:false});
canvas.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();if(S.modal)back();else if(S.page==='PLAY')tableBack();else back()}
 if(e.key==='Tab'){e.preventDefault();const a=S.hits.filter(h=>!h.disabled),i=a.findIndex(h=>h.id===S.focus);S.focus=a[(i+(e.shiftKey?-1:1)+a.length)%a.length]?.id;S.keyboard=true;invalidate()}
 if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(S.hits.find(h=>h.id===S.focus))}
 if((e.key==='ArrowDown'||e.key==='ArrowUp')&&scrollArea()){e.preventDefault();S.scroll+=e.key==='ArrowDown'?100:-100;invalidate()}
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){cancel();cancelAnimationFrame(raf);raf=0;clearTimeout(tableTimer);tableTimer=0;if(audio?.state==='running')audio.suspend().catch(()=>{})}
 else {if(tableSession)tableSession.clockTick=performance.now();invalidate();if(S.page==='PLAY')scheduleTable()}
});
// Built-in imagegen raster art: retired. UI is rendered by Canvas; public ClubGG app icon below.
// See REFERENCE.md for reference sources and prototype limitations.
const clubIcon=new Image();clubIcon.onload=()=>invalidate();clubIcon.src='assets/club-app-icon.png';
resize();
