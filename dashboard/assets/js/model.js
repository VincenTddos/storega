/* StoreGA · data model: store simulator, sensor fusion, alerts, the MQTT bridge to Node-RED and the log.
   Two modes: 展示模式 (S.real=false) runs the simulator, which mirrors what the real ESP32 nodes publish;
   真實模式 (S.real=true) shows only what arrives over MQTT — nothing is invented, and today's numbers,
   past days and the log are kept in this browser's localStorage. */
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
function freshState(real=false){
  R=mulberry32(20261028);
  const nodes={};
  NODE_DEFS.forEach((d,i)=>nodes[d.id]=real
    ?{...d,ip:null,fw:null,rssi:null,rssiHist:[],lastSeen:-1e9,seen:false,online:false,fault:false,rebootUntil:0,blinkUntil:0,boot:null,confirmUntil:0}
    :{...d,rssi:-48-i*6,rssi0:-48-i*6,rssiHist:[],lastSeen:OPEN,seen:true,online:true,fault:false,rebootUntil:0,blinkUntil:0,boot:OPEN-3600*3-i*977,confirmUntil:0});
  const zones={};ZONES.forEach(z=>zones[z.id]={truth:0,raw:0,est:0,presence:false,moving:false,dwellSum:0,dwellN:0,stale:false,hist:[]});
  const hourly=Array.from({length:12},(_,i)=>({h:10+i,entries:0,checkouts:0,errRaw:0,errEst:0,base:0,zsum:{A:0,B:0,C:0,D:0},zn:0}));
  return {real,date:dayKey(),t:OPEN,speed:10,paused:false,source:real?'mqtt':'sim',scenario:'normal',capacity:40,threshold:14,gateMode:'auto',gateOpen:true,
    k:.62,kAuto:true,whitelist:true,queue:0,agents:[],nextId:1,nodes,zones,hourly,days:real?loadHistory().slice(-6):demoDays(),series:[],alerts:[],alertLast:{},alertId:1,alertVer:0,
    today:{entries:0,exits:0,checkouts:0,engaged:0,long:0,reachedD:0,dwellSum:0,dwellN:0,balked:0,errRaw:0,errEst:0,base:0},
    temp:real?null:24.2,hum:real?null:60,acc5:0,acc60:0,preroll:!real,fx:[],lastData:real?-1e9:performance.now(),sumRaw:0,sumEst:0,
    upt:[],uptCur:0,notify:{crit:true,warn:true,info:false},logs:[],logVer:0,conn:real?'idle':null};
}
/* 展示模式 only: six invented past days so the week chart has something to compare with */
function demoDays(){const wr=mulberry32(7741),days=[],d0=new Date();d0.setHours(12,0,0,0);const wk='日一二三四五六';
  for(let i=6;i>=1;i--){const d=new Date(d0-i*864e5),we=d.getDay()===0||d.getDay()===6,e=Math.round((we?820:640)+wr()*120);
    days.push({date:dayKey(d),label:`${d.getMonth()+1}/${d.getDate()}`,sub:`週${wk[d.getDay()]}`,entries:e,checkouts:Math.round(e*(.33+wr()*.07)),dwell:+(14+wr()*3).toFixed(1)})}
  return days}
const occ=()=>S.real?(S.mqttOcc||0):S.agents.length;
/* the hour bucket for time t; in 真實模式 anything outside 10:00–22:00 goes to a separate bucket instead of being filed under the first or last hour */
const hourAt=t=>{const i=Math.floor(t/3600)-10;if(S.real&&(i<0||i>11))return S.offHour||(S.offHour={h:-1,entries:0,checkouts:0,errRaw:0,errEst:0,base:0,zsum:{A:0,B:0,C:0,D:0},zn:0});return S.hourly[clamp(i,0,11)]};

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
  const was=S.gateOpen;S.gateOpen=can();if(was!==S.gateOpen)logGate();
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
    n.lastSeen=S.t;n.rssi=clamp(Math.round(n.rssi+(R()-.5)*4+(n.rssi0-n.rssi)*.08),-82,-41);
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
  const h=Math.floor(S.t/3600);if(S.t%3600<60&&h>10&&h<=22){const hr=S.hourly[h-11];slog('flow','info',`${pad(h-1)}:00–${pad(h)}:00 小時摘要`,`進場 ${hr.entries} · 結帳 ${hr.checkouts}${hr.entries?` · 轉換率 ${pct1(hr.checkouts/hr.entries)}%`:''}`)}
  S.series.push({t:S.t,occ:occ(),queue:S.queue,cap:S.capacity,gate:S.gateOpen,entries:S.today.entries,checkouts:S.today.checkouts,zones:Object.fromEntries(ZONES.map(z=>{const v=S.zones[z.id];return[z.id,[S.source==='sim'?v.truth:v.est,v.raw,v.est,v.stale?1:0]]}))});if(S.series.length>(S.real?1440:760))S.series.shift();
  ZONES.forEach(z=>{const h=S.zones[z.id].hist;h.push(S.zones[z.id].est);if(h.length>60)h.shift()});
  NODE_DEFS.forEach(d=>{const n=S.nodes[d.id],h=n.rssiHist;h.push(n.online?n.rssi:null);if(h.length>30)h.shift()});
  if(S.kAuto&&S.sumRaw>0&&occ()>0)S.k=clamp(S.k*.7+(occ()/S.sumRaw)*.3,.2,1.2);
  const slot=Math.floor((S.t-OPEN-1)/900);if(slot>=0&&slot<48&&(S.t-OPEN)%900<60){S.upt[slot]=S.uptCur;S.uptCur=0}
}
function calibrate(){
  if(!(S.sumRaw>0))return null;
  const before=S.k;S.k=clamp(occ()/S.sumRaw,.2,1.2);fuse();
  addAlert('cal','info','已重新校正 Wi-Fi 係數',`k ${before.toFixed(2)} → ${S.k.toFixed(2)}，以入口 ${occ()} 人為基準`,{cool:0,cat:'op'});
  mqttCmd('entry-01',{action:'calibrate',k:+S.k.toFixed(3)});
  return {before,k:S.k,occ:occ(),raw:S.sumRaw};
}
function checkNodes(){
  const now=performance.now();
  for(const d of NODE_DEFS){
    const n=S.nodes[d.id],was=n.online;
    if(n.rebootUntil>0&&n.rebootUntil<=now){n.rebootUntil=0;if(!S.real&&!n.fault){n.lastSeen=S.t;n.boot=S.t}}  // 真實模式 waits for the board's own heartbeat
    n.online=n.rebootUntil<=now&&(S.t-n.lastSeen)<15;
    if(was&&!n.online&&n.rebootUntil<=now)addAlert('off-'+d.id,'crit',`${d.id} 離線`,`${n.will?'broker 代為送出遺言（板子斷線）':'超過 15 秒沒有心跳'}，${d.role}資料暫停更新。`,{cool:0,target:{view:'devices',node:d.id}});
    if(was&&!n.online)n.dropped=true;
    if(!was&&n.online&&n.dropped&&(n.dropped=false,true))addAlert('on-'+d.id,'info',`${d.id} 恢復連線`,`訊號 ${n.rssi} dBm`,{cool:0,target:{view:'devices',node:d.id}});
    if(!n.online){if(n.seen)S.uptCur=2}else if(n.rssi<-80||n.rebootUntil>now)S.uptCur=Math.max(S.uptCur,1);
  }
}
function checkAlerts(){
  const o=occ(),r=o/S.capacity;
  if(r>=1)addAlert('cap100','crit','已達人數上限，閘門關閉',`場內 ${o} / ${S.capacity} 人，門外排隊 ${S.queue} 人。`,{target:{view:'overview'}});
  else if(r>=.8)addAlert('cap80','warn','場內人數接近上限',`目前 ${o} / ${S.capacity} 人（${Math.round(r*100)}%）。`,{target:{view:'overview'}});
  for(const zd of ZONES){const z=S.zones[zd.id];if(!z.stale&&z.est>S.threshold)addAlert('z-'+zd.id,'warn',`${zd.name}擁擠`,`校正後估計 ${z.est} 人，門檻 ${S.threshold} 人。`,{target:{view:'live',zone:zd.id}})}
  if(S.queue>0&&!S.qLog){S.qLog=true;slogOnce('q1',120,'flow','warn','門外開始排隊',`場內 ${o} / ${S.capacity} 人`)}else if(!S.queue&&S.qLog){S.qLog=false;slogOnce('q0',120,'flow','info','門外排隊已消化','')}
  if(S.temp>=30)addAlert('temp','warn','入口溫度偏高',`DHT11 讀值 ${S.temp.toFixed(1)}°C。`);
}
function addAlert(key,level,title,detail,{cool=900,target=null,cat=null}={}){
  const last=S.alertLast[key];if(cool&&last!=null&&S.t-last<cool)return;
  S.alertLast[key]=S.t;S.alerts.unshift({id:S.alertId++,t:S.t,level,title,detail,target,ack:S.preroll});
  if(S.alerts.length>250)S.alerts.pop();S.alertVer++;rlog(level,title,'');
  slog(cat||(target?.node?'node':'alert'),level==='crit'?'error':level==='warn'?'warn':'info',title,detail);
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
  S.conn='connecting';S.url=url;onMqtt.status('busy','正在連線到 '+url);slog('conn','info',`連線到 ${url}`,'');
  try{await loadMqtt()}catch{S.conn='err';slog('conn','error','mqtt.js 載入失敗','需要網路才能從 unpkg.com 載入 MQTT 函式庫');onMqtt.status('err','mqtt.js 載入失敗，請確認電腦有網路。');return}
  if(client){client.end(true);client=null}
  const c=client=window.mqtt.connect(url,{reconnectPeriod:3000,connectTimeout:6000,clientId:'storega-ui-'+Math.random().toString(16).slice(2,8)});
  c.on('connect',()=>{if(c!==client)return;client.subscribe('sga/+/+');if(!S.real)startReal(),onLiveReset();S.conn='ok';S.everConnected=true;setSource('mqtt');store.set('mqttUrl',url);
    slog('conn','info','已連上 Node-RED',`${url} · 訂閱 sga/+/+`);onMqtt.status('ok','已連線 · 訂閱 sga/+/+')});
  c.on('error',e=>{if(c!==client)return;S.conn='err';slogOnce('conn-err',60,'conn','error','連線失敗',e.message);onMqtt.status('err',`連線失敗：${e.message}。請確認 Aedes 的 WebSocket 埠已開啟、電腦與 ESP32 在同一個網路。`)});
  c.on('close',()=>{if(c!==client||!S.real)return;if(S.conn==='ok')slog('conn','warn','與 Node-RED 的連線中斷','每 3 秒自動重試');if(S.conn!=='err')S.conn='down';onMqtt.status('busy','連線中斷，3 秒後自動重試…')});
  c.on('message',(topic,buf)=>{if(c!==client)return;let m;try{m=JSON.parse(buf.toString())}catch{return}if(!S.paused)onMqtt(topic,m)});
}
function mqttDisconnect(){if(client){client.end(true);client=null}if(S)S.conn='idle'}
function onMqtt(topic,m){
  const [,id,kind]=topic.split('/'),n=S.nodes[id];if(!n)return;
  S.lastData=performance.now();logMsg(topic,m,'in');
  if(m.online===false){n.will=true;n.lastSeen=S.t-99;return}  /* MQTT last will: the board dropped off the network */
  if(!n.seen){n.seen=true;slog('node','info',`${id} 開始回報`,`${topic}${m.ip?` · ${m.ip}`:''}`)}
  n.lastSeen=S.t;n.will=false;
  if(m.ip&&n.ip&&m.ip!==n.ip)slog('node','warn',`${id} 的 IP 改變`,`${n.ip} → ${m.ip}`);
  if(m.fw&&n.fw&&m.fw!==n.fw)slog('node','info',`${id} 韌體更新`,`v${n.fw} → v${m.fw}`);
  if(m.uptime!=null&&n.boot!=null&&(S.t-m.uptime)-n.boot>30)slog('node','warn',`${id} 重新開機過`,`運行時間歸零（${Math.round(m.uptime)} 秒）`);
  if(m.rssi!=null)n.rssi=m.rssi;if(m.ip)n.ip=m.ip;if(m.fw)n.fw=m.fw;if(m.uptime!=null)n.boot=S.t-m.uptime;
  if(kind==='counter'){
    if(m.occupancy!=null)S.mqttOcc=m.occupancy;
    if(m.in!=null){const d=m.in-(S.mqIn??m.in);if(d>0){hourAt(S.t).entries+=d;S.fx.push({type:'door'});rlog('in',d>1?`進場 ×${d}`:'進場',`場內 ${occ()}`)}
      else if(d<0)slog('node','warn','entry-01 計數歸零',`進場 ${S.mqIn} → ${m.in}（板子重開或換日）`);S.mqIn=m.in;S.today.entries=m.in}
    if(m.out!=null){const d=m.out-(S.mqOut??m.out);if(d>0)rlog('out',d>1?`離場 ×${d}`:'離場',`場內 ${occ()}`);S.mqOut=m.out;S.today.exits=m.out}
    if(m.checkout!=null){const d=m.checkout-(S.mqCo??m.checkout);if(d>0){hourAt(S.t).checkouts+=d;S.fx.push({type:'pay'});rlog('pay','RFID 結帳',`第 ${m.checkout} 筆`)}S.mqCo=m.checkout;S.today.checkouts=m.checkout}
    if(m.queue!=null)S.queue=m.queue;
    if(m.temp!=null)S.temp=m.temp;if(m.hum!=null)S.hum=m.hum;
    const was=S.gateOpen;S.gateOpen=m.gate!=null?!!m.gate:(S.gateMode==='open'||(S.gateMode==='auto'&&occ()<S.capacity));if(was!==S.gateOpen)logGate();
    if(m.dwell_avg!=null){S.today.dwellSum=m.dwell_avg;S.today.dwellN=1}
    if(['auto','open','closed'].includes(m.mode))S.gateMode=m.mode;
    if(m.capacity>=10&&m.capacity<=80){if(m.capacity!==S.capacity)slog('node','info',`entry-01 回報人數上限 ${m.capacity} 人`,`儀表板原本是 ${S.capacity} 人`);S.capacity=m.capacity}
  }else{
    const z=S.zones[id.slice(-1)];if(!z)return;
    if(kind==='wifi'){if(m.raw!=null)z.raw=m.raw;if(m.dwell_avg!=null){z.dwellSum=m.dwell_avg;z.dwellN=1}S.fx.push({type:'wifi',node:id})}
    if(kind==='radar'){z.presence=!!m.presence;z.moving=!!m.moving}
  }
  fuse();
}
onMqtt.status=()=>{};
function mqttCmd(node,payload){logMsg(`sga/${node}/cmd`,payload,'out');slog('cmd','info',`${node} ← ${payload.action}`,payload);if(client&&S.source==='mqtt')client.publish(`sga/${node}/cmd`,JSON.stringify(payload))}
/* every message in or out, newest first; the 裝置 page shows it as a live console */
function logMsg(topic,obj,dir='in'){const L=S.msgs||(S.msgs=[]);L.unshift({t:S.t,wall:Date.now(),topic,dir,sim:S.source==='sim',body:JSON.stringify(obj)});if(L.length>300)L.length=300;S.msgCount=(S.msgCount||0)+1}
function logGate(){slogOnce('gate',20,'flow',S.gateOpen?'info':'warn',S.gateOpen?'閘門開啟':'閘門關閉',`場內 ${occ()} / ${S.capacity} 人${S.queue?`，門外 ${S.queue} 人`:''}`)}

/* ================= modes ================= */
const KEEP=['speed','capacity','threshold','gateMode','whitelist','kAuto','notify','sound','k'];
const keepSettings=()=>S?Object.fromEntries(KEEP.filter(k=>S[k]!==undefined).map(k=>[k,S[k]])):store.get('settings',{});
/* 展示模式: the simulator runs from 10:00 up to the current time of day (or 15:12 outside opening hours) */
function startDemo(){
  const keep=keepSettings();S=freshState(false);Object.assign(S,keep);
  const tod=wallTod(),START=(tod>OPEN+3600&&tod<CLOSE-1800)?Math.floor(tod):15*3600+12*60;
  while(S.t<START){simStep(2);checkNodes();checkAlerts()}
  S.preroll=false;NODE_DEFS.forEach(d=>S.nodes[d.id].lastSeen=S.t);S.alerts.forEach((a,i)=>a.ack=i>=3);S.alertVer++;
  slog('sys','info','以展示模式開啟','資料由模擬器產生，這份日誌只存在這次開啟的頁面');
}
/* 真實模式: today starts empty (or from what this browser saved earlier today); nodes are unknown until they report */
function startReal(){
  const keep=keepSettings(),conn=S?.conn,url=S?.url;S=freshState(true);Object.assign(S,keep);S.t=wallTod();if(conn&&conn!=='idle')S.conn=conn,S.url=url;
  const back=restoreReal();S.logs=loadLogs(S.date);
  slog('sys','info',back?'開啟真實模式，接續今天稍早的資料':'開啟真實模式',back?`進場 ${S.today.entries} · 結帳 ${S.today.checkouts} · ${S.series.length} 分鐘的紀錄`:'今天的數字從 0 開始累積');
}
const resetForLive=()=>{startReal();onLiveReset()};
onLiveReset=()=>{};
function setSource(src){
  if(src==='sim'&&S.real){saveReal();mqttDisconnect();startDemo();onLiveReset()}
  S.source=src;store.set('mode',src==='sim'?'demo':'real');
  onSource();
}
const offHours=()=>S.t<OPEN||S.t>=CLOSE;

/* ================= days: today's real data survives a reload; each finished day becomes a summary ================= */
const loadHistory=()=>store.get('history',[]);
function daySummary(){const occ5=[];
  for(let k=0;k<144;k++){const t=OPEN+k*300,i=idxAt(t),p=i!=null?S.series[i]:null;occ5.push(p&&Math.abs(p.t-t)<600?p.occ:null)}
  const d=new Date(S.date+'T12:00:00');
  return {date:S.date,label:`${d.getMonth()+1}/${d.getDate()}`,sub:`週${'日一二三四五六'[d.getDay()]}`,entries:S.today.entries,checkouts:S.today.checkouts,
    dwell:+dwellMin().toFixed(1),hourly:S.hourly.map(h=>h.entries),occ:occ5}}
function archiveDay(sum){if(!sum||!sum.entries)return false;const h=loadHistory().filter(x=>x.date!==sum.date);h.push(sum);h.sort((a,b)=>a.date<b.date?-1:1);store.set('history',h.slice(-30));return true}
function saveReal(){if(!S.real)return;S.savedAt=performance.now();
  store.set('realDay',{date:S.date,today:S.today,hourly:S.hourly,offHour:S.offHour,series:S.series,alerts:S.alerts.slice(0,150),alertId:S.alertId,k:S.k,mqIn:S.mqIn,mqOut:S.mqOut,mqCo:S.mqCo,msgCount:S.msgCount,upt:S.upt,
    zones:Object.fromEntries(ZONES.map(z=>[z.id,{dwellSum:S.zones[z.id].dwellSum,dwellN:S.zones[z.id].dwellN}])),summary:daySummary()});saveLogs()}
function restoreReal(){const r=store.get('realDay',null);if(!r)return false;
  if(r.date!==S.date){if(archiveDay(r.summary))slog('sys','info',`已封存 ${r.date} 的資料`,`進場 ${r.summary.entries} · 結帳 ${r.summary.checkouts}`);store.del('realDay');S.days=loadHistory().slice(-6);return false}
  for(const k of['today','hourly','offHour','series','alerts','alertId','k','mqIn','mqOut','mqCo','msgCount','upt'])if(r[k]!==undefined)S[k]=r[k];
  ZONES.forEach(z=>Object.assign(S.zones[z.id],r.zones?.[z.id]||{}));return true}
/* midnight in 真實模式: save, archive today as a summary, start the new day empty */
function rollover(){saveReal();const sum=daySummary(),old=S.date;archiveDay(sum);store.del('realDay');startReal();
  slog('sys','info',`換日：已封存 ${old}`,`進場 ${sum.entries} · 結帳 ${sum.checkouts}`);onLiveReset()}

/* "yesterday" is the most recent earlier day on record — real days in 真實模式, invented ones in 展示模式.
   Every helper returns null when there is nothing to compare with, and the pages then say so. */
const YK=()=>S.days.at(-1)||null;
const yLabel=()=>{const y=YK();if(!y)return'';const d=new Date();d.setDate(d.getDate()-1);return y.date===dayKey(d)?'昨天':y.label};
function yesterdayNow(){const y=YK();if(!y)return null;
  if(y.hourly){const i=Math.floor((S.t-OPEN)/3600);if(i<0)return 0;let n=0;for(let k=0;k<Math.min(i,12);k++)n+=y.hourly[k]||0;if(i<12)n+=(y.hourly[i]||0)*((S.t-OPEN)%3600/3600);return n}
  return y.entries*cumFrac(S.t)}
function yOcc(t){const y=YK();if(!y)return null;
  if(y.occ){const f=(t-OPEN)/300,a=y.occ[Math.floor(f)],b=y.occ[Math.ceil(f)];if(a==null&&b==null)return null;if(a==null||b==null)return a??b;return a+(b-a)*(f-Math.floor(f))}
  if(S.real)return null;return lam(t/3600)*y.entries/CUM[720]*14}
function yHour(h){const y=YK();if(!y||h<10||h>21)return null;if(y.hourly)return y.hourly[h-10]??null;if(S.real)return null;return y.entries*(CUM[(h-9)*60]-CUM[(h-10)*60])/CUM[720]}
const yDwell=()=>YK()?.dwell??null;

/* ================= log 日誌 =================
   Every connection change, node event, hourly summary, alert, command and operator action, oldest first.
   真實模式 keeps one list per day in localStorage (14 days); 展示模式 keeps it in memory only. */
const LOGCAT={sys:'系統',conn:'連線',node:'節點',flow:'人流',alert:'告警',op:'操作',cmd:'指令'};
const LOGLV={info:'資訊',warn:'警告',error:'錯誤'};
function slog(cat,lv,msg,detail=''){if(!S||!S.logs)return;  // 展示模式 also logs while it simulates up to the current time
  S.logs.push({ts:Date.now(),t:Math.round(S.t),cat,lv,msg,detail:typeof detail==='string'?detail:JSON.stringify(detail)});
  if(S.logs.length>5000)S.logs.splice(0,S.logs.length-5000);S.logVer++;S.logDirty=true}
const slogLast={};
function slogOnce(key,cool,...a){const l=slogLast[key];if(l!=null&&Math.abs(S.t-l)<cool)return;slogLast[key]=S.t;slog(...a)}
function saveLogs(){if(!S.real||!S.logDirty)return;S.logDirty=false;store.set('log:'+S.date,S.logs);
  const days=store.get('logDays',[]);if(!days.includes(S.date)){days.push(S.date);days.sort();while(days.length>14)store.del('log:'+days.shift());store.set('logDays',days)}}
const loadLogs=date=>store.get('log:'+date,[]);
const logDays=()=>store.get('logDays',[]);

/* ================= clock ================= */
let lastTick=performance.now();
function tick(){
  const now=performance.now(),real=Math.min(1,(now-lastTick)/1000);lastTick=now;
  if(S.paused)return;
  if(!S.real){let d=real*S.speed;while(d>0){const st=Math.min(d,2);simStep(st);d-=st}S.lastData=now}
  else{if(dayKey()!==S.date){rollover();return}
    const nt=wallTod(),dt=Math.max(0,nt-S.t);S.t=nt;  // 真實模式 follows the wall clock, even if the tab was in the background
    S.acc5+=dt;if(S.acc5>=5){S.acc5%=5;const hr=hourAt(S.t);ZONES.forEach(z=>hr.zsum[z.id]+=S.zones[z.id].stale?0:S.zones[z.id].est);hr.zn++}
    S.acc60+=dt;if(S.acc60>=60){S.acc60%=60;minute()}
    if(now-(S.savedAt||0)>15000)saveReal()}
  checkNodes();checkAlerts();
}

/* ================= replay: any page can read "the shown moment" ================= */
let replayIdx=null;
const snap=()=>replayIdx!=null?S.series[replayIdx]:null;
const vOcc=()=>snap()?.occ??occ(), vCap=()=>snap()?.cap??S.capacity, vGate=()=>{const s=snap();return s?s.gate:S.gateOpen}, vQueue=()=>snap()?.queue??S.queue;
function idxAt(t){const s=S.series;if(!s.length)return null;let lo=0,hi=s.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(s[m].t<=t)lo=m;else hi=m-1}return lo}
const heatOf=z=>{if(z.stale)return'stale';const r=z.est/S.threshold;return r>1?'hot':r>.6?'warm':'cool'};
function zoneVals(zd){const sn=snap(),z=S.zones[zd.id];if(!sn||!sn.zones)return{est:z.est,raw:z.raw,stale:z.stale};const v=sn.zones[zd.id];return{est:v[2],raw:v[1],stale:!!v[3]}}
const accNow=()=>S.today.base?Math.max(0,1-S.today.errEst/S.today.base):0;
const accRaw=()=>S.today.base?Math.max(0,1-S.today.errRaw/S.today.base):0;
const dwellMin=()=>S.today.dwellN?S.today.dwellSum/S.today.dwellN/60:0;
const peakToday=()=>{let p={occ:occ(),t:S.t};for(const s of S.series)if(s.occ>p.occ)p=s;return p};
function persist(){store.set('settings',{capacity:S.capacity,threshold:S.threshold,gateMode:S.gateMode,kAuto:S.kAuto,whitelist:S.whitelist,speed:S.speed,notify:S.notify,sound:S.sound})}

/* ================= export ================= */
const storeName=()=>store.get('profile',{}).store||'我的門市';
function buildCSV(){
  const rows=[['小時','進場','結帳','轉換率','Wi-Fi 原始誤差','校正後誤差']];
  S.hourly.forEach(h=>rows.push([`${pad(h.h)}:00`,h.entries,h.checkouts,h.entries?(h.checkouts/h.entries*100).toFixed(1)+'%':'',h.base?(h.errRaw/h.base*100).toFixed(1)+'%':'',h.base?(h.errEst/h.base*100).toFixed(1)+'%':'']));
  rows.push([]);rows.push(['區域','平均停留(分)','目前原始','目前估計']);ZONES.forEach(zd=>{const z=S.zones[zd.id];rows.push([zd.name,z.dwellN?(z.dwellSum/z.dwellN/60).toFixed(1):'',z.raw,z.est])});
  rows.push([]);rows.push(['事件時間','等級','標題','說明','已處理']);S.alerts.forEach(a=>rows.push([hhmm(a.t),a.level,a.title,a.detail,a.ack?'是':'否']));
  return rows.map(r=>r.map(c=>/[",\n]/.test(String(c))?`"${String(c).replace(/"/g,'""')}"`:c).join(',')).join('\n');
}
function buildJSON(){return JSON.stringify({store:storeName(),mode:S.real?'real':'demo',date:new Date().toISOString().slice(0,10),time:hhmmss(S.t),capacity:S.capacity,threshold:S.threshold,k:+S.k.toFixed(3),
  today:S.today,hourly:S.hourly,series:S.series,alerts:S.alerts.map(a=>({t:hhmm(a.t),level:a.level,title:a.title,detail:a.detail,ack:a.ack})),
  nodes:NODE_DEFS.map(d=>{const n=S.nodes[d.id];return{id:d.id,online:n.online,rssi:n.rssi,ip:n.ip,fw:n.fw}})},null,2)}
