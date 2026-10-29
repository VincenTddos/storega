/* Loads dashboard/assets/js/util.js + model.js in a sandbox (no browser) and checks the simulator and the MQTT mapping.
   Run: node --test dashboard/test/*.test.js */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
function memStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m}}
function load(localStorage){
  const ctx={console,performance,Math,Date,JSON,setTimeout,clearTimeout,localStorage,
    matchMedia:()=>({matches:false,addEventListener(){}}),document:{querySelector:()=>null,querySelectorAll:()=>[]},
    toast(){},announce(){},goTarget(){},onAlert(){},onSource(){},rlog(){}};
  vm.createContext(ctx);
  for(const f of['util.js','model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','assets','js',f),'utf8'),ctx,{filename:f});
  vm.runInContext('S=freshState();',ctx);
  return ctx;
}
const run=(c,code)=>vm.runInContext(code,c);
const val=(c,expr)=>JSON.parse(vm.runInContext(`JSON.stringify(${expr})`,c));  // copy out of the sandbox's realm

test('simulated day: people are conserved and the gate holds the limit',()=>{
  const c=load();run(c,`S.capacity=25;S.scenario='surge';while(S.t<16*3600){simStep(2);checkNodes();checkAlerts()}`);
  const r=run(c,`({occ:occ(),inn:S.today.entries,out:S.today.exits,co:S.today.checkouts,cap:S.capacity,maxOcc:Math.max(...S.series.map(p=>p.occ))})`);
  assert.equal(r.occ,r.inn-r.out);assert.ok(r.maxOcc<=r.cap,`max ${r.maxOcc} > cap`);assert.ok(r.co<=r.inn);
  assert.ok(run(c,`S.alerts.some(a=>a.title.includes('上限'))`),'surge should hit the limit');
});

test('fusion: radar "nobody" forces a zone to 0; otherwise raw × k',()=>{
  const c=load();run(c,`S.k=0.5;S.zones.A.raw=10;S.zones.A.presence=false;S.zones.C.raw=9;fuse()`);
  assert.equal(run(c,'S.zones.A.est'),0);assert.equal(run(c,'S.zones.C.est'),Math.round(9*0.5));
});

test('calibrate: k = door count ÷ Wi-Fi total, clamped to 0.2–1.2',()=>{
  const c=load();run(c,`S.agents=Array.from({length:12},()=>({phase:'dwell',zone:'A'}));S.sumRaw=24`);
  const r=run(c,'calibrate()');assert.equal(r.k,0.5);
  run(c,'S.sumRaw=1');assert.equal(run(c,'calibrate()').k,1.2);
  run(c,'S.sumRaw=0');assert.equal(run(c,'calibrate()'),null);
});

test('MQTT: counter, wifi, radar, status and last will map onto the model',()=>{
  const c=load();run(c,`S=freshState(true);S.t=12*3600;
    onMqtt('sga/entry-01/counter',{in:50,out:40,occupancy:10,queue:2,checkout:7,gate:false,temp:26.5,hum:55,mode:'closed',capacity:30});
    onMqtt('sga/zone-B/wifi',{raw:8});onMqtt('sga/zone-B/radar',{presence:true,moving:true});onMqtt('sga/zone-D/status',{rssi:-61,ip:'10.0.0.9',fw:'9.9.9',uptime:100})`);
  assert.deepEqual(val(c,'[occ(),S.queue,S.today.checkouts,S.gateOpen,S.gateMode,S.capacity,S.temp]'),[10,2,7,false,'closed',30,26.5]);
  assert.equal(run(c,'S.zones.B.est'),Math.round(8*run(c,'S.k')));
  assert.deepEqual(val(c,'[S.nodes["zone-D"].rssi,S.nodes["zone-D"].ip,S.nodes["zone-D"].fw]'),[-61,'10.0.0.9','9.9.9']);
  run(c,`onMqtt('sga/entry-01/counter',{in:53});`);assert.equal(run(c,'hourAt(S.t).entries'),3,'only the delta goes into this hour');
  run(c,`onMqtt('sga/zone-A/status',{rssi:-55});checkNodes();onMqtt('sga/zone-A/status',{online:false});checkNodes()`);assert.equal(run(c,'S.nodes["zone-A"].online'),false);
  assert.ok(!run(c,`S.alerts.some(a=>a.title.includes('恢復'))`),'first report is not a "back online"');
  run(c,`onMqtt('sga/zone-A/status',{rssi:-60});checkNodes()`);assert.ok(run(c,`S.alerts.some(a=>a.title==='zone-A 恢復連線')`),'back online after a real drop');
  assert.ok(run(c,'S.msgs.length')>=5,'every message lands in the console log');
});

test('commands are logged even in simulator mode',()=>{
  const c=load();run(c,`mqttCmd('entry-01',{action:'gate',mode:'auto'})`);
  assert.deepEqual(val(c,'[S.msgs[0].topic,S.msgs[0].dir]'),['sga/entry-01/cmd','out']);
});

test('CSV export escapes commas and quotes',()=>{
  const c=load();run(c,`addAlert('x','warn','標題, 有逗號','說 "你好"',{cool:0})`);
  const csv=run(c,'buildCSV()');assert.match(csv,/"標題, 有逗號"/);assert.match(csv,/"說 ""你好"""/);
});

test('真實模式 invents nothing: unknown nodes, no history, no forecast',()=>{
  const c=load(memStorage());run(c,`S=freshState(true);S.t=12*3600;checkNodes();checkAlerts()`);
  assert.deepEqual(val(c,'NODE_DEFS.map(d=>[S.nodes[d.id].online,S.nodes[d.id].seen,S.nodes[d.id].ip,S.nodes[d.id].rssi])'),Array(5).fill([false,false,null,null]));
  assert.deepEqual(val(c,'[S.days.length,S.temp,S.alerts.length,S.upt.length,S.uptCur]'),[0,null,0,0,0],'never-seen nodes are not "offline" alerts');
  assert.deepEqual(val(c,'[yesterdayNow(),yOcc(12*3600),yHour(12),yDwell()]'),[null,null,null,null]);
});

test('真實模式 keeps today across a reload and archives finished days',()=>{
  const ls=memStorage(),c=load(ls);
  run(c,`S=freshState(true);S.t=12*3600;onMqtt('sga/entry-01/counter',{in:10,out:2,occupancy:8,checkout:3});onMqtt('sga/entry-01/counter',{in:14,out:4,occupancy:10,checkout:4});minute();saveReal()`);
  run(c,`startReal()`);  // a reload
  assert.deepEqual(val(c,'[S.today.entries,S.mqIn,S.hourly[2].entries,S.series.length]'),[14,14,4,1]);
  run(c,`S.t=12*3600;onMqtt('sga/entry-01/counter',{in:15,out:4,occupancy:11,checkout:4})`);assert.equal(run(c,'S.hourly[2].entries'),5,'deltas continue after the reload');
  // pretend the saved day was yesterday: the next start archives it and uses it for comparisons
  run(c,`const r=store.get('realDay');const d=new Date();d.setDate(d.getDate()-1);r.date=dayKey(d);r.summary.date=r.date;store.set('realDay',r);startReal()`);
  assert.deepEqual(val(c,'[S.today.entries,S.days.length,S.days[0].entries,yLabel()]'),[0,1,14,'昨天']);
  run(c,'S.t=12.5*3600');assert.equal(run(c,'yesterdayNow()'),2,'the saved day had 0 before 12:00 and 4 in the 12:00 hour → half of it by 12:30');
  assert.equal(run(c,'yHour(12)'),4);
});

test('outside 10:00–22:00 real counts go to their own bucket, not the first hour',()=>{
  const c=load(memStorage());run(c,`S=freshState(true);S.t=3*3600;onMqtt('sga/entry-01/counter',{in:5,occupancy:0});onMqtt('sga/entry-01/counter',{in:9,occupancy:1})`);
  assert.deepEqual(val(c,'[S.today.entries,S.hourly[0].entries,S.offHour.entries]'),[9,0,4]);
});

test('log: every alert, command and node event is recorded; 真實模式 saves it per day',()=>{
  const ls=memStorage(),c=load(ls);
  run(c,`S=freshState(true);S.t=12*3600;onMqtt('sga/zone-A/status',{rssi:-60,ip:'10.0.0.5',fw:'1.3.8',uptime:500});onMqtt('sga/zone-A/status',{ip:'10.0.0.6',uptime:10});
    mqttCmd('entry-01',{action:'gate',mode:'closed'});addAlert('x','warn','測試告警','細節',{cool:0});slogOnce('k',60,'flow','info','一次');slogOnce('k',60,'flow','info','兩次');saveLogs()`);
  const L=val(c,'S.logs.map(e=>[e.cat,e.lv,e.msg])');
  for(const want of[['node','info','zone-A 開始回報'],['node','warn','zone-A 的 IP 改變'],['node','warn','zone-A 重新開機過'],['cmd','info','entry-01 ← gate'],['alert','warn','測試告警'],['flow','info','一次']])
    assert.ok(L.some(e=>JSON.stringify(e)===JSON.stringify(want)),'missing '+want.join(' '));
  assert.ok(!L.some(e=>e[2]==='兩次'),'slogOnce throttles');
  const day=run(c,'S.date');assert.equal(JSON.parse(ls.getItem('storega:log:'+day)).length,L.length);
  assert.deepEqual(JSON.parse(ls.getItem('storega:logDays')),[day]);
});

test('link quality: gaps in seq are lost messages, a restart is not, ts gives latency',()=>{
  const c=load(memStorage());run(c,`S=freshState(true);S.t=12*3600;const now=Date.now();
    for(const s of[1,2,3,6,7])onMqtt('sga/zone-A/wifi',{raw:3,seq:s,ts:now-40});   // 4 and 5 never arrived
    onMqtt('sga/zone-A/status',{rssi:-60,seq:1,ts:now-40,reset:'watchdog'})`);    // board restarted: seq starts again
  const q=val(c,'linkQ(S.nodes["zone-A"])');
  assert.deepEqual([q.recv,q.lost],[6,2]);assert.ok(q.p50>=40&&q.p50<1000,'latency from ts');
  assert.equal(run(c,'S.nodes["zone-A"].reset'),'watchdog');
});

test('commands the board carries out get an id and an answer; refusals are logged as errors',()=>{
  const c=load(memStorage());run(c,`S=freshState(true);S.t=12*3600;S.conn='ok';mqttCmd('entry-01',{action:'gate',mode:'closed'});mqttCmd('entry-01',{action:'threshold',value:10})`);
  const [gate,thr]=val(c,'S.msgs.slice(0,2).reverse().map(m=>JSON.parse(m.body))');
  assert.ok(gate.id,'gate is the board\'s job → has an id');assert.equal(thr.id,undefined,'threshold is Node-RED\'s → no id');
  run(c,`onMqtt('sga/entry-01/ack',{id:'${gate.id}',action:'gate',ok:true,seq:1,ts:Date.now()})`);
  assert.deepEqual(val(c,'[pendingCmd.size,S.nodes["entry-01"].lastCmd.ok]'),[0,true]);
  run(c,`mqttCmd('entry-01',{action:'capacity',value:500});const id=[...pendingCmd.keys()][0];onMqtt('sga/entry-01/ack',{id,action:'capacity',ok:false,reason:'capacity must be 10-80'})`);
  assert.ok(val(c,`S.logs.some(e=>e.lv==='error'&&e.cat==='cmd'&&e.detail==='capacity must be 10-80')`));
  run(c,'for(const p of pendingCmd.values())clearTimeout(p.timer)');
});

test('with Node-RED on the broker its alerts and k count, and the dashboard stops judging on its own',()=>{
  const c=load(memStorage());run(c,`S=freshState(true);S.t=12*3600;S.capacity=10;onMqtt('sga/entry-01/counter',{in:20,out:9,occupancy:11});checkAlerts()`);
  assert.ok(run(c,`S.alerts.some(a=>a.title.includes('上限'))`),'no Node-RED → the dashboard raises it');
  run(c,`S.alerts=[];S.alertLast={};onMqtt('sga/system/online',{online:true});onMqtt('sga/system/state',{k:0.48,occupancy:11});checkAlerts()`);
  assert.deepEqual(val(c,'[nrActive(),S.k,S.alerts.length]'),[true,0.48,0]);
  run(c,`onMqtt('sga/system/alert',{key:'off-zone-C',level:'crit',title:'zone-C 離線',detail:'超過 15 秒沒有心跳',ts:Date.now(),source:'node-red'})`);
  assert.deepEqual(val(c,'[S.alerts[0].title,S.alerts[0].target]'),['zone-C 離線',{view:'devices',node:'zone-C'}]);
  run(c,`onMqtt('sga/system/history',{days:[{date:'2000-01-02',label:'1/2',entries:321,hourly:[1,2,3,4,5,6,7,8,9,10,11,12]}]})`);
  assert.equal(run(c,'YK().entries'),321,'history kept by Node-RED becomes "the previous day"');
  run(c,`onMqtt('sga/system/online',{online:false})`);assert.equal(run(c,'nrActive()'),false,'Node-RED gone → the dashboard judges again');
});
