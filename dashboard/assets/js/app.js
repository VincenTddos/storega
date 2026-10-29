/* StoreGA · shell: routing, the top bar, notifications, shortcuts and start-up */
const PAGES={overview:'總覽',live:'即時店況',analytics:'分析',events:'事件',devices:'裝置',settings:'設定'};
let view='overview';

/* ---------- routing: #page or #settings/sub ---------- */
function go(h){if(location.hash.slice(1)===h)route();else location.hash=h}
function route(){
  const [p,sub]=location.hash.slice(1).split('/'),nv=PAGES[p]?p:'overview',changed=nv!==view;view=nv;
  $$('.page').forEach(s=>s.classList.toggle('on',s.id==='p-'+view));
  $$('.nav a').forEach(a=>a.toggleAttribute('aria-current',a.dataset.page===view));$('.nav a[aria-current]')?.setAttribute('aria-current','page');
  $('#crumb').textContent=PAGES[view];document.title=`${PAGES[view]} · StoreGA`;closePops();closePal();hideTip();
  if(view==='settings')setSettingsSub(sub);
  if(view==='live')initTwin().then(()=>window.twin?.resize());
  if(changed){$('#main').focus({preventScroll:true});scrollTo({top:0,behavior:'auto'})}
  requestAnimationFrame(()=>{placeAll();renderPage()});
}
function goTarget(t){if(!t)return;closePops();
  if(t.view==='devices'){go('devices');if(t.node)setTimeout(()=>selectNode(t.node),60)}
  else if(t.zone){go('live');setTimeout(()=>selectZone(t.zone,true),300)}
  else go(t.view||'overview')}
function renderPage(){({overview:renderOverview,live:renderLive,analytics:renderAnalytics,events:renderEvents,devices:renderDevices,settings:renderSettings})[view]?.()}

/* ---------- shell: source pill, clock, freshness, badges ---------- */
function renderShell(){
  const sn=snap(),live=S.source==='mqtt',ago=(performance.now()-S.lastData)/1000,stale=live&&ago>15&&!S.paused;
  const b=$('#simBtn');b.className='simbtn'+(sn?' replay':S.paused?' paused':live?' live':'');
  $('#simLbl').textContent=sn?`回放 ${hhmm(sn.t)}`:S.paused?'已暫停':live?(stale?`延遲 ${Math.round(ago)} 秒`:'Node-RED 即時'):`模擬器 · ${S.speed}×`;
  $('#clk').textContent=hhmmss(sn?sn.t:S.t);
  $('#srcTag').textContent=live?'LIVE':'SIM';$('#srcName').textContent=live?'Node-RED 已連線':'模擬器運作中';$('#srcDesc').textContent=live?'Aedes broker · sga/+/+':'不需要硬體 · 5 個節點';
  $('#fresh').textContent=ago<2?'剛剛':`${Math.round(ago)} 秒前`;
  $('#spSrc').textContent=live?'Node-RED（MQTT）':'模擬器（不需要硬體）';setSeg($('#speedSeg'),x=>+x.dataset.speed===S.speed);
  $$('#speedSeg button').forEach(x=>x.disabled=live);$$('#scnList button').forEach(x=>{x.disabled=live;x.setAttribute('aria-checked',x.dataset.scn===S.scenario)});
  $('#toLive').hidden=!sn;renderBadges();renderBanner();
}
function renderBadges(){
  const n=S.alerts.filter(a=>!a.ack&&a.level!=='info').length,off=NODE_DEFS.filter(d=>!S.nodes[d.id].online).length;
  const ab=$('[data-badge="alerts"]');ab.hidden=!n;ab.textContent=n>99?'99+':n;
  const nb=$('[data-badge="nodes"]');nb.textContent=off?`${off} 離線`:'5';nb.classList.toggle('soft',!off);
  const bb=$('#bellBtn .nb'),s=n>99?'99+':String(n);if(bb.textContent!==s&&n){bb.classList.remove('pop');void bb.offsetWidth;bb.classList.add('pop')}bb.textContent=s;bb.hidden=!n;
}
function renderBellList(){const L=S.alerts.filter(a=>!a.ack&&a.level!=='info').slice(0,8),n=S.alerts.filter(a=>!a.ack&&a.level!=='info').length;
  $('#bellList').innerHTML=L.length?L.map(a=>`<div class="nt unread ${a.level}" data-id="${a.id}" tabindex="0"><span class="dot"></span><div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div><time>${hhmm(a.t)}<button class="btn ghost sm ack" data-back="${a.id}">處理</button></time></div>`).join('')
    :`<div class="nempty"><span class="ok">${icon('check',20)}</span><br>沒有未處理的告警</div>`;
  $('#bellCount').textContent=n?`共 ${n} 則未處理`:'';$('#ackAll').disabled=!n}
function onAlert(a){if(a.level==='info')return;const b=$('#bellBtn');b.classList.remove('ringit');void b.offsetWidth;b.classList.add('ringit');if(!$('#bellPop').hidden)renderBellList()}
onLiveReset=()=>{replayIdx=null;receiptStart();OV.lastEntries=null;dots=[];window.twin?.reset();EV.key='';renderShell();renderPage();
  toast('ok','已切換到即時資料',S.offHours?'現在不在營業時間，時間軸從 10:00 開始計算。':'今天的數字從現在開始累積。')};
/* one line under the top bar when the data itself needs explaining */
function renderBanner(){const b=$('#sysBanner'),live=S.source==='mqtt',ago=(performance.now()-S.lastData)/1000,act=$('#sysAct');let txt='',btn='';
  if(live&&ago>15&&!S.paused){txt=`<b>資料延遲 ${Math.round(ago)} 秒</b>　沒有收到任何節點的訊息，畫面停在 ${hhmmss(S.t-ago)} 的最後一筆；連線恢復後會自動補上。`;btn='切回模擬器'}
  else if(live&&S.offHours)txt='<b>非營業時間</b>　目前不在 10:00–22:00，時間軸從 10:00 開始計算，數字仍然即時。';
  else if(S.paused)txt='<b>已暫停更新</b>　畫面停在目前這一刻，按 Space 或右上角「模擬器」繼續。',btn='繼續';
  b.hidden=!txt;if(!txt)return;if($('#sysTxt').innerHTML!==txt)$('#sysTxt').innerHTML=txt;act.hidden=!btn;act.textContent=btn;
  act.onclick=btn==='繼續'?togglePause:()=>{setSource('sim');toast('info','已切回模擬器','')}}
function onSource(){renderShell();renderSettings();if(view==='devices')renderDevices()}
function onTheme(){renderPage();if(view==='live')renderTimeline()}

/* ---------- simulator controls ---------- */
function togglePause(){S.paused=!S.paused;lastTick=performance.now();$('#pauseBtn .isw').dataset.s=S.paused?'b':'a';morph($('#pauseLbl'),S.paused?'繼續':'暫停');renderShell();announce(S.paused?'已暫停即時更新':'已繼續即時更新')}
function setScenario(k,notify){S.scenario=k;S.nodes['zone-B'].fault=k==='fault';renderShell();if(notify)toast('info',`情境：${SCN[k].name}`,SCN[k].desc,k!=='normal'?{label:'恢復正常',fn:()=>setScenario('normal',true)}:null)}
function setMini(on){$('#app').classList.toggle('mini',on);store.set('mini',on);$('#collapse').setAttribute('aria-label',on?'展開側欄':'收合側欄');$('#collapse').dataset.tt=on?'展開側欄':'收合側欄';$('#fMini').checked=on;setTimeout(()=>{placeAll();window.twin?.resize();renderPage()},420)}
function exportData(fmt){const d=new Date().toISOString().slice(0,10);if(fmt==='JSON')download(`storega-${d}.json`,buildJSON(),'application/json');else download(`storega-${d}.csv`,'﻿'+buildCSV(),'text/csv');
  toast('ok',`已匯出 ${fmt}`,`storega-${d}.${fmt.toLowerCase()}`)}
function resetToday(){const keep={speed:S.speed,capacity:S.capacity,threshold:S.threshold,gateMode:S.gateMode,whitelist:S.whitelist,kAuto:S.kAuto,notify:S.notify,source:S.source};
  S=freshState();Object.assign(S,keep);S.preroll=false;replayIdx=null;NODE_DEFS.forEach(d=>S.nodes[d.id].lastSeen=S.t);window.twin?.reset();receiptStart();OV.lastEntries=null;dots=[];
  toast('ok','已清除今日資料','模擬時間回到 10:00 開店。');renderShell();renderPage()}

/* ---------- start ---------- */
function startModel(){
  S=freshState();Object.assign(S,store.get('settings',{}));
  const nowD=new Date(),tod=nowD.getHours()*3600+nowD.getMinutes()*60+nowD.getSeconds();
  const START=(tod>OPEN+3600&&tod<CLOSE-1800)?tod:15*3600+12*60;
  while(S.t<START){simStep(2);checkNodes();checkAlerts()}
  S.preroll=false;NODE_DEFS.forEach(d=>S.nodes[d.id].lastSeen=S.t);S.alerts.forEach((a,i)=>a.ack=i>=3);S.alertVer++;
}
function bindShell(){
  $('#scnList').innerHTML=Object.entries(SCN).map(([k,v])=>`<button role="menuitemradio" data-scn="${k}" aria-checked="false"><span class="ic">${icon(v.icon,16)}</span><span><b>${v.name}</b><small>${v.desc}</small></span><span class="ck">${icon('check',16)}</span></button>`).join('');
  $('#scnList').addEventListener('click',e=>{const b=e.target.closest('[data-scn]');if(b)setScenario(b.dataset.scn,true)});
  $('#speedSeg').addEventListener('pick',e=>{S.speed=+e.detail.dataset.speed;persist();renderShell()});
  bindPop($('#simBtn'),$('#simPop'),()=>renderShell());bindPop($('#bellBtn'),$('#bellPop'),renderBellList);
  $('#pauseBtn').onclick=togglePause;$('#toLive').onclick=()=>{setReplay(null);closePops()};
  $('#ackAll').onclick=()=>{ackAll();renderBellList()};
  $('#bellList').addEventListener('click',e=>{const k=e.target.closest('[data-back]');if(k){e.stopPropagation();const a=S.alerts.find(x=>x.id==k.dataset.back);a.ack=true;S.alertVer++;renderBellList();renderBadges();toast('ok','已標為處理',a.title,{label:'復原',fn:()=>{a.ack=false;S.alertVer++;renderBadges()}});return}
    const r=e.target.closest('.nt');if(r){const a=S.alerts.find(x=>x.id==r.dataset.id);a.ack=true;S.alertVer++;goTarget(a.target||{view:'events'})}});
  $('#themeBtn').onclick=()=>setTheme(isDark()?'light':'dark');
  $('#collapse').onclick=()=>setMini(!$('#app').classList.contains('mini'));
  $('.cmdk').onclick=openPal;$('#cmdKey').textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘K':'Ctrl K';
  $('#storeBtn').onclick=()=>toast('info','目前只有一間門市','多門市切換會在正式版加入。');
  document.addEventListener('click',e=>{const c=e.target.closest('[data-copy]');if(c){const t=c.dataset.copy,l=c.querySelector('.mph');navigator.clipboard?.writeText(t).catch(()=>{});if(l){morph(l,'已複製');clearTimeout(c._t);c._t=setTimeout(()=>morph(l,'複製'),1600)}else toast('ok','已複製',t)}
    const x=e.target.closest('[data-export]');if(x)exportData(x.dataset.export)});
  document.addEventListener('keydown',e=>{
    const pal=$('#palScrim');
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();pal?closePal():openPal();return}
    if(pal){if(e.key==='Escape')closePal();else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();palSel=(palSel+(e.key==='ArrowDown'?1:-1)+palShown.length)%Math.max(1,palShown.length);markPal()}else if(e.key==='Enter'){e.preventDefault();runPal(palSel)}return}
    if(e.key==='Escape'){if(!$('#delScrim').hidden){$('#delScrim').hidden=true;return}closePops();if(replayIdx!=null){setReplay(null);return}if(view==='live'&&selZone)selectZone(selZone);return}
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||e.metaKey||e.ctrlKey||e.altKey)return;
    const k=e.key.toLowerCase();
    if(k==='/'){e.preventDefault();openPal();return}
    if('123456'.includes(k)&&k){go(Object.keys(PAGES)[+k-1]);return}
    if(k===' '&&!e.target.closest('button,a,.chart,.tl,canvas,[role="tab"]')){e.preventDefault();togglePause();return}
    if(k==='t'){setTheme(isDark()?'light':'dark');return}
    if(view==='live'&&window.twin){if(k==='h')window.twin.toggleLayer('heat');if(k==='l')window.twin.toggleLayer('labels');if(k==='r'){window.twin.camera('iso');setSeg($('#camSeg'),b=>b.dataset.cam==='iso')}}
  });
  addEventListener('hashchange',route);
}

refreshPal();startModel();
initOverview();initLive();initAnalytics();initEvents();initDevices();initSettings();bindShell();
{const t=store.get('theme','');setTheme(t||'auto')}
if(store.get('mini',false))setMini(true);
route();bootOverview();renderShell();
setInterval(tick,200);
setInterval(()=>{renderShell();if(view!=='analytics'&&view!=='settings')renderPage()},800);
setInterval(()=>{if(view==='analytics'||view==='settings')renderPage()},2400);
