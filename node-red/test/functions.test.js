/* Runs the Node-RED function files the way Node-RED does (msg/flow/node/env in scope) without starting Node-RED. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
function harness(){const ctx={},statuses=[];
  const flow={get:k=>ctx[k],set:(k,v)=>{ctx[k]=v}},node={status:s=>statuses.push(s),warn(){},error(){}},env={get:()=>undefined};
  const run=(file,msg)=>new Function('msg','flow','node','env',fs.readFileSync(path.join(__dirname,'..','functions',file),'utf8'))(msg,flow,node,env);
  return{run,ctx,statuses}}
const send=(h,topic,payload)=>h.run('fusion.js',{topic,payload});

test('fusion: radar says empty → zone is 0 even if Wi-Fi hears phones',()=>{
  const h=harness();send(h,'sga/zone-A/wifi',{raw:10});const[,,]=send(h,'sga/zone-A/radar',{presence:false,moving:false});
  assert.equal(h.ctx.sga.zones.A.est,0);
  send(h,'sga/zone-A/radar',{presence:true});assert.equal(h.ctx.sga.zones.A.est,Math.round(10*0.62));
  send(h,'sga/zone-C/wifi',{raw:10});assert.equal(h.ctx.sga.zones.C.est,6,'zone C has no radar, Wi-Fi × k only');
});

test('fusion: capacity alerts fire once per cool-down, crit at 100%',()=>{
  const h=harness();
  let [,a]=send(h,'sga/entry-01/counter',{in:50,out:18,occupancy:32,queue:0,checkout:9,gate:true});
  assert.equal(a.length,1);assert.equal(a[0].payload.key,'cap80');
  [,a]=send(h,'sga/entry-01/counter',{occupancy:33});assert.equal(a,null,'no repeat inside cool-down');
  [,a]=send(h,'sga/entry-01/counter',{occupancy:40,queue:3,gate:false});assert.equal(a[0].payload.level,'crit');
});

test('fusion: dashboard commands update what Node-RED remembers',()=>{
  const h=harness();send(h,'sga/entry-01/cmd',{action:'capacity',value:25});send(h,'sga/entry-01/cmd',{action:'gate',mode:'closed'});
  assert.equal(h.ctx.sga.capacity,25);assert.equal(h.ctx.sga.gateMode,'closed');
  send(h,'sga/entry-01/cmd',{action:'capacity',value:500});assert.equal(h.ctx.sga.capacity,25,'out-of-range ignored');
});

test('heartbeat: offline after 15 s of silence, back online once',()=>{
  const h=harness();send(h,'sga/zone-B/status',{rssi:-60});h.run('heartbeat.js',{});
  h.ctx.sga.nodes['zone-B'].last=Date.now()-16000;let[o]=h.run('heartbeat.js',{});
  assert.equal(o[0].payload.key,'off-zone-B');assert.equal(h.run('heartbeat.js',{})[0],null,'not repeated');
  send(h,'sga/zone-B/status',{rssi:-58});[o]=h.run('heartbeat.js',{});assert.equal(o[0].payload.key,'on-zone-B');
});

test('last will marks a board offline immediately',()=>{
  const h=harness();send(h,'sga/zone-D/status',{rssi:-50});send(h,'sga/zone-D/status',{online:false});
  assert.equal(h.ctx.sga.nodes['zone-D'].last,0);
});

test('calibrate: blends toward door count; manual sends a command',()=>{
  const h=harness();send(h,'sga/entry-01/counter',{occupancy:20});
  for(const z of'ABCD'){send(h,`sga/zone-${z}/status`,{rssi:-50});send(h,`sga/zone-${z}/wifi`,{raw:10});send(h,`sga/zone-${z}/radar`,{presence:true})}
  assert.equal(h.run('calibrate.js',{payload:Date.now()}),null);assert.ok(Math.abs(h.ctx.sga.k-(0.7*0.62+0.3*0.5))<1e-9);
  const m=h.run('calibrate.js',{payload:'now'});assert.equal(m.topic,'sga/entry-01/cmd');assert.equal(m.payload.k,0.5);
});

test('daily: entries land in their hour; a new day archives a summary and saves the history',()=>{
  const h=harness(),at=(hh,mm,d='2026-10-28')=>new Date(`${d}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`).getTime();
  send(h,'sga/entry-01/counter',{in:0,out:0,occupancy:0,checkout:0});h.run('daily.js',{now:at(10,0)});
  send(h,'sga/entry-01/counter',{in:12,out:4,occupancy:8,checkout:3});h.run('daily.js',{now:at(10,30)});
  send(h,'sga/entry-01/counter',{in:30,out:20,occupancy:10,checkout:9});let r=h.run('daily.js',{now:at(12,5)});
  assert.deepEqual(r,[null,null],'nothing to publish mid-day');assert.deepEqual(h.ctx.sgaDay.hourly.slice(0,3),[12,0,18]);assert.equal(h.ctx.sgaDay.occ[25],10);
  send(h,'sga/entry-01/counter',{in:2,out:0,occupancy:2,checkout:0});r=h.run('daily.js',{now:at(10,1,'2026-10-29')});
  assert.equal(r[0].payload.days.length,1);const d=r[0].payload.days[0];
  assert.deepEqual([d.date,d.entries,d.checkouts,d.hourly[2]],['2026-10-28',30,9,18]);assert.deepEqual(JSON.parse(r[1].payload),r[0].payload.days,'the same history goes to the file');
  assert.equal(h.ctx.sgaDay.date,'2026-10-29');
  const h2=harness();r=h2.run('daily.js',{history:JSON.parse(r[1].payload)});assert.equal(r[0].payload.days[0].entries,30,'after a restart the file is loaded and republished');
});

test('fusion: the entry board zeroing the room after closing is reported once',()=>{
  const h=harness();const[,a]=send(h,'sga/entry-01/event',{type:'auto_zero',was:3});assert.equal(a[0].payload.key,'autozero');assert.match(a[0].payload.detail,/3 人/);
  const[,,c]=send(h,'sga/entry-01/ack',{id:'c1',action:'gate',ok:true});assert.equal(c,null);
});

test('flows.json is valid and every wire points at a real node',()=>{
  const f=JSON.parse(fs.readFileSync(path.join(__dirname,'..','flows.json'),'utf8')),ids=new Set(f.map(n=>n.id));
  for(const n of f)for(const out of n.wires||[])for(const t of out)assert.ok(ids.has(t),`${n.id} → ${t}`);
  for(const n of f.filter(n=>n.type==='function'))assert.doesNotThrow(()=>new Function('msg','flow','node','env',n.func),n.name);
});
