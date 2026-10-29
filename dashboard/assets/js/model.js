/* StoreGA · data model: store simulator, sensor fusion, alerts and the MQTT bridge to Node-RED.
   The simulator mirrors what the real ESP32 nodes publish, so every page works with or without hardware. */
/* ================= model ================= */
const ZONES=[
  {id:'A',name:'新品展示區',node:'zone-A',radar:true, x0:-12.5,x1:-1,z0:-8.5,z1:-.5,dwell:[180,600],color:'#3366E6'},
  {id:'B',name:'服飾區',    node:'zone-B',radar:true, x0:1,x1:12.5,z0:-8.5,z1:-.5,dwell:[240,900],color:'#9450D8'},
  {id:'C',name:'3C 配件區', node:'zone-C',radar:false,x0:-12.5,x1:-1,z0:.5,z1:8.5,dwell:[180,540],color:'#0E9C8A'},
  {id:'D',name:'結帳區',    node:'zone-D',radar:true, x0:6,x1:12.5,z0:.5,z1:8.5,dwell:[60,150],color:'#5E9A1F'},
];
const ZMAP=Object.fromEntries(ZONES.map(z=>[z.id,z]));
const OPEN=10*3600, CLOSE=22*3600;
const lam=h=>(h<10||h>=22)?0:1.5*(0.35+0.55*gauss(h,12.6,1.1)+0.8*gauss(h,18.6,1.3));
const CUM=[0];for(let m=0;m<720;m++)CUM.push(CUM[m]+lam(10+m/60));
const cumFrac=t=>CUM[clamp(Math.floor((t-OPEN)/60),0,720)]/CUM[720];
const NODE_DEFS=[
  {id:'entry-01',role:'入口節點',ip:'192.168.50.21',fw:'1.4.2',parts:'紅外線×2 · RFID · TM1637 · WS2812 · SG90 · DHT11'},
  {id:'zone-A',role:'分區節點',ip:'192.168.50.31',fw:'1.3.8',parts:'Wi-Fi 監聽 · LD2410 雷達'},
  {id:'zone-B',role:'分區節點',ip:'192.168.50.32',fw:'1.3.8',parts:'Wi-Fi 監聽 · LD2410 雷達'},
  {id:'zone-C',role:'分區節點',ip:'192.168.50.33',fw:'1.3.8',parts:'Wi-Fi 監聽（未裝雷達）'},
  {id:'zone-D',role:'分區節點',ip:'192.168.50.34',fw:'1.3.8',parts:'Wi-Fi 監聽 · LD2410 雷達'},
];
const SCN={
  normal:{name:'正常營運',icon:'store',desc:'依時段產生人流，午餐與下班各一波高峰。'},
  surge:{name:'人潮湧入',icon:'users',desc:'到客率提高 4.5 倍，展示限流閘門與燈條。'},
  fault:{name:'節點故障',icon:'plug',desc:'zone-B 停止回報，15 秒後判定離線。'},
  noise:{name:'Wi-Fi 雜訊',icon:'wifi',desc:'A、C 區混入路過裝置，看雷達與 k 值修正。'},
};

let S;
function freshState(){
  R=mulberry32(20261028);
  const nodes={};
  NODE_DEFS.forEach((d,i)=>nodes[d.id]={...d,rssi:-50-i*4,rssiHist:[],lastSeen:OPEN,online:true,fault:false,rebootUntil:0,blinkUntil:0,boot:OPEN-3600*3-i*977,confirmUntil:0});
  const zones={};ZONES.forEach(z=>zones[z.id]={truth:0,raw:0,est:0,presence:false,moving:false,dwellSum:0,dwellN:0,stale:false,hist:[]});
  const hourly=Array.from({length:12},(_,i)=>({h:10+i,entries:0,checkouts:0,errRaw:0,errEst:0,base:0,zsum:{A:0,B:0,C:0,D:0},zn:0}));
  const wr=mulberry32(7741),days=[],d0=new Date();d0.setHours(12,0,0,0);const wk='日一二三四五六';
  for(let i=6;i>=1;i--){const d=new Date(d0-i*864e5),we=d.getDay()===0||d.getDay()===6,e=Math.round((we?820:640)+wr()*120);days.push({label:`${d.getMonth()+1}/${d.getDate()}`,sub:`週${wk[d.getDay()]}`,entries:e,checkouts:Math.round(e*(.33+wr()*.07))})}
  return {t:OPEN,speed:10,paused:false,source:'sim',scenario:'normal',capacity:40,threshold:14,gateMode:'auto',gateOpen:true,
    k:.62,kAuto:true,whitelist:true,queue:0,agents:[],nextId:1,nodes,zones,hourly,days,series:[],alerts:[],alertLast:{},alertId:1,alertVer:0,
    today:{entries:0,exits:0,checkouts:0,engaged:0,long:0,reachedD:0,dwellSum:0,dwellN:0,balked:0,errRaw:0,errEst:0,base:0},
    temp:24.2,hum:60,acc5:0,acc60:0,preroll:true,fx:[],lastData:performance.now(),sumRaw:0,sumEst:0,
    upt:[],uptCur:0,notify:{crit:true,warn:true,info:false}};
}
const occ=()=>S.source==='sim'?S.agents.length:(S.mqttOcc||0);
const hourAt=t=>S.hourly[clamp(Math.floor(t/3600)-10,0,11)];

/* ================= simulator ================= */
function enter(){
  S.today.entries++;hourAt(S.t).entries++;
  const pool=['A','B','C'].sort(()=>R()-.5).slice(0,1+Math.floor(R()*3));
  const plan=R()<.38?[...pool,'D']:pool;
  S.agents.push({id:S.nextId++,plan,i:0,zone:null,phase:'walk',until:S.t+15+R()*25,enteredAt:S.t,inZone:0});rlog('in','進場',`場內 ${S.agents.length}`);
}
function admit(){
  const can=()=>S.gateMode==='open'||(S.gateMode==='auto'&&occ()<S.capacity);
  while(S.queue>0&&can()){S.queue--;enter()}
  if(S.queue>14){S.today.balked+=S.queue-14;S.queue=14}
  S.gateOpen=can();
}
function simStep(dt){
  S.t+=dt;
  let l=lam(S.t/3600);if(S.scenario==='surge')l*=4.5;
  S.queue+=poisson(l/60*dt);admit();
  for(let i=S.agents.length-1;i>=0;i--){
    const a=S.agents[i];if(S.t<a.until)continue;
    if(a.phase==='walk'){
      a.phase='dwell';a.zone=a.plan[a.i];const [lo,hi]=ZMAP[a.zone].dwell;a.until=S.t+lo+R()*(hi-lo);a.dwellStart=S.t;
      if(!a.engaged){a.engaged=true;S.today.engaged++}
      if(a.zone==='D'&&!a.reachedD){a.reachedD=true;S.today.reachedD++}
    }else if(a.phase==='dwell'){
      const d=S.t-a.dwellStart,z=S.zones[a.zone];z.dwellSum+=d;z.dwellN++;a.inZone+=d;
      if(!a.long&&a.inZone>=600){a.long=true;S.today.long++}
      if(a.zone==='D'){S.today.checkouts++;hourAt(S.t).checkouts++;a.paid=true;rlog('pay','RFID 結帳',`第 ${S.today.checkouts} 筆`)}
      a.zone=null;a.i++;
      if(a.i<a.plan.length){a.phase='walk';a.until=S.t+15+R()*30}else{a.phase='leave';a.until=S.t+20+R()*25}
    }else{S.agents.splice(i,1);S.today.exits++;S.today.dwellSum+=S.t-a.enteredAt;S.today.dwellN++;{const hr=hourAt(S.t);hr.dw=(hr.dw||0)+S.t-a.enteredAt;hr.dn=(hr.dn||0)+1}rlog('out','離場',`場內 ${S.agents.length}`)}
  }
  admit();
  S.acc5+=dt;while(S.acc5>=5){S.acc5-=5;sample()}
  S.acc60+=dt;while(S.acc60>=60){S.acc60-=60;minute()}
}
function sample(){
  ZONES.forEach(z=>S.zones[z.id].truth=0);
  S.agents.forEach(a=>{if(a.phase==='dwell')S.zones[a.zone].truth++});
  const now=performance.now();
  for(const d of NODE_DEFS){
    const n=S.nodes[d.id];if(n.fault||n.rebootUntil>now)continue;
    n.lastSeen=S.t;n.rssi=clamp(Math.round(n.rssi+(R()-.5)*4),-82,-41);
    if(d.id==='entry-01'){S.temp=clamp(S.temp+(R()-.5)*.12+(occ()/S.capacity-.5)*.02,22,33);S.hum=clamp(S.hum+(R()-.5)*.6,45,75);continue}
    const zid=d.id.slice(-1),z=S.zones[zid],zd=ZMAP[zid];
    let raw=z.truth*(1.45+R()*.3)+poisson(.8);
    if(!S.whitelist){if(zid==='D')raw+=2;if(zid==='B')raw+=1}
    if(zid==='C')raw+=poisson(1.1);
    if(S.scenario==='noise'&&(zid==='A'||zid==='C'))raw+=poisson(7);
    z.raw=Math.round(raw);
    if(zd.radar){z.presence=z.truth>0||R()<.03;z.moving=z.presence&&R()<.7}
    if(!S.preroll){S.fx.push({type:'wifi',node:d.id});logMsg(`sga/${d.id}/wifi`,{raw:z.raw});if(zd.radar)logMsg(`sga/${d.id}/radar`,{presence:z.presence,moving:z.moving})}
  }
  if(!S.preroll){const o=occ();logMsg('sga/entry-01/counter',{in:S.today.entries,out:S.today.exits,occupancy:o,queue:S.queue,checkout:S.today.checkouts,gate:S.gateOpen,temp:+S.temp.toFixed(1),hum:Math.round(S.hum)});
    const d=NODE_DEFS[(S.msgSeq=(S.msgSeq||0)+1)%NODE_DEFS.length],n=S.nodes[d.id];if(n.online)logMsg(`sga/${d.id}/status`,{rssi:n.rssi,ip:n.ip,fw:n.fw,uptime:Math.round(S.t-n.boot)})}
  fuse();
  const hr=hourAt(S.t);ZONES.forEach(z=>hr.zsum[z.id]+=S.source==='sim'?S.zones[z.id].truth:S.zones[z.id].est);hr.zn++;
}
function fuse(){
  let sR=0,sE=0;
  for(const zd of ZONES){const z=S.zones[zd.id],n=S.nodes[zd.node];z.stale=!n.online;z.est=(zd.radar&&!z.presence)?0:Math.round(z.raw*S.k);if(!z.stale){sR+=z.raw;sE+=z.est}}
  S.sumRaw=sR;S.sumEst=sE;const o=occ();
  if(o>0){const hr=hourAt(S.t),er=Math.abs(sR-o),ee=Math.abs(sE-o);hr.errRaw+=er;hr.errEst+=ee;hr.base+=o;S.today.errRaw+=er;S.today.errEst+=ee;S.today.base+=o}
}
function minute(){
  S.series.push({t:S.t,occ:occ(),queue:S.queue,cap:S.capacity,gate:S.gateOpen,entries:S.today.entries,checkouts:S.today.checkouts,zones:Object.fromEntries(ZONES.map(z=>{const v=S.zones[z.id];return[z.id,[S.source==='sim'?v.truth:v.est,v.raw,v.est,v.stale?1:0]]}))});if(S.series.length>760)S.series.shift();
  ZONES.forEach(z=>{const h=S.zones[z.id].hist;h.push(S.zones[z.id].est);if(h.length>60)h.shift()});
  NODE_DEFS.forEach(d=>{const n=S.nodes[d.id],h=n.rssiHist;h.push(n.online?n.rssi:null);if(h.length>30)h.shift()});
  if(S.kAuto&&S.sumRaw>0&&occ()>0)S.k=clamp(S.k*.7+(occ()/S.sumRaw)*.3,.2,1.2);
  const slot=Math.floor((S.t-OPEN-1)/900);if(slot>=0&&slot<48&&(S.t-OPEN)%900<60){S.upt[slot]=S.uptCur;S.uptCur=0}
}
function calibrate(){
  if(!(S.sumRaw>0))return null;
  const before=S.k;S.k=clamp(occ()/S.sumRaw,.2,1.2);fuse();
  addAlert('cal','info','已重新校正 Wi-Fi 係數',`k ${before.toFixed(2)} → ${S.k.toFixed(2)}，以入口 ${occ()} 人為基準`,{cool:0});
  mqttCmd('entry-01',{action:'calibrate',k:+S.k.toFixed(3)});
  return {before,k:S.k,occ:occ(),raw:S.sumRaw};
}
function checkNodes(){
  const now=performance.now();
  for(const d of NODE_DEFS){
    const n=S.nodes[d.id],was=n.online;
    if(n.rebootUntil>0&&n.rebootUntil<=now&&!n.fault){n.rebootUntil=0;n.lastSeen=S.t;n.boot=S.t}
    n.online=n.rebootUntil<=now&&(S.t-n.lastSeen)<15;
    if(was&&!n.online&&n.rebootUntil<=now)addAlert('off-'+d.id,'crit',`${d.id} 離線`,`超過 15 秒沒有心跳，${d.role}資料暫停更新。`,{cool:0,target:{view:'devices',node:d.id}});
    if(!was&&n.online)addAlert('on-'+d.id,'info',`${d.id} 恢復連線`,`訊號 ${n.rssi} dBm`,{cool:0,target:{view:'devices',node:d.id}});
    if(!n.online)S.uptCur=2;else if(n.rssi<-80||n.rebootUntil>now)S.uptCur=Math.max(S.uptCur,1);
  }
}
function checkAlerts(){
  const o=occ(),r=o/S.capacity;
  if(r>=1)addAlert('cap100','crit','已達人數上限，閘門關閉',`場內 ${o} / ${S.capacity} 人，門外排隊 ${S.queue} 人。`,{target:{view:'overview'}});
  else if(r>=.8)addAlert('cap80','warn','場內人數接近上限',`目前 ${o} / ${S.capacity} 人（${Math.round(r*100)}%）。`,{target:{view:'overview'}});
  for(const zd of ZONES){const z=S.zones[zd.id];if(!z.stale&&z.est>S.threshold)addAlert('z-'+zd.id,'warn',`${zd.name}擁擠`,`校正後估計 ${z.est} 人，門檻 ${S.threshold} 人。`,{target:{view:'live',zone:zd.id}})}
  if(S.temp>=30)addAlert('temp','warn','入口溫度偏高',`DHT11 讀值 ${S.temp.toFixed(1)}°C。`);
}
function addAlert(key,level,title,detail,{cool=900,target=null}={}){
  const last=S.alertLast[key];if(cool&&last!=null&&S.t-last<cool)return;
  S.alertLast[key]=S.t;S.alerts.unshift({id:S.alertId++,t:S.t,level,title,detail,target,ack:S.preroll});
  if(S.alerts.length>250)S.alerts.pop();S.alertVer++;rlog(level,title,'');
  if(!S.preroll){if(S.notify[level])toast(level,title,detail,target?{label:'查看',fn:()=>goTarget(target)}:null);if(level!=='info')announce(`${level==='crit'?'嚴重告警':'警告'}：${title}`);onAlert(S.alerts[0])}
}
/* ================= MQTT bridge (Aedes in Node-RED, WebSocket) =================
   Topics (all JSON):
     sga/entry-01/counter  {in,out,occupancy,queue,checkout,gate,temp,hum,dwell_avg}
     sga/zone-X/wifi       {raw,dwell_avg}        (MACs are salted + SHA-256 hashed on the board)
     sga/zone-X/radar      {presence,moving}
     sga/<node>/status     {rssi,ip,fw,uptime}
     sga/<node>/cmd        ← {action:'gate'|'capacity'|'calibrate'|'blink'|'reboot', ...}   */
let client=null,onLiveReset;
function loadMqtt(){return new Promise((res,rej)=>{if(window.mqtt)return res();const s=document.createElement('script');s.src='https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';s.onload=res;s.onerror=()=>rej();document.head.appendChild(s)})}
async function mqttConnect(url){
  if(!/^wss?:\/\/[^\s/:]+(:\d{2,5})?\/?$/.test(url)){onMqtt.status('err','');return}
  onMqtt.status('busy','正在連線到 '+url);
  try{await loadMqtt()}catch{onMqtt.status('err','mqtt.js 載入失敗，請確認電腦有網路。');return}
  if(client){client.end(true);client=null}
  client=window.mqtt.connect(url,{reconnectPeriod:3000,connectTimeout:6000,clientId:'storega-ui-'+Math.random().toString(16).slice(2,8)});
  client.on('connect',()=>{client.subscribe('sga/+/+');if(S.source!=='mqtt')resetForLive();setSource('mqtt');store.set('mqttUrl',url);onMqtt.status('ok','已連線 · 訂閱 sga/+/+')});
  client.on('error',e=>onMqtt.status('err',`連線失敗：${e.message}。請確認 Aedes 的 WebSocket 埠已開啟、電腦與 ESP32 在同一個網路。`));
  client.on('close',()=>{if(S.source==='mqtt')onMqtt.status('busy','連線中斷，3 秒後自動重試…')});
  client.on('message',(topic,buf)=>{let m;try{m=JSON.parse(buf.toString())}catch{return}if(!S.paused)onMqtt(topic,m)});
}
function onMqtt(topic,m){
  const [,id,kind]=topic.split('/'),n=S.nodes[id];if(!n)return;
  S.lastData=performance.now();logMsg(topic,m,'in');
  if(m.online===false){n.lastSeen=S.t-99;return}  /* MQTT last will: the board dropped off the network */
  n.lastSeen=S.t;
  if(m.rssi!=null)n.rssi=m.rssi;if(m.ip)n.ip=m.ip;if(m.fw)n.fw=m.fw;if(m.uptime!=null)n.boot=S.t-m.uptime;
  if(kind==='counter'){
    if(m.in!=null){const d=m.in-(S.mqIn??m.in);if(d>0){hourAt(S.t).entries+=d;S.fx.push({type:'door'})}S.mqIn=m.in;S.today.entries=m.in}
    if(m.out!=null)S.today.exits=m.out;
    if(m.checkout!=null){const d=m.checkout-(S.mqCo??m.checkout);if(d>0){hourAt(S.t).checkouts+=d;S.fx.push({type:'pay'})}S.mqCo=m.checkout;S.today.checkouts=m.checkout}
    if(m.occupancy!=null)S.mqttOcc=m.occupancy;if(m.queue!=null)S.queue=m.queue;
    if(m.temp!=null)S.temp=m.temp;if(m.hum!=null)S.hum=m.hum;
    S.gateOpen=m.gate!=null?!!m.gate:(S.gateMode==='open'||(S.gateMode==='auto'&&occ()<S.capacity));
    if(m.dwell_avg!=null){S.today.dwellSum=m.dwell_avg;S.today.dwellN=1}
    if(['auto','open','closed'].includes(m.mode))S.gateMode=m.mode;if(m.capacity>=10&&m.capacity<=80)S.capacity=m.capacity;
  }else{
    const z=S.zones[id.slice(-1)];if(!z)return;
    if(kind==='wifi'){if(m.raw!=null)z.raw=m.raw;if(m.dwell_avg!=null){z.dwellSum=m.dwell_avg;z.dwellN=1}S.fx.push({type:'wifi',node:id})}
    if(kind==='radar'){z.presence=!!m.presence;z.moving=!!m.moving}
  }
  fuse();
}
onMqtt.status=()=>{};
function mqttCmd(node,payload){logMsg(`sga/${node}/cmd`,payload,'out');if(client&&S.source==='mqtt')client.publish(`sga/${node}/cmd`,JSON.stringify(payload))}
/* every message in or out, newest first; the 裝置 page shows it as a live console */
function logMsg(topic,obj,dir='in'){const L=S.msgs||(S.msgs=[]);L.unshift({t:S.t,wall:Date.now(),topic,dir,sim:S.source==='sim',body:JSON.stringify(obj)});if(L.length>300)L.length=300;S.msgCount=(S.msgCount||0)+1}
/* switching to real hardware: start today's numbers from zero at the real time of day (or 10:00 outside opening hours) */
function resetForLive(){
  const keep={speed:S.speed,capacity:S.capacity,threshold:S.threshold,gateMode:S.gateMode,whitelist:S.whitelist,kAuto:S.kAuto,notify:S.notify,k:S.k};
  S=freshState();Object.assign(S,keep);S.preroll=false;
  const d=new Date(),tod=d.getHours()*3600+d.getMinutes()*60+d.getSeconds();S.offHours=tod<OPEN||tod>=CLOSE;S.t=S.offHours?OPEN:tod;
  NODE_DEFS.forEach(x=>{S.nodes[x.id].lastSeen=S.t;S.nodes[x.id].rssiHist=[]});S.agents=[];S.alertVer++;onLiveReset();
}
onLiveReset=()=>{};
function setSource(src){
  S.source=src;
  if(src==='sim'&&client){client.end(true);client=null}
  onSource();
}

/* ================= clock ================= */
let lastTick=performance.now();
function tick(){
  const now=performance.now(),real=Math.min(1,(now-lastTick)/1000);lastTick=now;
  if(S.paused)return;
  if(S.source==='sim'){let d=real*S.speed;while(d>0){const st=Math.min(d,2);simStep(st);d-=st}S.lastData=now}
  else{S.t+=real;S.acc5+=real;if(S.acc5>=5){S.acc5-=5;const hr=hourAt(S.t);ZONES.forEach(z=>hr.zsum[z.id]+=S.zones[z.id].stale?0:S.zones[z.id].est);hr.zn++}
    S.acc60+=real;if(S.acc60>=60){S.acc60-=60;minute()}}
  checkNodes();checkAlerts();
}

/* ================= replay: any page can read "the shown moment" ================= */
let replayIdx=null;
const snap=()=>replayIdx!=null?S.series[replayIdx]:null;
const vOcc=()=>snap()?.occ??occ(), vCap=()=>snap()?.cap??S.capacity, vGate=()=>{const s=snap();return s?s.gate:S.gateOpen}, vQueue=()=>snap()?.queue??S.queue;
function idxAt(t){const s=S.series;if(!s.length)return null;let lo=0,hi=s.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(s[m].t<=t)lo=m;else hi=m-1}return lo}
const heatOf=z=>{if(z.stale)return'stale';const r=z.est/S.threshold;return r>1?'hot':r>.6?'warm':'cool'};
function zoneVals(zd){const sn=snap(),z=S.zones[zd.id];if(!sn||!sn.zones)return{est:z.est,raw:z.raw,stale:z.stale};const v=sn.zones[zd.id];return{est:v[2],raw:v[1],stale:!!v[3]}}
const yesterdayNow=()=>S.days.at(-1).entries*cumFrac(S.t);
const accNow=()=>S.today.base?Math.max(0,1-S.today.errEst/S.today.base):0;
const accRaw=()=>S.today.base?Math.max(0,1-S.today.errRaw/S.today.base):0;
const dwellMin=()=>S.today.dwellN?S.today.dwellSum/S.today.dwellN/60:0;
const peakToday=()=>{let p={occ:occ(),t:S.t};for(const s of S.series)if(s.occ>p.occ)p=s;return p};
function persist(){store.set('settings',{capacity:S.capacity,threshold:S.threshold,gateMode:S.gateMode,kAuto:S.kAuto,whitelist:S.whitelist,speed:S.speed,notify:S.notify})}

/* ================= export ================= */
function buildCSV(){
  const rows=[['小時','進場','結帳','轉換率','Wi-Fi 原始誤差','校正後誤差']];
  S.hourly.forEach(h=>rows.push([`${pad(h.h)}:00`,h.entries,h.checkouts,h.entries?(h.checkouts/h.entries*100).toFixed(1)+'%':'',h.base?(h.errRaw/h.base*100).toFixed(1)+'%':'',h.base?(h.errEst/h.base*100).toFixed(1)+'%':'']));
  rows.push([]);rows.push(['區域','平均停留(分)','目前原始','目前估計']);ZONES.forEach(zd=>{const z=S.zones[zd.id];rows.push([zd.name,z.dwellN?(z.dwellSum/z.dwellN/60).toFixed(1):'',z.raw,z.est])});
  rows.push([]);rows.push(['事件時間','等級','標題','說明','已處理']);S.alerts.forEach(a=>rows.push([hhmm(a.t),a.level,a.title,a.detail,a.ack?'是':'否']));
  return rows.map(r=>r.map(c=>/[",\n]/.test(String(c))?`"${String(c).replace(/"/g,'""')}"`:c).join(',')).join('\n');
}
function buildJSON(){return JSON.stringify({store:'信義旗艦店',date:new Date().toISOString().slice(0,10),time:hhmmss(S.t),capacity:S.capacity,threshold:S.threshold,k:+S.k.toFixed(3),
  today:S.today,hourly:S.hourly,series:S.series,alerts:S.alerts.map(a=>({t:hhmm(a.t),level:a.level,title:a.title,detail:a.detail,ack:a.ack})),
  nodes:NODE_DEFS.map(d=>{const n=S.nodes[d.id];return{id:d.id,online:n.online,rssi:n.rssi,ip:n.ip,fw:n.fw}})},null,2)}
