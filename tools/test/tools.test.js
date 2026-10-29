/* node --test test/  — checks the fake boards speak the protocol in docs/mqtt.md and that the broker routes commands */
const test=require('node:test'),assert=require('node:assert/strict');
const mqtt=require('mqtt');
const {createStore,step,payloads}=require('../fake-nodes');

test('people are conserved: occupancy = in − out, never above capacity in auto mode',()=>{
  const s=createStore({startTod:11*3600,capacity:20});s.scenario='surge';
  for(let i=0;i<3600;i++){step(s,2);assert.equal(s.agents.length,s.inn-s.out);assert.ok(s.agents.length<=s.capacity);assert.ok(s.checkout<=s.inn)}
  assert.ok(s.queue>0||s.inn>0);
});

test('entry payload has every field the dashboard reads',()=>{
  const s=createStore({startTod:13*3600}),p=payloads(s,'entry-01');
  for(const k of['in','out','occupancy','queue','checkout','gate','temp','hum','dwell_avg'])assert.ok(k in p.counter,k);
  for(const k of['rssi','ip','fw','uptime'])assert.ok(k in p.status,k);
  assert.equal(p.counter.occupancy,p.counter.in-p.counter.out);
});

test('zone payloads: wifi everywhere, radar only where an LD2410 is fitted',()=>{
  const s=createStore({startTod:13*3600});
  for(const z of['A','B','D']){const p=payloads(s,'zone-'+z);assert.equal(typeof p.wifi.raw,'number');assert.equal(typeof p.radar.presence,'boolean')}
  assert.equal(payloads(s,'zone-C').radar,undefined);
});

test('broker routes telemetry and commands end to end',async()=>{
  const {startBroker}=require('../broker');const {startNodes}=require('../fake-nodes');
  const mp=18830+Math.floor(Math.random()*100),hp=18930+Math.floor(Math.random()*100);
  const b=await startBroker({mqttPort:mp,httpPort:hp});
  const nodes=startNodes({url:'mqtt://localhost:'+mp,quiet:true});
  const seen=new Set(),c=mqtt.connect('mqtt://localhost:'+mp,{username:'dashboard',password:'storega-dashboard'});
  await new Promise(r=>c.on('connect',r));c.subscribe('sga/+/+');c.on('message',t=>seen.add(t));
  await new Promise(r=>setTimeout(r,5600));
  for(const t of['sga/entry-01/counter','sga/entry-01/status','sga/zone-A/wifi','sga/zone-A/radar','sga/zone-C/wifi'])assert.ok(seen.has(t),t);
  const acks=[],stamps=[];c.on('message',(t,b)=>{const m=JSON.parse(b);if(t.endsWith('/ack'))acks.push(m);else if(t==='sga/zone-A/wifi')stamps.push(m)});
  c.publish('sga/entry-01/cmd',JSON.stringify({action:'gate',mode:'closed',id:'c1'}));c.publish('sga/entry-01/cmd',JSON.stringify({action:'capacity',value:500,id:'c2'}));
  await new Promise(r=>setTimeout(r,5600));assert.equal(nodes.state.gateMode,'closed');
  assert.deepEqual(acks.map(a=>[a.id,a.ok]),[['c1',true],['c2',false]],'every command with an id is answered, bad values are refused');
  assert.ok(stamps.length>=1&&stamps.every(m=>m.seq>0&&Math.abs(Date.now()-m.ts)<10000),'uplink carries seq and ts');
  const html=await fetch(`http://localhost:${hp}/`).then(r=>r.text());assert.match(html,/StoreGA/);
  nodes.stop();c.end(true);await b.close();
});

test('broker rules: each role can only do its own job',()=>{
  const {canPublish,canSubscribe}=require('../broker');
  assert.ok(canPublish('device','esp32-zone-A','sga/zone-A/wifi'));
  assert.ok(!canPublish('device','esp32-zone-A','sga/zone-B/wifi'),'a board cannot speak for another board');
  assert.ok(!canPublish('device','esp32-zone-A','sga/zone-A/cmd'),'a board cannot send commands');
  assert.ok(!canPublish('device','esp32-zone-A','sga/system/state'));
  assert.ok(canPublish('dashboard','ui','sga/entry-01/cmd'));
  assert.ok(!canPublish('dashboard','ui','sga/entry-01/counter'),'the dashboard cannot fake sensor data');
  assert.ok(canPublish('server','node-red','sga/system/state'));
  assert.ok(canSubscribe('device','esp32-entry-01','sga/entry-01/cmd'));assert.ok(!canSubscribe('device','esp32-entry-01','sga/#'));
  assert.ok(canSubscribe('dashboard','ui','sga/+/+'));
});

test('broker login: no password or a board account cannot open the gate',async()=>{
  const {startBroker}=require('../broker');const mp=19030+Math.floor(Math.random()*100),hp=19130+Math.floor(Math.random()*100);
  const b=await startBroker({mqttPort:mp,httpPort:hp});const url='mqtt://localhost:'+mp;
  const anon=mqtt.connect(url,{reconnectPeriod:0});
  const err=await new Promise(r=>{anon.on('error',e=>r(e));anon.on('connect',()=>r(null))});assert.ok(err,'anonymous login must fail');anon.end(true);
  const got=[],ui=mqtt.connect(url,{username:'dashboard',password:'storega-dashboard'});let dev;
  try{
    await new Promise(r=>ui.on('connect',r));await ui.subscribeAsync('sga/+/+');ui.on('message',t=>got.push(t));
    dev=mqtt.connect(url,{clientId:'esp32-zone-A',username:'device',password:'storega-device',reconnectPeriod:0});await new Promise(r=>dev.on('connect',r));const kicked=new Promise(r=>dev.on('close',r));
    dev.publish('sga/zone-A/wifi','{"raw":3}');dev.publish('sga/entry-01/cmd','{"action":"gate","mode":"open"}');
    await kicked;await new Promise(r=>setTimeout(r,200));
    assert.deepEqual(got,['sga/zone-A/wifi'],'the board\'s own data gets through; its attempt to open the gate does not, and the broker drops it');
  }finally{ui.end(true);dev?.end(true);await b.close()}
});
