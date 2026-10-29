/* StoreGA fake ESP32 nodes: five separate MQTT clients that publish exactly what the real boards publish (see docs/mqtt.md)
   and obey the same commands. Use it to test Node-RED or the dashboard's MQTT mode without any hardware.
   Usage: node fake-nodes.js [--url mqtt://localhost:1883] [--user device --pass storega-device] [--speed 1] [--scenario normal|surge|fault|noise] [--capacity 40]  */
const mqtt=require('mqtt');

function arg(name,def){const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:def}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const gauss=(x,m,s)=>Math.exp(-((x-m)**2)/(2*s*s));
function poisson(l){if(l<=0)return 0;const L=Math.exp(-l);let k=0,p=1;do{k++;p*=Math.random()}while(p>L);return k-1}
/* arrivals per minute: lunch and after-work peaks, same curve as the dashboard's simulator */
const lam=h=>(h<10||h>=22)?0:1.5*(0.35+0.55*gauss(h,12.6,1.1)+0.8*gauss(h,18.6,1.3));
const ZONES={A:{dwell:[180,600],radar:true},B:{dwell:[240,900],radar:true},C:{dwell:[180,540],radar:false},D:{dwell:[60,150],radar:true}};
const NODES=[
  {id:'entry-01',ip:'192.168.50.21',fw:'1.5.0'},{id:'zone-A',ip:'192.168.50.31',fw:'1.4.0'},{id:'zone-B',ip:'192.168.50.32',fw:'1.4.0'},
  {id:'zone-C',ip:'192.168.50.33',fw:'1.4.0'},{id:'zone-D',ip:'192.168.50.34',fw:'1.4.0'}];

function createStore({speed=1,scenario='normal',capacity=40,startTod}={}){
  const now=new Date(),tod=startTod??(now.getHours()*3600+now.getMinutes()*60+now.getSeconds());
  /* outside opening hours the fake store behaves like 14:30 so a demo always has people in it */
  const t0=tod>=10*3600&&tod<22*3600?tod:14.5*3600;
  const st={t:10*3600,speed,scenario,capacity,gateMode:'auto',k:0.62,
    agents:[],queue:0,inn:0,out:0,checkout:0,dwellSum:0,dwellN:0,temp:23.8,hum:61,boot:{},
    rssi:Object.fromEntries(NODES.map((n,i)=>[n.id,-50-i*4])),down:{},blink:{},seq:{},reset:{}};
  while(st.t<t0)step(st,2);   /* replay the day so far, like a store that has been open since 10:00 */
  return st;
}
const occupancy=s=>s.agents.length;
const gateOpen=s=>s.gateMode==='open'||(s.gateMode==='auto'&&occupancy(s)<s.capacity);
function step(s,dt){
  s.t+=dt;let l=lam(s.t/3600);if(s.scenario==='surge')l*=4.5;
  s.queue+=poisson(l/60*dt);
  while(s.queue>0&&gateOpen(s)){s.queue--;s.inn++;const pool=['A','B','C'].sort(()=>Math.random()-.5).slice(0,1+Math.floor(Math.random()*3));
    s.agents.push({plan:Math.random()<.38?[...pool,'D']:pool,i:0,zone:null,until:s.t+15+Math.random()*25,entered:s.t})}
  s.queue=Math.min(s.queue,14);
  for(let i=s.agents.length-1;i>=0;i--){const a=s.agents[i];if(s.t<a.until)continue;
    if(a.zone==null&&a.i<a.plan.length){a.zone=a.plan[a.i];const[lo,hi]=ZONES[a.zone].dwell;a.until=s.t+lo+Math.random()*(hi-lo);a.moving=Math.random()<.6}
    else if(a.zone){if(a.zone==='D')s.checkout++;a.zone=null;a.i++;a.until=s.t+(a.i<a.plan.length?15+Math.random()*30:20+Math.random()*25)}
    else{s.agents.splice(i,1);s.out++;s.dwellSum+=s.t-a.entered;s.dwellN++}}
  s.temp=clamp(s.temp+((23.2+3.5*occupancy(s)/s.capacity)-s.temp)*Math.min(1,.002*dt)+(Math.random()-.5)*.02*dt,21,33);  /* drifts toward a crowd-dependent target */s.hum=clamp(s.hum+(Math.random()-.5)*.2*dt,45,75);
}
/* what each board would publish right now */
function payloads(s,id){
  const n=NODES.find(x=>x.id===id),wall=Date.now()/1000;
  s.rssi[id]=clamp(Math.round(s.rssi[id]+(Math.random()-.5)*3),-84,-42);
  const status={rssi:s.rssi[id],ip:n.ip,fw:n.fw,uptime:Math.round(wall-(s.boot[id]??wall-3600*3)),heap:180000+Math.round(Math.random()*9000),reset:s.reset[id]||'poweron'};
  if(id==='entry-01')return{status,counter:{in:s.inn,out:s.out,occupancy:occupancy(s),queue:s.queue,checkout:s.checkout,gate:gateOpen(s),
    temp:+s.temp.toFixed(1),hum:Math.round(s.hum),dwell_avg:s.dwellN?Math.round(s.dwellSum/s.dwellN):0,mode:s.gateMode,capacity:s.capacity}};
  const z=id.slice(-1),here=s.agents.filter(a=>a.zone===z),truth=here.length;
  let raw=truth*(1.45+Math.random()*.3)+poisson(.8);if(z==='C')raw+=poisson(1.1);if(s.scenario==='noise'&&(z==='A'||z==='C'))raw+=poisson(7);
  const out={status,wifi:{raw:Math.round(raw)}};
  if(ZONES[z].radar)out.radar={presence:truth>0||Math.random()<.03,moving:here.some(a=>a.moving)};
  return out;
}

function startNodes({url=arg('url','mqtt://localhost:1883'),username=arg('user','device'),password=arg('pass','storega-device'),speed=+arg('speed',1),scenario=arg('scenario','normal'),capacity=+arg('capacity',40),quiet=process.argv.includes('--quiet')}={}){
  const s=createStore({speed,scenario,capacity}),log=(...a)=>{if(!quiet)console.log(...a)};
  const clients={};
  for(const n of NODES){
    const c=mqtt.connect(url,{clientId:'esp32-'+n.id,username,password,reconnectPeriod:2000,will:{topic:`sga/${n.id}/status`,payload:JSON.stringify({online:false}),qos:1,retain:false}});
    c.on('connect',()=>{c.subscribe(`sga/${n.id}/cmd`);log(`✓ ${n.id} 已連上 ${url}`)});
    c.on('error',e=>log(`✗ ${n.id} ${e.message}`));
    c.on('message',(topic,buf)=>{let m;try{m=JSON.parse(buf)}catch{return}onCmd(n.id,m)});
    clients[n.id]=c;s.boot[n.id]=Date.now()/1000-3600*3-Math.random()*3600;
  }
  /* same answers as the firmware's onMessage(): commands with an id get sga/<node>/ack {id, action, ok, reason?} */
  function onCmd(id,m){
    log(`← ${id} 收到指令`,JSON.stringify(m));
    const entry=id==='entry-01';let ok=true,reason;
    if(['threshold','calibrate'].includes(m.action)){if(+m.k>0)s.k=+m.k;return}  // Node-RED's business, the boards stay quiet
    if(m.action==='gate'&&entry){if(['auto','open','closed'].includes(m.mode))s.gateMode=m.mode;else ok=false,reason='mode must be auto/open/closed'}
    else if(m.action==='capacity'&&entry){if(+m.value>=10&&+m.value<=80)s.capacity=+m.value;else ok=false,reason='capacity must be 10-80'}
    else if(m.action==='set_occupancy'&&entry){const v=+m.value;if(Number.isInteger(v)&&v>=0&&v<=s.agents.length){s.out+=s.agents.length-v;s.agents.length=v}else ok=false,reason='fake nodes can only lower occupancy'}
    else if(m.action==='blink')s.blink[id]=Date.now()+(+m.seconds||4)*1000;
    else if(m.action==='reboot'){ack(id,m,true);s.down[id]=Date.now()+4000;s.boot[id]=Date.now()/1000+4;s.reset[id]='software';s.seq[id]=0;clients[id].end(true,()=>setTimeout(()=>clients[id].reconnect(),4000));return}
    else if(m.action==='reset_day'&&entry){s.inn=s.out=s.checkout=0;s.agents=[]}
    else if(m.action==='scenario'&&m.name)s.scenario=m.name;
    else ok=false,reason='unknown action';
    ack(id,m,ok,reason);publish(id);
  }
  const stamp=(id,p)=>JSON.stringify({...p,seq:s.seq[id]=(s.seq[id]||0)+1,ts:Date.now()});
  function ack(id,m,ok,reason){if(m.id&&clients[id]?.connected)clients[id].publish(`sga/${id}/ack`,stamp(id,{id:String(m.id),action:m.action,ok,...(reason?{reason}:{})}))}
  function publish(id){const c=clients[id];if(!c?.connected||s.down[id]>Date.now())return;if(s.scenario==='fault'&&id==='zone-B')return;
    for(const[kind,p]of Object.entries(payloads(s,id)))c.publish(`sga/${id}/${kind}`,stamp(id,p))}
  let last=Date.now();
  const sim=setInterval(()=>{const now=Date.now();let d=(now-last)/1000*s.speed;last=now;while(d>0){const st=Math.min(d,2);step(s,st);d-=st}},200);
  const pubEntry=setInterval(()=>publish('entry-01'),2000);
  const pubZones=setInterval(()=>NODES.slice(1).forEach(n=>publish(n.id)),5000);
  const report=setInterval(()=>log(`${new Date().toTimeString().slice(0,8)}  場內 ${occupancy(s)}/${s.capacity}  門外 ${s.queue}  進場 ${s.inn}  結帳 ${s.checkout}  閘門 ${gateOpen(s)?'開':'關'}（${s.gateMode}）`),15000);
  return{state:s,clients,stop:()=>{[sim,pubEntry,pubZones,report].forEach(clearInterval);Object.values(clients).forEach(c=>c.end(true))}};
}
module.exports={startNodes,createStore,step,payloads,lam};
if(require.main===module){const r=startNodes();process.on('SIGINT',()=>{r.stop();process.exit(0)})}
