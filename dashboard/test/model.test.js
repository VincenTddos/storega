/* Loads dashboard/assets/js/util.js + model.js in a sandbox (no browser) and checks the simulator and the MQTT mapping.
   Run: node --test dashboard/test/*.test.js */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
function load(){
  const ctx={console,performance,Math,Date,JSON,setTimeout,clearTimeout,localStorage:undefined,
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
  const c=load();run(c,`S.source='mqtt';S.preroll=false;
    onMqtt('sga/entry-01/counter',{in:50,out:40,occupancy:10,queue:2,checkout:7,gate:false,temp:26.5,hum:55,mode:'closed',capacity:30});
    onMqtt('sga/zone-B/wifi',{raw:8});onMqtt('sga/zone-B/radar',{presence:true,moving:true});onMqtt('sga/zone-D/status',{rssi:-61,ip:'10.0.0.9',fw:'9.9.9',uptime:100})`);
  assert.deepEqual(val(c,'[occ(),S.queue,S.today.checkouts,S.gateOpen,S.gateMode,S.capacity,S.temp]'),[10,2,7,false,'closed',30,26.5]);
  assert.equal(run(c,'S.zones.B.est'),Math.round(8*run(c,'S.k')));
  assert.deepEqual(val(c,'[S.nodes["zone-D"].rssi,S.nodes["zone-D"].ip,S.nodes["zone-D"].fw]'),[-61,'10.0.0.9','9.9.9']);
  run(c,`onMqtt('sga/entry-01/counter',{in:53});`);assert.equal(run(c,'hourAt(S.t).entries'),3,'only the delta goes into this hour');
  run(c,`onMqtt('sga/zone-A/status',{online:false});checkNodes()`);assert.equal(run(c,'S.nodes["zone-A"].online'),false);
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
