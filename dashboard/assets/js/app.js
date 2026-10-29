/* StoreGA · shell: routing, the top bar, notifications, shortcuts and start-up */
const PAGES={overview:'總覽',live:'即時店況',analytics:'分析',events:'事件',devices:'裝置',log:'日誌',settings:'設定'};
let view='overview';

/* ---------- routing: #page or #settings/sub ---------- */
function go(h){if(location.hash.slice(1)===h)route();else location.hash=h}
function route(){
  const [p,sub]=location.hash.slice(1).split('/'),nv=PAGES[p]?p:'overview',changed=nv!==view;view=nv;
  $$('.page').forEach(s=>s.classList.toggle('on',s.id==='p-'+view));
  $$('.nav a').forEach(a=>a.toggleAttribute('aria-current',a.dataset.page===view));$('.nav a[aria-current]')?.setAttribute('aria-current','page');placeNav(true);
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
function renderPage(){({overview:renderOverview,live:renderLive,analytics:renderAnalytics,events:renderEvents,devices:renderDevices,log:renderLog,settings:renderSettings})[view]?.()}

/* ---------- shell: source pill, clock, freshness, badges ---------- */
const CONN={ok:'已連線',connecting:'連線中',down:'連線中斷',err:'連不上',idle:'未連線'};
function renderShell(){
  const sn=snap(),live=S.real,ago=(performance.now()-S.lastData)/1000,stale=live&&S.conn==='ok'&&S.lastData>0&&ago>15&&!S.paused;
  const b=$('#simBtn');b.className='simbtn'+(sn?' replay':S.paused?' paused':live?(S.conn==='ok'?' live':' down'):'');
  $('#simLbl').textContent=sn?`回放 ${hhmm(sn.t)}`:S.paused?'已暫停':live?(S.conn!=='ok'?`真實模式 · ${CONN[S.conn]}`:stale?`真實模式 · 延遲 ${Math.round(ago)} 秒`:'真實模式 · 即時'):`展示模式 · ${S.speed}×`;
  $('#clk').textContent=hhmmss(sn?sn.t:S.t);
  $('#srcTag').textContent=live?'LIVE':'DEMO';$('#srcName').textContent=live?'真實模式':'展示模式';
  $('#srcDesc').textContent=live?`Node-RED ${CONN[S.conn]} · ${NODE_DEFS.filter(d=>S.nodes[d.id].online).length}/5 節點`:'模擬資料，不會保存';
  $('#railFoot').classList.toggle('real',live);$('#railFoot').classList.toggle('down',live&&S.conn!=='ok');
  $('#fresh').textContent=S.lastData<0?'還沒有資料':ago<2?'剛剛':ago<90?`${Math.round(ago)} 秒前`:`${Math.round(ago/60)} 分鐘前`;
  $('#spSrc').textContent=live?`真實模式 · Node-RED ${CONN[S.conn]}`:'展示模式（模擬資料）';setSeg($('#speedSeg'),x=>+x.dataset.speed===S.speed);
  $('#spSim').hidden=live;$('#spReal').hidden=!live;
  $$('#scnList button').forEach(x=>x.setAttribute('aria-checked',x.dataset.scn===S.scenario));
  $('#toLive').hidden=!sn;$('#welcome').hidden=live||store.get('welcomed',false);renderBadges();renderBanner();
}
function renderBadges(){
  const n=S.alerts.filter(a=>!a.ack&&a.level!=='info').length,off=NODE_DEFS.filter(d=>S.nodes[d.id].seen&&!S.nodes[d.id].online).length,on=NODE_DEFS.filter(d=>S.nodes[d.id].online).length;
  const ab=$('[data-badge="alerts"]');ab.hidden=!n;ab.textContent=n>99?'99+':n;
  const nb=$('[data-badge="nodes"]');nb.textContent=off?`${off} 離線`:`${on}`;nb.classList.toggle('soft',!off);
  const bb=$('#bellBtn .nb'),s=n>99?'99+':String(n);if(bb.textContent!==s&&n){bb.classList.remove('pop');void bb.offsetWidth;bb.classList.add('pop')}bb.textContent=s;bb.hidden=!n;
}
function renderBellList(){const L=S.alerts.filter(a=>!a.ack&&a.level!=='info').slice(0,8),n=S.alerts.filter(a=>!a.ack&&a.level!=='info').length;
  $('#bellList').innerHTML=L.length?L.map(a=>`<div class="nt unread ${a.level}" data-id="${a.id}" tabindex="0"><span class="dot"></span><div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></div><time>${hhmm(a.t)}<button class="btn ghost sm ack" data-back="${a.id}">處理</button></time></div>`).join('')
    :`<div class="nempty"><span class="ok">${icon('check',20)}</span><br>沒有未處理的告警</div>`;
  $('#bellCount').textContent=n?`共 ${n} 則未處理`:'';$('#ackAll').disabled=!n}
function onAlert(a){if(a.level==='info')return;if(S.sound)chime(a.level);const b=$('#bellBtn');b.classList.remove('ringit');void b.offsetWidth;b.classList.add('ringit');if(!$('#bellPop').hidden)renderBellList()}
/* after the whole state was replaced (mode switch, new day, cleared data): forget everything the pages cached */
onLiveReset=()=>{replayIdx=null;receiptStart();OV.lastEntries=null;OV.todoKey=null;OV.sumKey=null;dots=[];window.twin?.reset();EV.key='';LG.key='';$('#aStats').innerHTML='';$('#dStats').innerHTML='';$('#matrix').dataset.k='';renderShell();renderPage()};
/* one line under the top bar when the data itself needs explaining */
function renderBanner(){const b=$('#sysBanner'),live=S.real,ago=(performance.now()-S.lastData)/1000,act=$('#sysAct'),url=esc(S.url||store.get('mqttUrl',''));let txt='',btn='',cls='';
  if(live&&S.conn==='connecting'&&!S.everConnected){txt=`<b>正在連線到 Node-RED</b>　${url} · 連上之前不會顯示任何數字。`;btn='資料來源'}
  else if(live&&(S.conn==='down'||S.conn==='err')){txt=`<b>${S.conn==='err'?'連不上 Node-RED':'與 Node-RED 的連線中斷'}</b>　${url} · 每 3 秒自動重試${S.lastData>0?`，畫面停在 ${hhmmss(S.t-ago)} 的最後一筆`:''}。`;btn='資料來源';cls='crit'}
  else if(live&&S.conn==='idle'){txt='<b>真實模式還沒有連線</b>　到「設定 → 資料來源」輸入 Node-RED 的 WebSocket 位址。';btn='資料來源'}
  else if(live&&!NODE_DEFS.some(d=>S.nodes[d.id].seen)){txt='<b>已連上 Node-RED</b>　還沒收到任何 ESP32 的訊息（sga/…）。請確認板子已上電、連上同一個 Wi-Fi。';btn='查看裝置'}
  else if(live&&ago>15&&!S.paused){txt=`<b>資料延遲 ${Math.round(ago)} 秒</b>　broker 還連著，但沒有任何節點送出訊息，畫面停在 ${hhmmss(S.t-ago)} 的最後一筆。`;btn='查看裝置'}
  else if(live&&offHours())txt='<b>非營業時間</b>　圖表以 10:00–22:00 為範圍；人數、裝置與日誌仍然即時更新。';
  else if(S.paused)txt='<b>已暫停更新</b>　畫面停在目前這一刻，按 Space 或右上角的模式按鈕繼續。',btn='繼續';
  b.hidden=!txt;b.classList.toggle('crit',cls==='crit');if(!txt)return;if($('#sysTxt').innerHTML!==txt)$('#sysTxt').innerHTML=txt;act.hidden=!btn;act.textContent=btn;
  act.onclick=btn==='繼續'?togglePause:btn==='查看裝置'?()=>go('devices'):()=>go('settings/source')}
function onSource(){renderShell();renderSettings();if(view==='devices')renderDevices()}
function onTheme(){renderPage();if(view==='live')renderTimeline()}

/* ---------- simulator controls ---------- */
function togglePause(){S.paused=!S.paused;lastTick=performance.now();$('#pauseBtn .isw').dataset.s=S.paused?'b':'a';morph($('#pauseLbl'),S.paused?'繼續':'暫停');renderShell();announce(S.paused?'已暫停即時更新':'已繼續即時更新')}
function setScenario(k,notify){S.scenario=k;S.nodes['zone-B'].fault=k==='fault';renderShell();if(notify)toast('info',`情境：${SCN[k].name}`,SCN[k].desc,k!=='normal'?{label:'恢復正常',fn:()=>setScenario('normal',true)}:null)}
function setMini(on){$('#app').classList.toggle('mini',on);store.set('mini',on);$('#collapse').setAttribute('aria-label',on?'展開側欄':'收合側欄');$('#collapse').dataset.tt=on?'展開側欄':'收合側欄';$('#fMini').checked=on;setTimeout(()=>{placeAll();window.twin?.resize();renderPage()},420)}
function exportData(fmt){const d=S.date+(S.real?'':'-demo');if(fmt==='JSON')download(`storega-${d}.json`,buildJSON(),'application/json');else download(`storega-${d}.csv`,'﻿'+buildCSV(),'text/csv');
  slog('op','info',`匯出 ${fmt}`,`storega-${d}.${fmt.toLowerCase()}`);toast('ok',`已匯出 ${fmt}`,`storega-${d}.${fmt.toLowerCase()}`)}
function resetToday(){
  if(S.real){slog('op','warn','清除今日資料',`進場 ${S.today.entries} · 結帳 ${S.today.checkouts}；日誌保留`);saveLogs();store.del('realDay');startReal();onLiveReset();toast('ok','已清除今日資料','從現在開始重新累積；日誌保留。');return}
  startDemo();onLiveReset();toast('ok','已清除今日資料','展示模式重新模擬到現在這個時間。')}

/* ---------- modes: 真實模式 (Node-RED) or 展示模式 (simulator) ---------- */
function useReal(url){closeChooser();if(!S.real){startReal();onLiveReset()}S.conn='connecting';store.set('mode','real');store.set('mqttUrl',url);slog('sys','info','切換到真實模式',url);mqttConnect(url);renderShell();renderSettings()}
function useDemo(){closeChooser();if(S.real){slog('sys','info','切換到展示模式','真實模式的資料已保存，切回來會接續');setSource('sim')}else store.set('mode','demo');renderShell();renderSettings()}
const suggestUrl=()=>store.get('mqttUrl','')||(location.protocol.startsWith('http')&&location.hostname?`ws://${location.hostname}:8080`:'ws://localhost:8080');
function openChooser(){closePops();const sc=$('#modeScrim');$('#mcUrl').value=suggestUrl();sc.hidden=false;setTimeout(()=>$('#mcUrl').focus(),50)}
function closeChooser(){$('#modeScrim').hidden=true}
function bindChooser(){
  const ok=v=>/^wss?:\/\/[^\s/:]+(:\d{2,5})?\/?$/.test(v);
  const go2=()=>{const v=$('#mcUrl').value.trim(),box=$('#mcBox');if(!ok(v)){box.classList.add('err');box.classList.remove('shake');void box.offsetWidth;box.classList.add('shake');$('#mcHelp').className='help err';$('#mcHelp').textContent='需要以 ws:// 開頭，例如 ws://192.168.50.10:8080';return}useReal(v)};
  $('#mcGo').onclick=go2;$('#mcUrl').onkeydown=e=>{if(e.key==='Enter')go2()};$('#mcUrl').oninput=()=>{$('#mcBox').classList.remove('err');$('#mcHelp').className='help';$('#mcHelp').textContent='Node-RED 電腦的 IP，Aedes 的 WebSocket 埠（預設 8080）'};
  $('#mcDemo').onclick=useDemo;
}

/* ---------- 門市資訊: names shown in the rail, the receipt, reports and the delete confirmation ---------- */
const PROFILE_DEF={store:'我的門市',place:'1F · 4 區',name:'管理員',role:'店長'};
const profile=()=>({...PROFILE_DEF,...store.get('profile',{})});
function applyProfile(){const p=profile();
  $('#storeBtn .av').textContent=[...p.store][0]||'店';$('#storeBtn div').innerHTML=`${esc(p.store)}<small>${esc(p.place||'—')}</small>`;
  $('#crumbStore').textContent=p.store;$('.me .av').textContent=[...p.name][0]||'我';$('.me div').innerHTML=`${esc(p.name)}<small>${esc(p.role||'')}</small>`;
  $('#rcStore').textContent=p.store;$('#printStore').textContent=p.store;$('#delName').textContent=p.store;$('#delIn').placeholder=p.store}

function bindShell(){
  $('#scnList').innerHTML=Object.entries(SCN).map(([k,v])=>`<button role="menuitemradio" data-scn="${k}" aria-checked="false"><span class="ic">${icon(v.icon,16)}</span><span><b>${v.name}</b><small>${v.desc}</small></span><span class="ck">${icon('check',16)}</span></button>`).join('');
  $('#scnList').addEventListener('click',e=>{const b=e.target.closest('[data-scn]');if(b)setScenario(b.dataset.scn,true)});
  $('#speedSeg').addEventListener('pick',e=>{S.speed=+e.detail.dataset.speed;persist();renderShell()});
  bindPop($('#simBtn'),$('#simPop'),()=>renderShell());bindPop($('#bellBtn'),$('#bellPop'),renderBellList);
  $('#spToReal').onclick=()=>{closePops();openChooser()};
  $('#pauseBtn').onclick=togglePause;$('#toLive').onclick=()=>{setReplay(null);closePops()};
  $('#ackAll').onclick=()=>{ackAll();renderBellList()};
  $('#bellList').addEventListener('click',e=>{const k=e.target.closest('[data-back]');if(k){e.stopPropagation();const a=S.alerts.find(x=>x.id==k.dataset.back);a.ack=true;S.alertVer++;slog('op','info',`標為已處理：${a.title}`,'');renderBellList();renderBadges();toast('ok','已標為處理',a.title,{label:'復原',fn:()=>{a.ack=false;S.alertVer++;renderBadges()}});return}
    const r=e.target.closest('.nt');if(r){const a=S.alerts.find(x=>x.id==r.dataset.id);a.ack=true;S.alertVer++;goTarget(a.target||{view:'events'})}});
  $('#themeBtn').onclick=()=>setTheme(isDark()?'light':'dark');
  $('#collapse').onclick=()=>setMini(!$('#app').classList.contains('mini'));
  $('.cmdk').onclick=openPal;$('#cmdKey').textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘K':'Ctrl K';
  $('#storeBtn').onclick=()=>go('settings/store');
  document.addEventListener('click',e=>{const c=e.target.closest('[data-copy]');if(c){const t=c.dataset.copy,l=c.querySelector('.mph');navigator.clipboard?.writeText(t).catch(()=>{});if(l){morph(l,'已複製');clearTimeout(c._t);c._t=setTimeout(()=>morph(l,'複製'),1600)}else toast('ok','已複製',t)}
    const x=e.target.closest('[data-export]');if(x)exportData(x.dataset.export)});
  document.addEventListener('keydown',e=>{
    const pal=$('#palScrim');
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();pal?closePal():openPal();return}
    if(pal){if(e.key==='Escape')closePal();else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();palSel=(palSel+(e.key==='ArrowDown'?1:-1)+palShown.length)%Math.max(1,palShown.length);markPal()}else if(e.key==='Enter'){e.preventDefault();runPal(palSel)}return}
    if(e.key==='Escape'){if(!$('#modeScrim').hidden){useDemo();return}if(!$('#delScrim').hidden){$('#delScrim').hidden=true;return}closePops();if(replayIdx!=null){setReplay(null);return}if(view==='live'&&selZone)selectZone(selZone);return}
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||e.metaKey||e.ctrlKey||e.altKey)return;
    const k=e.key.toLowerCase();
    if(k==='/'){e.preventDefault();openPal();return}
    if('1234567'.includes(k)&&k){go(Object.keys(PAGES)[+k-1]);return}
    if(k===' '&&!e.target.closest('button,a,.chart,.tl,canvas,[role="tab"]')){e.preventDefault();togglePause();return}
    if(k==='t'){setTheme(isDark()?'light':'dark');return}
    if(view==='live'&&window.twin){if(k==='h')window.twin.toggleLayer('heat');if(k==='l')window.twin.toggleLayer('labels');if(k==='r'){window.twin.camera('iso');setSeg($('#camSeg'),b=>b.dataset.cam==='iso')}}
  });
  addEventListener('hashchange',route);
  /* shortcuts dialog */
  const keys=$('#keysScrim'),openKeys=()=>{closePops();closePal();keys.hidden=false;$('#keysX').focus()},closeKeys=()=>{keys.hidden=true};
  $$('#keysScrim [data-mod]').forEach(k=>k.textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl');
  $('#keysX').onclick=closeKeys;keys.addEventListener('click',e=>{if(e.target===keys)closeKeys()});$('#welcomeKeys').onclick=openKeys;window.openKeys=openKeys;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!keys.hidden){closeKeys();e.stopImmediatePropagation()}
    if(e.key==='?'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();openKeys()}},true);
  /* 展示模式 says so on the overview, with a way to switch */
  const w=$('#welcome');$('#welcomeReal').onclick=openChooser;
  $('#welcomeX').onclick=()=>{store.set('welcomed',true);w.animate([{opacity:1},{opacity:0,transform:'translateY(-6px)'}],{duration:RM?1:220}).onfinish=()=>{w.hidden=true}};
  /* KPI cards open the analytics tab that explains them */
  const KT={in:'flow',conv:'conv',dwell:'zone',acc:'acc'};
  $$('.kpi').forEach(c=>{c.tabIndex=0;c.setAttribute('role','link');c.setAttribute('aria-label',c.querySelector('.label').textContent+'，查看分析');
    c.querySelector('.row svg').insertAdjacentHTML('beforebegin',`<span class="go">${icon('arrow',14)}</span>`);
    const open=()=>{go('analytics');setTimeout(()=>setATab(KT[c.dataset.k]),60)};c.addEventListener('click',e=>{if(!e.target.closest('.spark-wrap'))open()});c.addEventListener('keydown',e=>{if(e.key==='Enter')open()})});
  /* print the analytics as a one-page report */
  $('#printBtn').onclick=()=>{renderAllAnalytics();setTimeout(()=>print(),50)};
  /* events as CSV */
  $('#evCsv').onclick=()=>{const rows=[['時間','等級','標題','說明','已處理']].concat(S.alerts.map(a=>[hhmmss(a.t),EVTXT[a.level],a.title,a.detail,a.ack?'是':'否']));
    download(`storega-events-${new Date().toISOString().slice(0,10)}.csv`,'\ufeff'+rows.map(r=>r.map(c=>/[",\n]/.test(String(c))?`"${String(c).replace(/"/g,'""')}"`:c).join(',')).join('\n'),'text/csv');slog('op','info','匯出事件 CSV',`${S.alerts.length} 筆`);toast('ok','已匯出事件',`${S.alerts.length} 筆`)};
  bindChooser();
}

/* ---------- start: 真實模式 if that was the last choice, otherwise 展示模式; the very first visit asks ---------- */
const MODE=store.get('mode',null);
if(MODE==='real')startReal();else startDemo();
refreshPal();
initOverview();initLive();initAnalytics();initEvents();initDevices();initLog();initSettings();bindShell();applyProfile();
{const t=store.get('theme','');setTheme(t||'auto')}
if(store.get('mini',false))setMini(true);
route();bootOverview();renderShell();
if(MODE==='real'){const u=store.get('mqttUrl','');if(u){S.conn='connecting';mqttConnect(u)}else S.conn='idle'}
if(!MODE)openChooser();
addEventListener('pagehide',()=>{if(S.real)saveReal()});
setInterval(tick,200);
setInterval(()=>{renderShell();if(view!=='analytics'&&view!=='settings')renderPage()},800);
setInterval(()=>{if(view==='analytics'||view==='settings')renderPage()},2400);
