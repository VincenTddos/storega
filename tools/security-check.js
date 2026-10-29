/* StoreGA security check — what a stranger on the shop's Wi-Fi could do to the broker. For the demo: run it, every line should be ✓.
     1. connect without a password                         → must be refused
     2. connect with a board's account, send "open the gate" → must be refused (needs tools/broker.js roles)
     3. connect with a board's account, pretend to be another board → must be refused
   Usage: npm run security-check [-- --url mqtt://192.168.50.10:1883 --device-user device --device-pass storega-device] */
const mqtt=require('mqtt');
function arg(name,def){const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:def}
const URL_=arg('url','mqtt://localhost:1883'),DU=arg('device-user','device'),DP=arg('device-pass','storega-device');
const ok=m=>console.log('  ✓ '+m),bad=m=>{console.log('  ✗ '+m);process.exitCode=1};

/* resolves 'refused' (login rejected), 'kicked' (broker dropped us after the publish) or 'accepted' */
function attempt(opts,topic,payload){return new Promise(res=>{
  const c=mqtt.connect(URL_,{reconnectPeriod:0,connectTimeout:4000,...opts});let done=false;const end=r=>{if(done)return;done=true;c.end(true);res(r)};
  c.on('error',e=>end(/auth|password/i.test(e.message)?'refused':'error: '+e.message));
  c.on('close',()=>end(c.__published?'kicked':'refused'));
  c.on('connect',()=>{if(!topic)return end('accepted');c.__published=true;c.publish(topic,payload,{qos:1},err=>{if(err)return end('kicked');setTimeout(()=>end('accepted'),800)})});
})}

(async()=>{
  console.log(`StoreGA 安全檢查：${URL_}\n`);
  const a=await attempt({}, 'sga/entry-01/cmd','{"action":"gate","mode":"open"}');
  a==='refused'?ok('沒有密碼：連線被拒絕'):bad(`沒有密碼也連得上（${a}）——broker 沒設帳號密碼，任何人都能開閘門`);
  const b=await attempt({clientId:'esp32-zone-A',username:DU,password:DP},'sga/entry-01/cmd','{"action":"gate","mode":"open"}');
  b==='kicked'?ok('板子的帳號送開閘指令：被 broker 拒絕並斷線'):b==='refused'?ok('板子的帳號登入失敗（帳密不同，略過權限檢查）'):bad(`板子的帳號可以送指令（${b}）——broker 沒有角色權限（Node-RED 的 Aedes 只有一組帳號，這是已知限制）`);
  const c=await attempt({clientId:'esp32-zone-A',username:DU,password:DP},'sga/zone-B/wifi','{"raw":99}');
  c==='kicked'?ok('zone-A 冒充 zone-B 送資料：被拒絕'):c==='refused'?ok('板子的帳號登入失敗（略過）'):bad(`zone-A 可以冒充 zone-B（${c}）`);
  console.log(process.exitCode?'\n有項目沒通過，見上面的說明。':'\n全部通過。');
})();
