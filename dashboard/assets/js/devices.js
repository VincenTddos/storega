/* StoreGA · 裝置: the five ESP32 nodes, their signal history and remote actions */
const DV={f:'all',q:'',sel:'entry-01',confirm:0};
const sigBars=(rssi,on)=>{const b=on?(rssi>-55?4:rssi>-65?3:rssi>-75?2:1):0;return`<span class="bars">${[5,8,11,14].map((h,i)=>`<i style="height:${h}px" class="${i<b?'on':''}"></i>`).join('')}</span>`};
function rebootNode(id){const n=S.nodes[id],now=performance.now();n.confirmUntil=0;n.rebootUntil=now+4000;n.fault=false;n.online=false;
  if(id==='zone-B'&&S.scenario==='fault')setScenario('normal');mqttCmd(id,{action:'reboot'});addAlert('rb-'+id,'info',`已送出重開指令給 ${id}`,'約 4 秒後重新連線。',{cool:0,target:{view:'devices',node:id}})}
function blinkNode(id){const n=S.nodes[id];n.blinkUntil=performance.now()+4000;mqttCmd(id,{action:'blink',seconds:4})}
function dStats(){const list=NODE_DEFS.map(d=>S.nodes[d.id]),on=list.filter(n=>n.online),avg=Math.round(on.reduce((a,n)=>a+n.rssi,0)/Math.max(1,on.length));
  const msgs=(Math.floor((S.t-OPEN)/5)*5+S.today.entries*2).toLocaleString();
  const it=[['cpu','在線節點',`${on.length}<small>/ 5</small>`,on.length===5?'全部正常':`${5-on.length} 個離線`],['wifi','平均訊號',`${avg}<small>dBm</small>`,avg>-65?'良好':'偏弱，考慮調整位置'],['plug','MQTT Broker',S.source==='mqtt'?'已連線':'模擬',S.source==='mqtt'?'Aedes · Node-RED':'Aedes（模擬器）'],['wave','今日訊息',msgs,'每 5 秒一次心跳']];
  const box=$('#dStats');if(!box.children.length)box.innerHTML=it.map(i=>`<div class="stat"><span class="label">${icon(i[0],14)}${i[1]}</span><b></b><p></p></div>`).join('');
  [...box.children].forEach((c,k)=>{const b=c.querySelector('b');if(b.innerHTML!==it[k][2])b.innerHTML=it[k][2];c.querySelector('p').textContent=it[k][3]})}
function renderDevices(){
  dStats();const now=performance.now(),q=DV.q.toLowerCase();let shown=0;
  if(!$('#dBody').children.length)$('#dBody').innerHTML=NODE_DEFS.map(d=>`<tr data-node="${d.id}" tabindex="0" aria-selected="false"><td><div class="nid">${d.id}</div><div class="nrole">${d.role}</div></td><td class="st"></td><td><span class="sigc"></span></td><td><svg class="rh" viewBox="0 0 200 40" preserveAspectRatio="none"></svg></td><td class="m ip"></td><td class="m up"></td><td class="m ls"></td></tr>`).join('');
  for(const d of NODE_DEFS){const n=S.nodes[d.id],tr=$(`#dBody tr[data-node="${d.id}"]`),reb=n.rebootUntil>now;
    const vis=(DV.f==='all'||(DV.f==='on')===n.online)&&(!q||(d.id+n.ip+d.parts+d.role).toLowerCase().includes(q));tr.hidden=!vis;if(vis)shown++;
    tr.setAttribute('aria-selected',DV.sel===d.id);
    const st=reb?['warn','重新開機中']:n.blinkUntil>now?['warn','閃燈中']:n.online?['ok','在線']:['crit','離線'];
    tr.querySelector('.st').innerHTML=`<span class="chip ${st[0]}"><i></i>${st[1]}</span>`;
    tr.querySelector('.sigc').innerHTML=sigBars(n.rssi,n.online)+(n.online?`${n.rssi} dBm`:'—');
    spark(tr.querySelector('.rh'),n.rssiHist.length>1?n.rssiHist.map(v=>v==null?null:v+100):[0,0],{min:10,max:60,color:n.online?'var(--ink-3)':'var(--crit)',fmt:v=>v,label:()=>''});
    tr.querySelector('.ip').textContent=n.ip;tr.querySelector('.up').textContent=n.online?dur(S.t-n.boot):'—';
    const ago=S.t-n.lastSeen;tr.querySelector('.ls').textContent=ago<3?'剛剛':`${Math.round(ago)} 秒前`}
  $('#dEmpty').hidden=shown>0;renderDrawer();
}
function renderDrawer(){const d=NODE_DEFS.find(x=>x.id===DV.sel),n=S.nodes[d.id],now=performance.now(),reb=n.rebootUntil>now,dr=$('#drawer');
  if(dr.dataset.id!==d.id){dr.dataset.id=d.id;dr.innerHTML=`<div class="dh"><span class="ic">${icon(d.id==='entry-01'?'door':'radar',20)}</span><div><b>${d.id}</b><small>${d.role}</small></div><span class="chip" id="drChip" style="margin-left:auto"></span></div>
    <div><span class="label">訊號 · 近 30 分鐘（dBm）</span><div class="chart" id="drChart" aria-label="${d.id} 訊號強度"></div></div>
    <dl id="drKv"></dl><div><span class="label" style="display:block;margin-bottom:8px">零件</span><div class="parts">${d.parts.split(' · ').map(p=>`<span>${p}</span>`).join('')}</div></div>
    <div class="topic"><code>sga/${d.id}/#</code><button class="btn ghost sm" data-copy="sga/${d.id}/#"><span class="mph">複製</span></button></div>
    <div class="acts3"><button class="btn sec sm" id="drLoc">${icon('pin',15)}定位</button><button class="btn sec sm" id="drBlink">${icon('zap',15)}<span class="mph" id="drBlinkL">閃燈</span></button><button class="btn sec sm" id="drReb">${icon('power',15)}<span class="mph" id="drRebL">重新開機</span></button></div>`;
    $('#drLoc').onclick=()=>{go('live');setTimeout(()=>{initTwin().then(()=>{window.twin?.focusNode(d.id);blinkNode(d.id)})},150)};
    $('#drBlink').onclick=()=>{blinkNode(d.id);morph($('#drBlinkL'),'閃燈中');toast('info',`${d.id} 閃燈中`,'板上 LED 會閃 4 秒，方便在現場找到它。',{label:'在 3D 中查看',fn:()=>$('#drLoc').click()});setTimeout(()=>morph($('#drBlinkL'),'閃燈'),4000)};
    $('#drReb').onclick=()=>{const b=$('#drReb');if(!DV.confirm||DV.confirm<performance.now()){DV.confirm=performance.now()+3000;b.classList.add('confirm');morph($('#drRebL'),'確認重開？');setTimeout(()=>{if(DV.confirm<=performance.now()){b.classList.remove('confirm');morph($('#drRebL'),'重新開機')}},3050);return}
      DV.confirm=0;b.classList.remove('confirm');morph($('#drRebL'),'重開中…');rebootNode(d.id);toast('info',`已送出重開指令給 ${d.id}`,'約 4 秒後重新連線。');setTimeout(()=>morph($('#drRebL'),'重新開機'),4200)}}
  const c=$('#drChip');c.className='chip '+(reb?'warn':n.online?'ok':'crit');c.innerHTML=`<i></i>${reb?'重開中':n.online?'在線':'離線'}`;
  $('#drKv').innerHTML=[['IP 位址',n.ip],['韌體',`v${n.fw}`],['運行時間',n.online?dur(S.t-n.boot):'—'],['最後回報',hhmmss(n.lastSeen)],['訊號',n.online?`${n.rssi} dBm`:'—']].map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('');
  const h=n.rssiHist.length?n.rssiHist:[n.rssi];
  chart($('#drChart'),{type:'line',h:140,x:h.map((_,i)=>i===h.length-1?'現在':`${h.length-1-i} 分前`),every:Math.max(1,Math.ceil(h.length/4)),yMax:100,yFmt:v=>`${Math.round(v-100)}`,tipX:i=>i===h.length-1?'現在':`${h.length-1-i} 分鐘前`,
    series:[{name:'訊號',color:n.online?PAL.ink:PAL.crit,area:true,values:h.map(v=>v==null?null:v+100),fmt:v=>`${Math.round(v-100)} dBm`}]});
  $('#drBlink').disabled=!n.online||reb;$('#drLoc').disabled=false;
}
function selectNode(id){DV.sel=id;renderDevices();if(innerWidth<=1280)$('#drawer').scrollIntoView({behavior:RM?'auto':'smooth',block:'start'})}
function initDevices(){
  $('#dSeg').addEventListener('pick',e=>{DV.f=e.detail.dataset.f;renderDevices()});
  $('#dQ').oninput=e=>{DV.q=e.target.value.trim();renderDevices()};
  $('#dBody').addEventListener('click',e=>{const tr=e.target.closest('tr');if(tr)selectNode(tr.dataset.node)});
  $('#dBody').addEventListener('keydown',e=>{if(e.key==='Enter'){const tr=e.target.closest('tr');if(tr)selectNode(tr.dataset.node)}});
  $('#blinkAll').onclick=()=>{NODE_DEFS.forEach(d=>{if(S.nodes[d.id].online)blinkNode(d.id)});toast('info','全部節點閃燈 4 秒','在現場逐一確認每顆 ESP32 的位置。')};
}
