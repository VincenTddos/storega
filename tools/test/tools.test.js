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
  const seen=new Set(),c=mqtt.connect('mqtt://localhost:'+mp);
  await new Promise(r=>c.on('connect',r));c.subscribe('sga/+/+');c.on('message',t=>seen.add(t));
  await new Promise(r=>setTimeout(r,5600));
  for(const t of['sga/entry-01/counter','sga/entry-01/status','sga/zone-A/wifi','sga/zone-A/radar','sga/zone-C/wifi'])assert.ok(seen.has(t),t);
  c.publish('sga/entry-01/cmd',JSON.stringify({action:'gate',mode:'closed'}));
  await new Promise(r=>setTimeout(r,500));assert.equal(nodes.state.gateMode,'closed');
  const html=await fetch(`http://localhost:${hp}/`).then(r=>r.text());assert.match(html,/StoreGA/);
  nodes.stop();c.end(true);await b.close();
});
