/* Builds node-red/flows.json from the readable function files in node-red/functions/.
   Run: node node-red/build-flows.js   (then import flows.json in Node-RED: 選單 → 匯入) */
const fs=require('fs'),path=require('path');
const fn=f=>fs.readFileSync(path.join(__dirname,'functions',f),'utf8');
const T='sga_tab',B='sga_broker',C='sga_client';
let y=60;const row=()=>(y+=80);
const flows=[
  {id:T,type:'tab',label:'StoreGA',info:'ESP32 → Aedes → 融合 / 規則 → 儀表板。說明見 repo 的 node-red/README.md。'},
  {id:'c_title',type:'comment',z:T,name:'StoreGA：MQTT broker、感測融合、心跳、自動校正、整點紀錄',info:'所有主題格式見 docs/mqtt.md',x:330,y:20,wires:[]},

  {id:B,type:'aedes broker',z:T,name:'Aedes（1883 / ws 8080）',mqtt_port:1883,mqtt_ws_bind:'port',mqtt_ws_port:8080,mqtt_ws_path:'',cert:'',key:'',certname:'',keyname:'',persistence_bind:'memory',dburl:'',usetls:false,x:180,y:row(),wires:[['d_events'],[]]},
  {id:'d_events',type:'debug',z:T,name:'連線事件',active:false,tosidebar:true,console:false,tostatus:false,complete:'payload',targetType:'msg',x:460,y,wires:[]},

  {id:C,type:'mqtt-broker',name:'StoreGA 本機 broker',broker:'localhost',port:'1883',clientid:'node-red-storega',autoConnect:true,usetls:false,protocolVersion:'4',keepalive:'60',cleansession:true,
    birthTopic:'sga/system/online',birthQos:'0',birthRetain:'true',birthPayload:'{"online":true}',birthMsg:{},closeTopic:'',closeQos:'0',closePayload:'',closeMsg:{},
    willTopic:'sga/system/online',willQos:'0',willRetain:'true',willPayload:'{"online":false}',willMsg:{},userProps:'',sessionExpiry:''},

  {id:'m_in',type:'mqtt in',z:T,name:'所有節點 sga/+/+',topic:'sga/+/+',qos:'0',datatype:'json',broker:C,nl:false,rap:true,rh:0,inputs:0,x:160,y:row(),wires:[['f_fusion']]},
  {id:'f_fusion',type:'function',z:T,name:'感測融合與規則',func:fn('fusion.js'),outputs:3,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:420,y,wires:[['o_state'],['o_alert','d_alert'],['o_cmd']]},
  {id:'o_state',type:'mqtt out',z:T,name:'sga/system/state',topic:'sga/system/state',qos:'0',retain:'true',respTopic:'',contentType:'',userProps:'',correl:'',expiry:'',broker:C,x:700,y:y-40,wires:[]},
  {id:'o_alert',type:'mqtt out',z:T,name:'sga/system/alert',topic:'sga/system/alert',qos:'1',retain:'false',respTopic:'',contentType:'',userProps:'',correl:'',expiry:'',broker:C,x:700,y,wires:[]},
  {id:'d_alert',type:'debug',z:T,name:'告警',active:true,tosidebar:true,console:false,tostatus:false,complete:'payload.title',targetType:'msg',x:680,y:y+40,wires:[]},
  {id:'o_cmd',type:'mqtt out',z:T,name:'下行指令（topic 由 msg 決定）',topic:'',qos:'1',retain:'false',respTopic:'',contentType:'',userProps:'',correl:'',expiry:'',broker:C,x:730,y:y+80,wires:[]},

  {id:'i_hb',type:'inject',z:T,name:'每 5 秒',props:[{p:'payload'}],repeat:'5',crontab:'',once:true,onceDelay:'3',topic:'',payload:'',payloadType:'date',x:150,y:row()+60,wires:[['f_hb']]},
  {id:'f_hb',type:'function',z:T,name:'心跳檢查（15 秒）',func:fn('heartbeat.js'),outputs:1,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:400,y,wires:[['o_alert','d_alert']]},

  {id:'i_k',type:'inject',z:T,name:'每分鐘',props:[{p:'payload'}],repeat:'60',crontab:'',once:false,onceDelay:'',topic:'',payload:'',payloadType:'date',x:150,y:row(),wires:[['f_k']]},
  {id:'i_know',type:'inject',z:T,name:'立即校正',props:[{p:'payload'}],repeat:'',crontab:'',once:false,onceDelay:'',topic:'',payload:'now',payloadType:'str',x:150,y:y+40,wires:[['f_k']]},
  {id:'m_btn',type:'mqtt in',z:T,name:'入口校正按鈕 sga/+/event',topic:'sga/+/event',qos:'0',datatype:'json',broker:C,nl:false,rap:true,rh:0,inputs:0,x:180,y:y+80,wires:[['f_btn']]},
  {id:'f_btn',type:'function',z:T,name:'按鈕 → 立即校正',func:"if(msg.payload&&msg.payload.action==='calibrate')return {payload:'now'};\nreturn null;",outputs:1,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:420,y:y+80,wires:[['f_k']]},
  {id:'f_k',type:'function',z:T,name:'自動校正 k',func:fn('calibrate.js'),outputs:1,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:390,y,wires:[['o_cmd']]},

  {id:'i_hour',type:'inject',z:T,name:'每小時整點',props:[{p:'payload'}],repeat:'',crontab:'0 10-22 * * *',once:false,onceDelay:'',topic:'',payload:'',payloadType:'date',x:160,y:row()+40,wires:[['f_hour']]},
  {id:'f_hour',type:'function',z:T,name:'整點紀錄 CSV',func:fn('hourly.js'),outputs:1,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:390,y,wires:[['w_csv']]},
  {id:'w_csv',type:'file',z:T,name:'storega-log.csv',filename:'storega-log.csv',filenameType:'str',appendNewline:true,createDir:true,overwriteFile:'false',encoding:'utf8',x:620,y,wires:[[]]},

  {id:'i_day',type:'inject',z:T,name:'每分鐘',props:[{p:'payload'}],repeat:'60',crontab:'',once:true,onceDelay:'8',topic:'',payload:'',payloadType:'date',x:150,y:row()+40,wires:[['f_day']]},
  {id:'i_hload',type:'inject',z:T,name:'部署時讀取歷史',props:[{p:'payload'}],repeat:'',crontab:'',once:true,onceDelay:'2',topic:'',payload:'',payloadType:'date',x:170,y:y+40,wires:[['r_hist']]},
  {id:'r_hist',type:'file in',z:T,name:'storega-history.json',filename:'storega-history.json',filenameType:'str',format:'utf8',chunk:false,sendError:false,encoding:'utf8',allProps:false,x:410,y:y+40,wires:[['f_hparse']]},
  {id:'c_hist',type:'catch',z:T,name:'第一次還沒有檔案',scope:['r_hist'],uncaught:false,x:410,y:y+80,wires:[['f_hparse']]},
  {id:'f_hparse',type:'function',z:T,name:'解析歷史',func:"let h=[];try{if(!msg.error)h=JSON.parse(msg.payload)}catch(e){node.warn('storega-history.json 無法解析，從空的開始')}\nreturn {history:Array.isArray(h)?h:[]};",outputs:1,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:620,y:y+40,wires:[['f_day']]},
  {id:'f_day',type:'function',z:T,name:'每日紀錄與歷史',func:fn('daily.js'),outputs:2,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:400,y,wires:[['o_hist'],['w_hist']]},
  {id:'o_hist',type:'mqtt out',z:T,name:'sga/system/history',topic:'sga/system/history',qos:'1',retain:'true',respTopic:'',contentType:'',userProps:'',correl:'',expiry:'',broker:C,x:660,y,wires:[]},
  {id:'w_hist',type:'file',z:T,name:'storega-history.json',filename:'storega-history.json',filenameType:'str',appendNewline:false,createDir:true,overwriteFile:'true',encoding:'utf8',x:660,y:y+40,wires:[[]]},

  {id:'i_cfg',type:'inject',z:T,name:'部署時下發上限',props:[{p:'payload'}],repeat:'',crontab:'',once:true,onceDelay:'5',topic:'',payload:'',payloadType:'date',x:170,y:row()+20,wires:[['f_cfg']]},
  {id:'f_cfg',type:'function',z:T,name:'上限 → entry-01',func:"const st=flow.get('sga');const cap=(st&&st.capacity)||Number(env.get('STOREGA_CAPACITY'))||40;\nreturn {topic:'sga/entry-01/cmd',payload:{action:'capacity',value:cap}};",outputs:1,timeout:0,noerr:0,initialize:'',finalize:'',libs:[],x:400,y,wires:[['o_cmd']]}
];
fs.writeFileSync(path.join(__dirname,'flows.json'),JSON.stringify(flows,null,2)+'\n');
console.log(`flows.json：${flows.length} 個節點`);
