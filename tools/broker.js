/* StoreGA local broker: the same thing Node-RED's Aedes node does, so the dashboard's MQTT mode can be tested on any laptop.
     TCP  mqtt://localhost:1883   ← ESP32 nodes / fake-nodes.js / Node-RED
     HTTP http://localhost:8080   ← the dashboard itself
     WS   ws://localhost:8080     ← the dashboard's MQTT connection (設定 → 資料來源)
   Usage: node broker.js [--mqtt 1883] [--http 8080] [--quiet]                                   */
const net=require('net'),http=require('http'),fs=require('fs'),path=require('path');
const aedes=require('aedes')(),ws=require('websocket-stream');

function arg(name,def){const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:def}
const MQTT_PORT=+arg('mqtt',process.env.MQTT_PORT||1883),HTTP_PORT=+arg('http',process.env.HTTP_PORT||8080),QUIET=process.argv.includes('--quiet');
const ROOT=path.join(__dirname,'..','dashboard');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const log=(...a)=>{if(!QUIET)console.log(new Date().toTimeString().slice(0,8),...a)};

function startBroker({mqttPort=MQTT_PORT,httpPort=HTTP_PORT}={}){
  const tcp=net.createServer(aedes.handle);
  const web=http.createServer((req,res)=>{
    const u=decodeURIComponent(req.url.split('?')[0]),f=path.normalize(path.join(ROOT,u==='/'?'index.html':u));
    if(!f.startsWith(ROOT)){res.writeHead(403).end();return}
    fs.readFile(f,(err,buf)=>{if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'}).end('找不到 '+u);return}
      res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(buf)});
  });
  ws.createServer({server:web},aedes.handle);
  aedes.on('client',c=>log('＋ 連線',c.id));
  aedes.on('clientDisconnect',c=>log('－ 離線',c.id));
  aedes.on('subscribe',(subs,c)=>log('  訂閱',c?.id,subs.map(s=>s.topic).join(', ')));
  aedes.on('publish',(p,c)=>{if(c&&/\/cmd$/.test(p.topic))log('→ 指令',p.topic,p.payload.toString())});
  return Promise.all([new Promise(r=>tcp.listen(mqttPort,r)),new Promise(r=>web.listen(httpPort,r))]).then(()=>{
    log(`MQTT broker   mqtt://localhost:${mqttPort}`);
    log(`儀表板        http://localhost:${httpPort}`);
    log(`WebSocket     ws://localhost:${httpPort}   ← 在儀表板「設定 → 資料來源」輸入這個`);
    return{aedes,close:()=>Promise.all([new Promise(r=>tcp.close(r)),new Promise(r=>web.close(r)),new Promise(r=>aedes.close(r))])};
  });
}
module.exports={startBroker};
if(require.main===module)startBroker().catch(e=>{console.error(e.code==='EADDRINUSE'?`埠已被占用：${e.port}，用 --mqtt / --http 換一個`:e);process.exit(1)});
