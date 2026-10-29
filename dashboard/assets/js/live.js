/* StoreGA · 即時店況: the 3D twin plus the hardware it mirrors (TM1637, WS2812, gate) and a replayable timeline */
let selZone=null;

/* ---------- TM1637 seven-segment ---------- */
const SEGS={a:'4,3 7,0 25,0 28,3 25,6 7,6',b:'29,4 32,7 32,24 29,27 26,24 26,7',c:'29,29 32,32 32,49 29,52 26,49 26,32',d:'4,52 7,49 25,49 28,52 25,55 7,55',e:'3,29 6,32 6,49 3,52 0,49 0,32',f:'3,4 6,7 6,24 3,27 0,24 0,7',g:'4,28 7,25 25,25 28,28 25,31 7,31'};
const DIG={'0':'abcdef','1':'bc','2':'abged','3':'abgcd','4':'fgbc','5':'afgcd','6':'afgedc','7':'abc','8':'abcdefg','9':'abcdfg','-':'g',' ':''};
function seg7(str){let x=0,out='';for(const ch of str){
    if(ch===':'){out+=`<g class="col" transform="translate(${x+1},0)"><circle cx="4" cy="17" r="3.2"/><circle cx="2" cy="39" r="3.2"/></g>`;x+=12;continue}
    const on=DIG[ch]??'';out+=`<g transform="translate(${x},0)">`+Object.entries(SEGS).map(([k,p])=>`<polygon points="${p}" class="${on.includes(k)?'on':'off'}"/>`).join('')+'</g>';x+=40}
  return `<svg viewBox="-4 -1 ${x+2} 58"><g transform="translate(6,0) skewX(-7)">${out}</g></svg>`}
function setSeg7(el,str){if(el.dataset.v!==str){el.dataset.v=str;el.innerHTML=seg7(str)}}

/* ---------- receipt printer: every sensor event, like the thermal printer at the counter ---------- */
let rcSeq=0,rcHour=null;
function rlog(kind,text,right){
  if(S.preroll){(S.prelog||(S.prelog=[])).push([S.t,kind,text,right]);if(S.prelog.length>40)S.prelog.shift();return}
  const h=Math.floor(S.t/3600),list=$('#rc');
  if(rcHour!==null&&h!==rcHour){const hr=S.hourly[clamp(rcHour-10,0,11)];addLine('sep',`──── ${pad(h)}:00 ────`);addLine('sum',`${pad(rcHour)} 時 進場 ${hr.entries} · 結帳 ${hr.checkouts}`)}
  rcHour=h;const last=list.firstElementChild;
  if(last&&last.dataset.k===kind&&(kind==='in'||kind==='out'||kind==='pay')&&S.t-(+last.dataset.t)<20){const n=(+last.dataset.n||1)+1;last.dataset.n=n;last.querySelector('.rx').textContent=`${text} ×${n}`;last.querySelector('.rv').textContent=right||'';return}
  addLine(kind,text,right);
}
function addLine(kind,text,right='',at=S.t){
  const list=$('#rc');rcSeq++;$('#rcCount').textContent='#'+String(rcSeq).padStart(4,'0');
  const li=document.createElement('li');li.className=kind;li.dataset.k=kind;li.dataset.t=at;
  if(kind==='sep'||kind==='sum')li.textContent=text;
  else{li.innerHTML='<span class="rt"></span><span class="rx"></span><span class="rv"></span>';li.querySelector('.rt').textContent=hhmmss(at);li.querySelector('.rx').textContent=text;li.querySelector('.rv').textContent=right}
  list.prepend(li);while(list.children.length>60)list.lastChild.remove();
}
function receiptStart(){
  const d=new Date();$('#rcDate').textContent=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}（${'日一二三四五六'[d.getDay()]}）`;
  $('#rc').innerHTML='';rcHour=Math.floor(S.t/3600);
  addLine('sum',`開店至今 進場 ${S.today.entries} · 結帳 ${S.today.checkouts}`);
  for(const [t,k,x,r] of (S.prelog||[]).slice(-24))addLine(k,x,r||'',t);
  addLine('sep','──── 即時 ────');
}

/* ---------- timeline + replay ---------- */
let tlHover=null;
function setReplay(idx){
  if(idx==null||!S.series.length){if(replayIdx!=null){replayIdx=null;window.twin?.resync()}}
  else{idx=clamp(idx,0,S.series.length-1);const jump=replayIdx==null?99:Math.abs(idx-replayIdx);replayIdx=idx;if(jump>4)window.twin?.resync()}
  const sn=snap();$('#replayBar').hidden=!sn;if(sn)$('#replayTxt').textContent=`回放 ${hhmm(sn.t)} · 場內 ${sn.occ} 人`;
  $('#tlLive').setAttribute('aria-pressed',!sn);$('#tlLive').textContent=sn?'回到即時':'即時';
  renderTimeline();renderLive();renderShell();
}
function tlGeo(){const el=$('#tl'),W=Math.max(320,el.clientWidth),H=140,L=8,Rr=8,T=24,B=24;const X=t=>L+(t-OPEN)/(CLOSE-OPEN)*(W-L-Rr);return{el,W,H,T,B,X,tAt:x=>OPEN+clamp((x-L)/(W-L-Rr),0,1)*(CLOSE-OPEN)}}
function renderTimeline(){
  const g=tlGeo(),{W,H,T,B,X:X0}=g,X=t=>X0(clamp(t,OPEN,CLOSE)),s=S.series.filter(p=>p.t>=OPEN&&p.t<=CLOSE);  // 真實模式 also records outside opening hours; the timeline only spans them
  const yM=niceMax(Math.max(S.capacity*1.15,...s.map(p=>p.occ),5)),Y=v=>T+(1-clamp(v,0,yM)/yM)*(H-T-B);
  let o=`<svg viewBox="0 0 ${W} ${H}" height="${H}" aria-hidden="true"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${PAL.line}" stroke-width="2"/></pattern>
    <linearGradient id="tlg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${PAL.accent}" stop-opacity=".28"/><stop offset="1" stop-color="${PAL.accent}" stop-opacity="0"/></linearGradient></defs>`;
  for(let h=10;h<=22;h++){const x=X(h*3600);o+=`<line x1="${x}" x2="${x}" y1="${T}" y2="${H-B}" stroke="${PAL.line}" ${h%3?'stroke-dasharray="2 4"':''}/><text class="t" x="${x}" y="${H-7}" text-anchor="middle">${h}</text>`}
  o+=`<rect x="${X(S.t)}" y="${T}" width="${Math.max(0,X(CLOSE)-X(S.t))}" height="${H-T-B}" fill="url(#hatch)"/>`;
  if(s.length>1){const d='M'+s.map(p=>`${X(p.t).toFixed(1)} ${Y(p.occ).toFixed(1)}`).join(' L');
    o+=`<path d="${d} L${X(s.at(-1).t).toFixed(1)} ${Y(0)} L${X(s[0].t).toFixed(1)} ${Y(0)} Z" fill="url(#tlg)"/><path d="${d}" fill="none" stroke="${PAL.accent}" stroke-width="1.8" stroke-linejoin="round"/>`;
    o+=`<path d="M${s.map(p=>`${X(p.t).toFixed(1)} ${Y(p.queue).toFixed(1)}`).join(' L')}" fill="none" stroke="${PAL.warn}" stroke-width="1.4"/>`;
    o+=`<path d="M${s.map(p=>`${X(p.t).toFixed(1)} ${Y(p.cap).toFixed(1)}`).join(' L')}" fill="none" stroke="${PAL.crit}" stroke-width="1.2" stroke-dasharray="4 4" opacity=".8"/>`}
  const seen=new Set();for(const a of S.alerts.filter(a=>a.level!=='info'&&a.t>=OPEN&&a.t<=CLOSE)){const x=Math.round(X(a.t));if(seen.has(x>>2))continue;seen.add(x>>2);o+=`<rect x="${x-3.5}" y="6" width="7" height="7" transform="rotate(45 ${x} 9.5)" fill="${a.level==='crit'?PAL.crit:PAL.warn}"><title>${hhmm(a.t)} ${esc(a.title)}</title></rect>`}
  const nx=X(S.t);o+=`<line x1="${nx}" x2="${nx}" y1="${T-6}" y2="${H-B}" stroke="${PAL.ink}" stroke-width="1.5"/><circle cx="${nx}" cy="${T-6}" r="3" fill="${PAL.ink}"/>`;
  const sn=snap();if(sn){const x=X(sn.t);o+=`<line x1="${x}" x2="${x}" y1="${T-8}" y2="${H-B}" stroke="${PAL.zB}" stroke-width="2"/><circle cx="${x}" cy="${Y(sn.occ)}" r="5" fill="${PAL.zB}" stroke="${PAL.raised}" stroke-width="2"/>`}
  if(tlHover!=null&&!sn){o+=`<line x1="${X(tlHover)}" x2="${X(tlHover)}" y1="${T}" y2="${H-B}" stroke="${PAL.ink3}" stroke-dasharray="2 3"/>`}
  o+='</svg>';const bt=sn?sn.t:tlHover;let bub='';
  if(bt!=null){const p=s[idxAt(Math.min(bt,S.t))];bub=`<div class="tl-bubble" style="left:${X(bt)}px">${hhmm(bt)}${p&&bt<=S.t?` · ${p.occ} 人`:' · 尚未發生'}</div>`}
  g.el.innerHTML=o+bub;g.el.setAttribute('aria-valuenow',Math.round(((sn?sn.t:S.t)-OPEN)/60));g.el.setAttribute('aria-valuetext',sn?`回放 ${hhmm(sn.t)}，場內 ${sn.occ} 人`:`即時 ${hhmm(S.t)}`);
}
function bindTimeline(){const el=$('#tl');let drag=false;
  const pick=e=>{const g=tlGeo(),r=el.getBoundingClientRect();return g.tAt((e.clientX-r.left)*(g.W/r.width))};
  const go2=t=>t>=S.t-60?setReplay(null):setReplay(idxAt(t));
  el.addEventListener('pointerdown',e=>{drag=true;el.setPointerCapture(e.pointerId);go2(pick(e))});
  el.addEventListener('pointermove',e=>{const t=pick(e);if(drag)go2(t);else{tlHover=t;renderTimeline()}});
  el.addEventListener('pointerup',()=>drag=false);
  el.addEventListener('pointerleave',()=>{tlHover=null;renderTimeline()});
  el.addEventListener('keydown',e=>{const n=S.series.length;if(!n)return;let i=replayIdx??n-1;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();i+=(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1);if(i>=n-1)setReplay(null);else setReplay(i)}
    else if(e.key==='Home'){e.preventDefault();setReplay(0)}else if(e.key==='End'){e.preventDefault();setReplay(null)}});
  $('#tlLive').onclick=()=>setReplay(null);$('#replayExit').onclick=()=>setReplay(null);
}

/* ---------- entry panel ---------- */
function renderEntry(){
  const o=vOcc(),cap=vCap(),r=o/cap,gate=vGate();
  setSeg7($('#seg7'),String(o).padStart(4,' '));$('#seg7').setAttribute('aria-label',`TM1637 顯示 ${o} 人`);$('#tmCap').textContent='/ '+cap;
  const on=Math.max(1,Math.round(clamp(r,0,1)*14)),col=r<.6?'#34C759':r<.85?'#FF9500':'#FF3B30';
  $$('#leds i').forEach((e,i)=>{const lit=i<on;e.style.background=lit?col:'';e.style.boxShadow=lit?`0 0 8px ${col}`:'none'});
  const gc=$('#gateChip');gc.className='chip '+(gate?'ok':'crit');gc.innerHTML=`<i></i>${gate?'閘門開啟':'閘門關閉'}`;
  $('#eQueue').textContent=vQueue()+' 人';$('#eEnv').textContent=S.temp==null?'--':`${S.temp.toFixed(1)}° · ${S.hum==null?'--':Math.round(S.hum)}%`;
  setSeg($('#gateSeg'),b=>b.dataset.gate===S.gateMode);
}
const hold={hs:0,hr:0,D:1500};
function holdSet(h){const el=$('#hold');el.querySelector('.t2').innerHTML=h;el.querySelector('.t3').innerHTML=h}
function holdSync(){const el=$('#hold'),closed=S.gateMode==='closed';el.classList.toggle('closed',closed);if(!el.classList.contains('pressing'))holdSet(closed?OKSVG+'已暫停入場 · 點一下恢復':'按住 1.5 秒緊急關閉閘門')}
function bindHold(){const el=$('#hold');
  const start=e=>{if(e.button>0)return;if(S.gateMode==='closed'){setGate('auto');return}e.preventDefault?.();el.classList.add('pressing');el.style.setProperty('--ht','0s');hold.hs=performance.now();
    const tick=n=>{const k=Math.min(1,(n-hold.hs)/hold.D);el.style.setProperty('--h',k);holdSet(k<1?`繼續按住 ${((hold.D-(n-hold.hs))/1000).toFixed(1)} 秒`:'');if(k<1)hold.hr=requestAnimationFrame(tick);else done()};hold.hr=requestAnimationFrame(tick)};
  const end=()=>{if(!el.classList.contains('pressing'))return;cancelAnimationFrame(hold.hr);el.classList.remove('pressing');el.style.setProperty('--ht','.45s');el.style.setProperty('--h',0);holdSync();el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake')};
  const done=()=>{el.classList.remove('pressing');navigator.vibrate?.(30);el.style.setProperty('--ht','0s');el.style.setProperty('--h',0);setGate('closed')};
  el.addEventListener('pointerdown',start);['pointerup','pointercancel','pointerleave'].forEach(t=>el.addEventListener(t,end));
  el.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();e.stopPropagation();start(e)}});el.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')end()});
  el.addEventListener('contextmenu',e=>e.preventDefault());
}

/* ---------- zones ---------- */
function renderZones(){
  $('#thrLbl').textContent=`門檻 ${S.threshold} 人`;
  ZONES.forEach(zd=>{const el=$(`.zrow[data-z="${zd.id}"]`),z=S.zones[zd.id],v=zoneVals(zd),h=v.stale?'stale':heatOf({est:v.est,stale:false});
    el.setAttribute('aria-pressed',selZone===zd.id);popNum(el.querySelector('.zn'),v.stale?'—':v.est);
    el.querySelector('small').textContent=v.stale?'節點離線 · 用前一筆資料估計':`Wi-Fi ${v.raw} 支 · ${!zd.radar?'未裝雷達':z.presence?(z.moving?'雷達：有人移動':'雷達：有人靜止'):'雷達：無人'}`;
    const b=el.querySelector('.zbar i');b.style.transform=`scaleX(${clamp(v.est/S.threshold,0,1).toFixed(3)})`;b.style.background=h==='hot'?'var(--crit)':h==='warm'?'var(--warn)':`var(--z${zd.id})`});
  const c=$('#zdetail');if(!selZone){c.hidden=true;return}
  const zd=ZMAP[selZone],z=S.zones[selZone],n=S.nodes[zd.node],v=zoneVals(zd);c.hidden=false;
  if(c.dataset.z!==selZone){c.dataset.z=selZone;c.innerHTML=`<div class="card-h"><h3><span class="zid" style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--z${zd.id});color:#fff;font-family:var(--mono);font-size:11px;margin-right:8px">${zd.id}</span>${zd.name}</h3><button class="btn ghost sm icon" id="zdx" aria-label="關閉">${icon('x',15)}</button></div><span class="label">近 60 分鐘 · 校正後人數</span><svg viewBox="0 0 200 40" preserveAspectRatio="none" id="zdSpark"></svg><dl id="zdKv"></dl>`;
    $('#zdx').onclick=()=>selectZone(selZone)}
  spark($('#zdSpark'),z.hist.length>1?z.hist:[0,0],{color:`var(--z${zd.id})`,fmt:x=>x,label:()=>''});
  const rows=[['Wi-Fi 原始',`${v.raw} 支`],['校正係數 k',S.k.toFixed(2)],['校正後估計',`${v.est} 人`],['毫米波雷達',!zd.radar?'未安裝':z.presence?(z.moving?'有人 · 移動':'有人 · 靜止'):'無人'],
    ['平均停留',z.dwellN?(z.dwellSum/z.dwellN/60).toFixed(1)+' 分':'—'],['節點',`${zd.node} · ${n.online?n.rssi+' dBm':'離線'}`]];
  if(!S.real&&!snap())rows.splice(3,0,['模擬實際人數',`${z.truth} 人`]);
  $('#zdKv').innerHTML=rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('');
}
function selectZone(id,fly){selZone=(selZone===id&&!fly)?null:id;if(selZone&&fly)window.twin?.focusZone(selZone);renderZones()}

function renderLive(){if(view!=='live')return;renderEntry();renderZones();holdSync();renderTimeline();
  const sn=snap();$('#liveSub').textContent=sn?`正在回放 ${hhmm(sn.t)}，拖曳時間軸或按「回到即時」。`:`場內 ${vOcc()} 人 · 3D 中 ${window.twin?window.twin.customers():0} 位顧客 · 拖曳旋轉、滾輪縮放，點選區域看細節。`}
function initLive(){
  $('#leds').innerHTML='<i></i>'.repeat(14);
  $('#zoneList').innerHTML=ZONES.map(zd=>`<button class="zrow" data-z="${zd.id}" aria-pressed="false"><span class="zid" style="background:var(--z${zd.id})">${zd.id}</span><span><b>${zd.name}</b><small></small></span><span class="zn">0</span><span class="zbar"><i></i></span></button>`).join('');
  $('#zoneList').addEventListener('click',e=>{const b=e.target.closest('.zrow');if(b)selectZone(b.dataset.z,true)});
  $('#gateSeg').addEventListener('pick',e=>setGate(e.detail.dataset.gate));
  $('#camSeg').addEventListener('pick',e=>window.twin?.camera(e.detail.dataset.cam));
  bindPop($('#layerBtn'),$('#layerMenu'));
  $('#layerMenu').addEventListener('click',e=>{const b=e.target.closest('.mi');if(!b||!window.twin)return;if(b.dataset.layer)window.twin.toggleLayer(b.dataset.layer);if(b.dataset.rebuild!==undefined){window.twin.startBuild();closePops()}});
  bindTimeline();bindHold();receiptStart();
}
function onTwinReady(){const t=window.twin;if(!t)return;
  $('#layerMenu').innerHTML=t.LAYERS.map(([k,n,kb])=>`<button class="mi" role="menuitemcheckbox" data-layer="${k}" aria-checked="${t.layers[k]}"><span class="ck">${icon('check',15)}</span>${n}${kb?`<span class="kbd k">${kb}</span>`:''}</button>`).join('')+`<hr><button class="mi" data-rebuild>${icon('reset',15)}重播建造動畫</button>`;
  t.setTheme(isDark());t.resize()}
