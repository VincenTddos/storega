/* StoreGA · 設定: rules, Wi-Fi calibration, data source, notifications, look, data */
let setSub='rules';
const RF={};
function rulesRead(){return{capacity:+$('#fCap').textContent,threshold:+$('#fThr').value,gateMode:$('#fGate [aria-pressed="true"]').dataset.g,whitelist:$('#fWhite').checked}}
function rulesFill(){$('#fCap').textContent=S.capacity;$('#fCap80').textContent=Math.round(S.capacity*.8);const t=$('#fThr');t.value=S.threshold;thrUI();
  setSeg($('#fGate'),b=>b.dataset.g===S.gateMode);gateHelp();$('#fWhite').checked=S.whitelist;rulesDirty()}
function thrUI(){const t=$('#fThr');t.style.setProperty('--p',((t.value-t.min)/(t.max-t.min)*100)+'%');$('#fThrV').textContent=t.value+' 人'}
function gateHelp(){const g=$('#fGate [aria-pressed="true"]').dataset.g;$('#fGateH').textContent={auto:'達上限時 SG90 轉到 0°，燈條轉紅，新顧客在門外排隊。',open:'不限制入場人數，只記錄與提醒。',closed:'立刻關閉閘門，直到改回其他模式。'}[g]}
function rulesDirty(){const v=rulesRead(),n=[v.capacity!==S.capacity,v.threshold!==S.threshold,v.gateMode!==S.gateMode,v.whitelist!==S.whitelist].filter(Boolean).length;
  const s=$('#rulesSaved');s.classList.toggle('clean',!n);s.lastChild.textContent=n?`有 ${n} 項未儲存的變更`:'所有變更都已儲存';$('#rulesSave').disabled=!n;$('#rulesReset').disabled=!n;return n}
function setGate(m,quiet){S.gateMode=m;admit();persist();mqttCmd('entry-01',{action:'gate',mode:m});
  if(!quiet)toast(m==='closed'?'warn':'ok',{auto:'已切回自動限流',open:'閘門改為常開',closed:'已暫停入場'}[m],{auto:'達上限時自動關閉。',open:'不限制入場人數。',closed:'新顧客會在門外排隊，數字面板顯示「請稍候」。'}[m],m==='closed'?{label:'恢復',fn:()=>setGate('auto')}:null);
  renderLive();if(setSub==='rules'&&!rulesDirty())rulesFill()}
async function runCalib(){if(RF.cal)return;RF.cal=true;const card=$('#calib'),lis=$$('#steps li'),btn=$('#calBtn');beam(card,'run',true);morph($('#calLbl'),'校正中…');btn.style.pointerEvents='none';
  lis.forEach(l=>{l.className='';l.querySelector('.sd').innerHTML='';l.querySelector('.v').textContent=''});
  const o=occ(),raw=S.sumRaw,D=[1000,1500,1300,1200];let res=null;
  for(let i=0;i<lis.length;i++){const l=lis[i],lb=l.children[1];l.className='run';l.querySelector('.sd').innerHTML=mxHTML('pulse');lb.classList.add('shim');await wait(D[i]);
    if(i===2)res=calibrate();
    lb.classList.remove('shim');l.className='ok';l.querySelector('.sd').innerHTML=OKSVG.replace('class="i okd"','class="i okd" style="color:var(--ok)"');
    l.querySelector('.v').textContent=[`${o} 人`,`${raw} 支裝置`,res?`k = ${res.k.toFixed(2)}`:'略過',`${NODE_DEFS.filter(d=>d.id!=='entry-01'&&S.nodes[d.id].online).length} / 4`][i]}
  beam(card,'run',false);btn.style.pointerEvents='';RF.cal=false;
  if(res){popNum($('#kv'),res.k.toFixed(2));$('#kn').textContent=`剛剛校正 · ${res.before.toFixed(2)} → ${res.k.toFixed(2)}，之後${S.kAuto?'每分鐘自動微調':'維持手動'}`;morph($('#calLbl'),'重新校正');toast('ok','Wi-Fi 校正完成',`k ${res.before.toFixed(2)} → ${res.k.toFixed(2)}，已同步到分區節點`)}
  else{morph($('#calLbl'),'再試一次');toast('warn','目前沒有 Wi-Fi 資料','等分區節點回報後再校正一次。')}}
function mqStatus(state,msg){const el=$('#mqState');RF.mq=state;
  el.innerHTML=state==='busy'?`${mxHTML('orbit')}<span class="shim">${esc(msg)}</span>`:state==='ok'?`<span style="color:var(--ok);display:inline-flex;gap:6px;align-items:center">${OKSVG}${esc(msg)}</span>`:(msg?`<span style="color:var(--crit)">${esc(msg)}</span>`:'');if(state==='err'&&!msg){$('#mqHelp').className='help err';$('#mqHelp').textContent='需要以 ws:// 或 wss:// 開頭，例如 ws://192.168.50.10:8080'}
  const box=$('#mqBox');box.classList.toggle('err',state==='err');if(state==='err'){box.classList.remove('shake');void box.offsetWidth;box.classList.add('shake')}
  beam($('#mqBox'),'line',state==='busy');morph($('#mqLbl'),state==='ok'?'重新連線':state==='busy'?'連線中…':'連線');
  if(state==='ok')toast('ok','已連上 Node-RED',msg);}
onMqtt.status=mqStatus;
function renderSettings(){
  if(!RF.cal){const kv=$('#kv');popNum(kv,S.k.toFixed(2));if(!$('#kn').textContent.startsWith('剛剛'))$('#kn').textContent=S.kAuto?'目前的 k · 每分鐘自動微調':'目前的 k · 手動模式'}
  $('#fKauto').checked=S.kAuto;setSeg($('#srcSeg'),b=>b.dataset.src===S.source);
}
function setSettingsSub(s){setSub=s||'rules';$$('#subnav a').forEach(a=>a.toggleAttribute('aria-current',a.dataset.s===setSub));if($('#subnav [aria-current]'))$('#subnav [aria-current]').setAttribute('aria-current','page');
  $$('.spanel').forEach(p=>p.hidden=p.dataset.s!==setSub);requestAnimationFrame(placeAll);if(setSub==='rules')rulesFill();renderSettings()}
function initSettings(){
  $$('[data-step]').forEach(b=>b.onclick=()=>{const o=$('#fCap'),v=clamp(+o.textContent+ +b.dataset.step,10,80);popNum(o,v);o.textContent=v;$('#fCap80').textContent=Math.round(v*.8);rulesDirty()});
  $('#fThr').oninput=()=>{thrUI();rulesDirty()};$('#fGate').addEventListener('pick',()=>{gateHelp();rulesDirty()});$('#fWhite').onchange=rulesDirty;
  $('#rulesReset').onclick=rulesFill;
  $('#rulesForm').onsubmit=async e=>{e.preventDefault();const b=$('#rulesSave'),v=rulesRead(),t=b.innerHTML;b.style.width=b.offsetWidth+'px';b.classList.add('loading');await wait(700);
    const ch=[];if(v.capacity!==S.capacity)ch.push(`上限 ${S.capacity} → ${v.capacity} 人`);if(v.threshold!==S.threshold)ch.push(`門檻 ${S.threshold} → ${v.threshold} 人`);
    const gm=v.gateMode!==S.gateMode;Object.assign(S,{capacity:v.capacity,threshold:v.threshold,whitelist:v.whitelist});admit();persist();
    const thrCh=ch.some(x=>x.startsWith('門檻'));mqttCmd('entry-01',{action:'capacity',value:S.capacity});if(thrCh)mqttCmd('entry-01',{action:'threshold',value:S.threshold});if(gm)setGate(v.gateMode,true);
    b.classList.remove('loading');b.classList.add('done');b.innerHTML=icon('check',16)+'已儲存';rulesDirty();toast('ok','規則已儲存',(ch.join('，')||'設定已更新')+'，已同步到 entry-01');
    setTimeout(()=>{b.classList.remove('done');b.innerHTML=t;b.style.width='';rulesDirty()},1400)};
  $('#calBtn').onclick=runCalib;$('#fKauto').onchange=e=>{S.kAuto=e.target.checked;persist();renderSettings()};
  $('#srcSeg').addEventListener('pick',e=>{const s=e.detail.dataset.src;if(s==='sim'){setSource('sim');mqStatus('ok','已切回模擬器');toast('info','已切回模擬器','不需要硬體，資料依時段自動產生。')}else{$('#mqUrl').focus();setSeg($('#srcSeg'),b=>b.dataset.src===S.source);$('#mqHelp').textContent='輸入位址後按「連線」，連上才會切換。'}});
  $('#mqUrl').value=store.get('mqttUrl','ws://192.168.50.10:8080');
  $('#mqUrl').oninput=e=>{const ok=/^wss?:\/\/[^\s/:]+(:\d{2,5})?\/?$/.test(e.target.value.trim()),h=$('#mqHelp');$('#mqBox').classList.toggle('err',!ok);h.className='help'+(ok?'':' err');h.textContent=ok?'格式正確。':'需要以 ws:// 或 wss:// 開頭，例如 ws://192.168.50.10:8080'};
  $('#mqUrl').onkeydown=e=>{if(e.key==='Enter')$('#mqGo').click()};
  $('#mqGo').onclick=()=>mqttConnect($('#mqUrl').value.trim());
  $$('[data-nt]').forEach(i=>{i.checked=!!S.notify[i.dataset.nt];i.onchange=()=>{S.notify[i.dataset.nt]=i.checked;persist()}});
  $('#themeSeg').addEventListener('pick',e=>setTheme(e.detail.dataset.t));
  $('#fMini').checked=store.get('mini',false);$('#fMini').onchange=e=>setMini(e.target.checked);
  $('#resetBtn').onclick=()=>{$('#delScrim').hidden=false;$('#delIn').value='';$('#delGo').disabled=true;setTimeout(()=>$('#delIn').focus(),50)};
  $('#delIn').oninput=e=>{$('#delGo').disabled=e.target.value.trim()!=='信義旗艦店'};
  $('#delIn').onkeydown=e=>{if(e.key!=='Enter')return;if($('#delGo').disabled){const f=$('#delIn').parentElement;f.classList.add('err');f.classList.remove('shake');void f.offsetWidth;f.classList.add('shake');setTimeout(()=>f.classList.remove('err'),1200)}else $('#delGo').click()};
  $('#delCancel').onclick=()=>$('#delScrim').hidden=true;$('#delScrim').addEventListener('click',e=>{if(e.target.id==='delScrim')$('#delScrim').hidden=true});
  $('#delGo').onclick=()=>{$('#delScrim').hidden=true;resetToday()};
  initFirmware();
}

/* ---------- 韌體設定：fill a form, get the config.h the Arduino sketch needs ---------- */
const FW=Object.assign({node:'entry-01',host:'',ssid:'',salt:'',rssi:-75,radar:true,staff:[]},store.get('fw',{}));
const randSalt=()=>'sga-'+[...crypto.getRandomValues(new Uint8Array(6))].map(b=>b.toString(16).padStart(2,'0')).join('');
const cstr=v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
function fwText(){const zone=FW.node!=='entry-01',pass=$('#fwPass').value;
  const head=`// StoreGA ${FW.node} · 由儀表板「設定 → 韌體設定」產生 · ${new Date().toLocaleString('zh-TW',{hour12:false})}\n// 放在 firmware/${zone?'zone_node':'entry_node'}/config.h（這個檔案不會進 git）\n#pragma once\n\n`;
  const net=`#define WIFI_SSID      ${cstr(FW.ssid||'your-wifi')}\n#define WIFI_PASSWORD  ${cstr(pass||'your-password')}\n#define MQTT_HOST      ${cstr(FW.host||'192.168.50.10')}\n#define MQTT_PORT      1883\n#define NODE_ID        ${cstr(FW.node)}\n`;
  if(!zone)return head+net+`#define FW_VERSION     "1.4.2"\n\n// 接腳（ESP32 DevKit V1），接線圖見 firmware/README.md\n#define PIN_IR_A       32\n#define PIN_IR_B       33\n#define PIN_RFID_SS    5\n#define PIN_RFID_RST   27\n#define PIN_TM_CLK     22\n#define PIN_TM_DIO     21\n#define PIN_LED        4\n#define LED_COUNT      14\n#define PIN_SERVO      13\n#define PIN_DHT        15\n#define PIN_BUTTON     26\n#define PIN_BUZZER     25\n\n#define SERVO_OPEN_DEG    90\n#define SERVO_CLOSED_DEG  0\n#define DEFAULT_CAPACITY  ${S.capacity}\n#define TZ_OFFSET_SEC     (8 * 3600)\n`;
  const staff=FW.staff.length?FW.staff.map(h=>cstr(h)).join(', '):'"0000000000000000"';
  return head+net+`#define FW_VERSION     "1.3.8"\n#define HAS_RADAR      ${FW.radar?1:0}\n\n// Wi-Fi 監聽\n#define HASH_SALT      ${cstr(FW.salt)}\n#define MIN_RSSI       (${FW.rssi})\n#define WINDOW_MS      60000\n#define STAFF_HASHES   { ${staff} }\n\n// 接腳\n#define PIN_RADAR_RX   16\n#define PIN_RADAR_TX   17\n#define PIN_RADAR_OUT  27\n#define PIN_STATUS_LED 2\n`}
function fwHighlight(t){return esc(t).split('\n').map(l=>l.startsWith('//')?`<span class="c">${l}</span>`:l.replace(/^(#define|#pragma)/,'<span class="k">$1</span>').replace(/(&quot;.*?&quot;)/g,'<span class="s">$1</span>').replace(/(\s)(\(?-?\d[\d*\s()]*\)?)$/,'$1<span class="n">$2</span>')).join('\n')}
function renderFw(){const zone=FW.node!=='entry-01';$('[data-s="firmware"]').classList.toggle('entry-mode',!zone);
  $('#fwFile').textContent=`${zone?'zone_node':'entry_node'}/config.h`;$('#fwCode').innerHTML=fwHighlight(fwText());
  $('#fwRssiV').textContent=`${FW.rssi} dBm`;const r=$('#fwRssi');r.style.setProperty('--p',((FW.rssi+90)/40*100)+'%');
  $('#staffList').innerHTML=FW.staff.length?FW.staff.map((h,i)=>`<span class="chip n">${h}<button type="button" data-rm="${i}" aria-label="移除 ${h}">${icon('x',12)}</button></span>`).join(''):'<span class="help">還沒有員工手機</span>';
  store.set('fw',FW)}
function initFirmware(){
  if(!FW.salt)FW.salt=randSalt();if(!FW.host){try{FW.host=new URL(store.get('mqttUrl','ws://192.168.50.10:8080').replace(/^ws/,'http')).hostname}catch{FW.host='192.168.50.10'}}
  $('#fwNode').value=FW.node;$('#fwHost').value=FW.host;$('#fwSsid').value=FW.ssid;$('#fwSalt').value=FW.salt;$('#fwRssi').value=FW.rssi;$('#fwRadar').checked=FW.radar;
  $('#fwNode').onchange=e=>{FW.node=e.target.value;if(FW.node==='zone-C')FW.radar=false,$('#fwRadar').checked=false;renderFw()};
  $('#fwHost').oninput=e=>{FW.host=e.target.value.trim();const ok=/^(\d{1,3}(\.\d{1,3}){3}|[a-z0-9.-]+)$/i.test(FW.host)&&FW.host.split('.').every(p=>!/^\d+$/.test(p)||+p<256);
    $('#fwHostBox').classList.toggle('err',!ok&&!!FW.host);$('#fwHostH').className='help'+(ok||!FW.host?'':' err');$('#fwHostH').textContent=ok||!FW.host?'ESP32 會連到這台電腦的 1883 埠。':'看起來不像 IP，例如 192.168.50.10';renderFw()};
  $('#fwSsid').oninput=e=>{FW.ssid=e.target.value;renderFw()};$('#fwPass').oninput=renderFw;
  $('#fwEye').onclick=()=>{const p=$('#fwPass');p.type=p.type==='password'?'text':'password';$('#fwEye').setAttribute('aria-label',p.type==='password'?'顯示密碼':'隱藏密碼')};
  $('#fwSalt').oninput=e=>{FW.salt=e.target.value.trim();renderFw()};$('#fwSaltNew').onclick=()=>{FW.salt=randSalt();$('#fwSalt').value=FW.salt;renderFw();toast('info','已產生新的鹽','四顆分區節點要重新燒錄同一組，舊的雜湊白名單也要重新讀取。')};
  $('#fwRssi').oninput=e=>{FW.rssi=+e.target.value;renderFw()};$('#fwRadar').onchange=e=>{FW.radar=e.target.checked;renderFw()};
  const addStaff=()=>{const v=$('#staffIn').value.trim().toLowerCase(),box=$('#staffBox');
    if(!/^[0-9a-f]{16}$/.test(v)){box.classList.add('err');box.classList.remove('shake');void box.offsetWidth;box.classList.add('shake');setTimeout(()=>box.classList.remove('err'),1200);return}
    if(!FW.staff.includes(v))FW.staff.push(v);$('#staffIn').value='';renderFw();toast('ok','已加入白名單',v,{label:'復原',fn:()=>{FW.staff=FW.staff.filter(x=>x!==v);renderFw()}})};
  $('#staffAdd').onclick=addStaff;$('#staffIn').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addStaff()}};
  $('#staffList').addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(!b)return;const [v]=FW.staff.splice(+b.dataset.rm,1);renderFw();toast('ok','已移除',v,{label:'復原',fn:()=>{FW.staff.push(v);renderFw()}})});
  $('#fwCopy').onclick=()=>{navigator.clipboard?.writeText(fwText()).catch(()=>{});morph($('#fwCopy .mph'),'已複製');setTimeout(()=>morph($('#fwCopy .mph'),'複製'),1600)};
  $('#fwDl').onclick=()=>{download('config.h',fwText(),'text/plain');toast('ok','已下載 config.h',`放到 firmware/${FW.node==='entry-01'?'entry_node':'zone_node'}/ 後再上傳到板子`)};
  $('#fSound').checked=!!S.sound;$('#fSound').onchange=e=>{S.sound=e.target.checked;persist();if(S.sound)chime('warn')};$('#soundTry').onclick=()=>chime('crit');
  renderFw();
}
