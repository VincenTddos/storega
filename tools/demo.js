/* One command for a full hardware-free demo: local broker + dashboard server + five fake ESP32 nodes.
   Usage: npm run demo [-- --speed 10 --scenario surge]   then open http://localhost:8080 and connect to ws://localhost:8080 */
const {startBroker}=require('./broker');
const {startNodes}=require('./fake-nodes');
startBroker().then(()=>{const n=startNodes({url:'mqtt://localhost:'+(process.env.MQTT_PORT||1883)});
  console.log('\n打開 http://localhost:8080 → 設定 → 資料來源 → Node-RED（MQTT）→ 位址 ws://localhost:8080 → 連線\n');
  process.on('SIGINT',()=>{n.stop();process.exit(0)})});
