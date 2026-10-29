/* StoreGA local broker: the same thing Node-RED's Aedes node does, so the dashboard's MQTT mode can be tested on any laptop.
     TCP  mqtt://localhost:1883   ← ESP32 nodes / fake-nodes.js / Node-RED
     HTTP http://localhost:8080   ← the dashboard itself
     WS   ws://localhost:8080     ← the dashboard's MQTT connection (設定 → 資料來源)
   Every client logs in, and each role may only do its own job (least privilege):
     device     ESP32 boards, clientId esp32-<node>: publish only sga/<node>/{counter,status,event,wifi,radar,ack}, subscribe only sga/<node>/cmd
     dashboard  the web UI: publish only sga/<node>/cmd (it cannot fake sensor data), subscribe sga/#
     server     Node-RED and the tools: anything
   Accounts come from --users file.json ({"name":{"password":"…","role":"device"}}) or the defaults below; --no-auth turns it off.
   Usage: node broker.js [--mqtt 1883] [--http 8080] [--users users.json] [--no-auth] [--quiet]   */
const net=require('net'),http=require('http'),fs=require('fs'),path=require('path');
const {Aedes}=require('aedes'),{WebSocketServer,createWebSocketStream}=require('ws');

function arg(name,def){const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:def}
const MQTT_PORT=+arg('mqtt',process.env.MQTT_PORT||1883),HTTP_PORT=+arg('http',process.env.HTTP_PORT||8080),QUIET=process.argv.includes('--quiet');
const ROOT=path.join(__dirname,'..','dashboard');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const log=(...a)=>{if(!QUIET)console.log(new Date().toTimeString().slice(0,8),...a)};
/* demo accounts — change them (or pass --users) before the boards go anywhere but a classroom */
const DEFAULT_USERS={device:{password:'storega-device',role:'device'},dashboard:{password:'storega-dashboard',role:'dashboard'},'node-red':{password:'storega-server',role:'server'}};
const NODES=['entry-01','zone-A','zone-B','zone-C','zone-D'],UP=['counter','status','event','wifi','radar','ack'];
function loadUsers(){const f=arg('users',process.env.STOREGA_USERS);return f?JSON.parse(fs.readFileSync(f,'utf8')):DEFAULT_USERS}
/* the rules, kept as plain functions so the tests can check them without a network */
function canPublish(role,clientId,topic){const [root,node,kind]=topic.split('/');if(role==='server')return true;if(root!=='sga'||topic.split('/').length!==3)return false;
  if(role==='dashboard')return NODES.includes(node)&&kind==='cmd';
  if(role==='device')return clientId==='esp32-'+node&&UP.includes(kind);
  return false}
function canSubscribe(role,clientId,topic){if(role==='server'||role==='dashboard')return topic.startsWith('sga/');
  if(role==='device'){const node=clientId.replace(/^esp32-/,'');return topic===`sga/${node}/cmd`}
  return false}

async function startBroker({mqttPort=MQTT_PORT,httpPort=HTTP_PORT,auth=!process.argv.includes('--no-auth'),users=loadUsers()}={}){
  const aedes=await Aedes.createBroker();
  if(auth){
    aedes.authenticate=(client,username,password,done)=>{const u=users[username];
      if(u&&password&&password.toString()===u.password){client.role=u.role;return done(null,true)}
      log('✗ 拒絕登入',client.id,username||'（沒有帳號）');const e=new Error('帳號或密碼錯誤');e.returnCode=4;done(e,false)};
    aedes.authorizePublish=(client,packet,done)=>{if(!client)return done(null);  // the broker's own messages (e.g. last wills it already accepted)
      if(canPublish(client.role,client.id,packet.topic))return done(null);log('✗ 不允許發布',client.id,`(${client.role})`,packet.topic);done(new Error('not allowed'))};
    aedes.authorizeSubscribe=(client,sub,done)=>{if(canSubscribe(client.role,client.id,sub.topic))return done(null,sub);log('✗ 不允許訂閱',client.id,sub.topic);done(null,null)};
  }
  const tcp=net.createServer(aedes.handle);
  const web=http.createServer((req,res)=>{
    const u=decodeURIComponent(req.url.split('?')[0]),f=path.normalize(path.join(ROOT,u==='/'?'index.html':u));
    if(!f.startsWith(ROOT)){res.writeHead(403).end();return}
    fs.readFile(f,(err,buf)=>{if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'}).end('找不到 '+u);return}
      res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(buf)});
  });
  new WebSocketServer({server:web}).on('connection',(sock,req)=>{const stream=createWebSocketStream(sock);stream.on('error',()=>{});aedes.handle(stream,req)});
  aedes.on('client',c=>log('＋ 連線',c.id));
  aedes.on('clientDisconnect',c=>log('－ 離線',c.id));
  aedes.on('subscribe',(subs,c)=>log('  訂閱',c?.id,subs.map(s=>s.topic).join(', ')));
  aedes.on('publish',(p,c)=>{if(c&&/\/cmd$/.test(p.topic))log('→ 指令',p.topic,p.payload.toString())});
  return Promise.all([new Promise(r=>tcp.listen(mqttPort,r)),new Promise(r=>web.listen(httpPort,r))]).then(()=>{
    log(`MQTT broker   mqtt://localhost:${mqttPort}`);
    log(`儀表板        http://localhost:${httpPort}`);
    log(`WebSocket     ws://localhost:${httpPort}   ← 在儀表板選「真實模式」輸入這個`);
    log(auth?`帳號密碼      儀表板 dashboard / ${users.dashboard?.password??'（見 --users）'} · 板子 device / ${users.device?.password??'（見 --users）'}`:'帳號密碼      已關閉（--no-auth）');
    return{aedes,close:()=>Promise.all([new Promise(r=>tcp.close(r)),new Promise(r=>web.close(r)),new Promise(r=>aedes.close(r))])};
  });
}
module.exports={startBroker,canPublish,canSubscribe,DEFAULT_USERS};
if(require.main===module)startBroker().catch(e=>{console.error(e.code==='EADDRINUSE'?`埠已被占用：${e.port}，用 --mqtt / --http 換一個`:e);process.exit(1)});
