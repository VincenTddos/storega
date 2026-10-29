/* StoreGA ⇄ Node-RED, one command:
     1. checks Node-RED is running (Admin API, default http://localhost:1880)
     2. installs node-red-contrib-aedes if it is missing (no restart needed)
     3. adds the StoreGA flow as its own tab — your other flows are left alone;
        if a broker already exists it asks first
     4. starts the five fake ESP32 nodes for a few seconds and waits for sga/system/state
     5. prints the address to type into the dashboard (設定 → 資料來源)
   Usage:  cd tools && npm install && npm run connect   [-- --url http://localhost:1880 --yes --mqtt-user storega --mqtt-pass <密碼>]
   With --mqtt-user/--mqtt-pass the Aedes node gets that login (it supports one shared account), so nobody on the Wi-Fi can publish without it. */
const fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),readline=require('readline');
const mqtt=require('mqtt');
const {startNodes}=require('./fake-nodes');

function arg(name,def){const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:def}
const NR=(arg('url','http://localhost:1880')).replace(/\/$/,''),YES=process.argv.includes('--yes'),MU=arg('mqtt-user',''),MP=arg('mqtt-pass','');
const FLOWS=path.join(__dirname,'..','node-red','flows.json');
const ok=m=>console.log('  ✓ '+m),info=m=>console.log('  · '+m),warn=m=>console.log('  ! '+m),step=m=>console.log('\n▸ '+m);
const fail=(m,hint)=>{console.log('\n  ✗ '+m);if(hint)console.log('    '+hint.split('\n').join('\n    '));process.exit(1)};
const ask=q=>YES?Promise.resolve(''):new Promise(r=>{const rl=readline.createInterface({input:process.stdin,output:process.stdout});rl.question('  ? '+q+' ',a=>{rl.close();r(a.trim())})});
const portOpen=(port,host='127.0.0.1')=>new Promise(r=>{const s=net.connect(port,host);s.setTimeout(800);s.on('connect',()=>{s.destroy();r(true)});s.on('error',()=>r(false));s.on('timeout',()=>{s.destroy();r(false)})});
async function api(method,p,body,extra={}){
  const res=await fetch(NR+p,{method,headers:{'Content-Type':'application/json',Accept:'application/json','Node-RED-API-Version':'v2',...extra},body:body?JSON.stringify(body):undefined});
  const text=await res.text();let json=null;try{json=JSON.parse(text)}catch{}
  if(res.status===401)fail('Node-RED 開了管理員登入（adminAuth），這個工具沒辦法代替你登入。','請照 node-red/README.md 手動安裝與匯入，或暫時關閉 settings.js 的 adminAuth。');
  if(!res.ok)throw new Error(`${method} ${p} → HTTP ${res.status} ${text.slice(0,200)}`);
  return json;
}
function lanIPs(){return Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==='IPv4'&&!i.internal).map(i=>i.address)}

(async()=>{
  console.log('StoreGA × Node-RED 連線設定');

  step(`確認 Node-RED 有在跑（${NR}）`);
  let settings;
  try{settings=await api('GET','/settings')}catch(e){
    fail(`連不到 ${NR}`,'Node-RED 還沒啟動。開一個新的終端機執行：\n  node-red\n（還沒安裝的話：npm install -g --unsafe-perm node-red）\n看到「Server now running at http://127.0.0.1:1880/」之後，再執行一次這個指令。\n如果 Node-RED 不在這台電腦或不是 1880 埠，加上 --url http://IP:埠');
  }
  ok(`Node-RED ${settings.version||''} 正在執行`);

  step('檢查 node-red-contrib-aedes');
  const nodes=await api('GET','/nodes');
  if((nodes||[]).some(n=>n.module==='node-red-contrib-aedes'))ok('已安裝');
  else{info('安裝中，第一次大約需要 30–90 秒…');
    try{await api('POST','/nodes',{module:'node-red-contrib-aedes'})}catch(e){fail('安裝失敗：'+e.message,'可以在 Node-RED 選單 → 管理節點 → 安裝，搜尋 node-red-contrib-aedes。\n學校網路擋 npm 的話，請改用手機熱點再試一次。')}
    ok('安裝完成（不需要重新啟動）')}

  step('匯入 StoreGA flow');
  const ours=JSON.parse(fs.readFileSync(FLOWS,'utf8'));
  const tab=ours.find(n=>n.type==='tab');
  const current=await api('GET','/flows');const all=Array.isArray(current)?current:current.flows;
  // Node-RED gives an imported tab a new id but keeps node ids, so find our tab through one of our nodes
  const mine=all.find(n=>n.id==='f_fusion'),existing=mine?mine.z:null;
  const otherBrokers=all.filter(n=>n.type==='aedes broker'&&n.id!=='sga_broker'&&n.z!==existing);
  let useOurBroker=true;
  if(otherBrokers.length){
    const b=otherBrokers[0],tabName=(all.find(n=>n.id===b.z)||{}).label||b.z;
    warn(`你原本的 flow「${tabName}」已經有 Aedes 節點「${b.name||b.id}」（MQTT ${b.mqtt_port||1883}，WebSocket ${b.mqtt_ws_port||'未開啟'}）。`);
    warn('兩個 Aedes 會搶同一個 1883 埠，所以 StoreGA 不會再加一個。');
    const a=await ask('用你原本的 broker、只匯入其他節點？ [Y/n]');
    if(/^n/i.test(a))fail('已取消，沒有改動任何東西。');
    useOurBroker=false;
    if(!b.mqtt_ws_port)warn('原本的 Aedes 沒有開 WebSocket：儀表板需要它。請在 Node-RED 雙擊那個 Aedes 節點，把 WebSocket port 設成 8080 再部署。');
  }else if(!existing&&!all.some(n=>n.id==='sga_broker')&&await portOpen(1883)){
    warn('1883 埠已經被別的程式使用（可能是 Mosquitto），StoreGA 的 Aedes 會啟動失敗。');
    const a=await ask('改用那個 broker、只匯入其他節點？ [Y/n]');
    if(/^n/i.test(a))fail('已取消，沒有改動任何東西。');
    useOurBroker=false;
    warn('儀表板要用 WebSocket 連 broker：Mosquitto 需要在 mosquitto.conf 加上 listener 8080 與 protocol websockets。');
  }
  const configs=ours.filter(n=>!n.z&&n.type!=='tab'),members=ours.filter(n=>n.z===tab.id&&(useOurBroker||n.type!=='aedes broker'));
  // the broker gets the login, and so does Node-RED's own MQTT client that talks to it
  if(MU&&MP){members.filter(n=>n.type==='aedes broker').forEach(n=>n.credentials={username:MU,password:MP});configs.filter(n=>n.type==='mqtt-broker').forEach(n=>n.credentials={user:MU,password:MP})}
  if(!useOurBroker)members.forEach(n=>{if(n.wires)n.wires=n.wires.map(o=>o.filter(id=>ours.find(x=>x.id===id&&x.type!=='aedes broker')))});
  const body={id:existing||tab.id,label:tab.label,info:tab.info,nodes:members,configs};
  if(existing){await api('PUT','/flow/'+existing,body);ok('已更新原本的「StoreGA」分頁並部署')}
  else{await api('POST','/flow',body);ok('已新增「StoreGA」分頁並部署（其他分頁沒有改動）')}

  step('等待 MQTT broker 就緒（1883）');
  let up=false;for(let i=0;i<20&&!(up=await portOpen(1883));i++)await new Promise(r=>setTimeout(r,500));
  if(!up)fail('1883 埠沒有開啟','打開 Node-RED 看「StoreGA」分頁的 Aedes 節點狀態；防毒或防火牆可能擋住了。');
  ok('1883 已開啟');
  const wsUp=await portOpen(8080);wsUp?ok('WebSocket 8080 已開啟（儀表板用）'):warn('WebSocket 8080 沒有開啟，儀表板會連不上');

  step('用 5 個模擬 ESP32 測試，等 sga/system/state');
  const login=MU&&MP?{username:MU,password:MP}:{};
  const fake=startNodes({url:'mqtt://localhost:1883',quiet:true,...login});
  const sub=mqtt.connect('mqtt://localhost:1883',{clientId:'storega-connect-check',...login});
  const state=await new Promise(res=>{const t=setTimeout(()=>res(null),15000);
    sub.on('connect',()=>sub.subscribe('sga/system/state'));
    sub.on('message',(tp,buf)=>{try{const m=JSON.parse(buf);if(m.nodes&&Object.values(m.nodes).filter(n=>n.online).length>=5){clearTimeout(t);res(m)}}catch{}})});
  fake.stop();sub.end(true);
  if(!state)fail('15 秒內沒有收到 sga/system/state','打開 Node-RED → StoreGA 分頁，看「感測融合與規則」節點下方的狀態文字與右側除錯面板的錯誤。');
  ok(`收到整店狀態：場內 ${state.occupancy}/${state.capacity} 人、進場 ${state.entries}、結帳 ${state.checkouts}、k ${state.k}、5/5 節點在線`);
  info('模擬節點已停止；Node-RED 會在 15 秒後把它們標為離線，這是正常的。');

  step('儀表板要填的位址（選「真實模式」，或 設定 → 資料來源）');
  console.log('    同一台電腦：  ws://localhost:8080');
  for(const ip of lanIPs())console.log(`    其他電腦／手機：ws://${ip}:8080`);
  console.log(MU?`    帳號 ${MU} / 你設定的密碼（儀表板與 config.h 的 MQTT_USER／MQTT_PASS 都填這組）`:'    ! broker 沒有設帳號密碼：同一個 Wi-Fi 的人都能發指令。加上 --mqtt-user 與 --mqtt-pass 重新執行即可。');
  console.log('\n  ESP32 的 config.h 裡 MQTT_HOST 填上面那個 IP，埠 1883。');
  console.log('  沒有板子時想繼續看資料：node fake-nodes.js --url mqtt://localhost:1883\n');
  process.exit(0);
})().catch(e=>fail(e.message));
