/* StoreGA · interface primitives shared by every page (see design/spec.html for the rules behind them) */

/* ---------- theme + palette read from CSS tokens ---------- */
let PAL={};
const mqDark=matchMedia('(prefers-color-scheme: dark)');
const isDark=()=>{const t=document.documentElement.dataset.theme;return t?t==='dark':mqDark.matches};
function refreshPal(){const cs=getComputedStyle(document.documentElement),g=k=>cs.getPropertyValue(k).trim();
  PAL={ink:g('--ink'),ink2:g('--ink-2'),ink3:g('--ink-3'),ink4:g('--ink-4'),raised:g('--raised'),sunken:g('--sunken'),line:g('--line'),line2:g('--line-2'),accent:g('--accent'),ok:g('--ok'),warn:g('--warn'),crit:g('--crit'),
    zA:g('--zA'),zB:g('--zB'),zC:g('--zC'),zD:g('--zD')}}
function setTheme(mode){
  if(mode==='auto'||!mode)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=mode;
  store.set('theme',mode==='auto'?'':mode);refreshPal();
  const d=isDark();$('#themeBtn .isw').dataset.s=d?'b':'a';$('#themeBtn').setAttribute('aria-label',d?'切換日間模式':'切換夜間模式');
  $$('#themeSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===(mode||'auto')));placeThumb($('#themeSeg'));
  window.twin?.setTheme(d);onTheme();
}
mqDark.addEventListener('change',()=>{if(!document.documentElement.dataset.theme)setTheme('auto')});

/* ---------- announce + tooltip ---------- */
function announce(t){const l=$('#announce');l.textContent='';setTimeout(()=>l.textContent=t,30)}
const tip=document.createElement('div');tip.className='tip';tip.setAttribute('role','tooltip');document.body.appendChild(tip);
function showTip(x,y,html){tip.innerHTML=html;tip.style.left=clamp(x,80,innerWidth-80)+'px';tip.style.top=Math.max(40,y)+'px';tip.classList.add('on')}
function hideTip(){tip.classList.remove('on')}
const ttAt=t=>{const r=t.getBoundingClientRect();showTip(r.left+r.width/2,r.top,t.dataset.tt)};
document.addEventListener('pointerover',e=>{const t=e.target.closest('[data-tt]');if(t&&e.pointerType!=='touch')ttAt(t)});
document.addEventListener('pointerout',e=>{if(e.target.closest('[data-tt]'))hideTip()});
document.addEventListener('focusin',e=>{const t=e.target.closest('[data-tt]');if(t&&t.matches(':focus-visible'))ttAt(t)});
document.addEventListener('focusout',hideTip);
addEventListener('scroll',hideTip,{passive:true});

/* ---------- toasts: say what happened, offer undo, pause on hover ---------- */
const tbox=document.createElement('div');tbox.className='toasts';tbox.setAttribute('aria-live','polite');document.body.appendChild(tbox);
const TIC={ok:'check',info:'info',warn:'warn',crit:'crit'};
function toast(level,title,detail,action){
  const el=document.createElement('div');el.className='toast t-'+level;el.setAttribute('role',level==='crit'?'alert':'status');
  el.innerHTML=`<span class="ic">${icon(TIC[level]||'info',16)}</span><div><b></b><p></p></div>${action?'<button class="btn"></button>':''}<span class="bar2"><i></i></span>`;
  el.querySelector('b').textContent=title;el.querySelector('p').textContent=detail||'';
  let t;const close=()=>{clearTimeout(t);el.classList.add('out');setTimeout(()=>el.remove(),260)};
  if(action){const b=el.querySelector('.btn');b.textContent=action.label;b.onclick=()=>{action.fn();close()}}
  let left=5200,t0=Date.now();t=setTimeout(close,left);
  el.onmouseenter=()=>{clearTimeout(t);left-=Date.now()-t0};el.onmouseleave=()=>{t0=Date.now();t=setTimeout(close,Math.max(700,left))};
  tbox.appendChild(el);while(tbox.children.length>3)tbox.firstChild.remove();
}

/* ---------- moving numbers ---------- */
function popNum(el,v){if(!el)return;const s=String(v),p=el.dataset.v??el.textContent.trim();if(p===s&&el.children.length)return;el.dataset.v=s;
  const now=performance.now(),fast=now-(el._pt||0)<900;el._pt=now;if(fast||RM){el.innerHTML=[...s].map(c=>`<span class="dg">${esc(c)}</span>`).join('');return}
  let f=0;if(p.length===s.length)while(f<s.length&&p[f]===s[f])f++;
  const dn=parseFloat(s)<parseFloat(p);
  el.innerHTML=[...s].map((c,i)=>i<f?`<span class="dg">${esc(c)}</span>`:`<span class="dg in${dn?' down':''}" style="animation-delay:${(i-f)*55}ms">${esc(c)}</span>`).join('')}
function morph(el,next){if(!el)return;const prev=el.textContent;if(prev===next)return;clearTimeout(el._mt);
  if(RM||!el.isConnected||!el.offsetParent){el.textContent=next;return}
  let a=0;while(a<prev.length&&a<next.length&&prev[a]===next[a])a++;
  let z=0;while(z<prev.length-a&&z<next.length-a&&prev[prev.length-1-z]===next[next.length-1-z])z++;
  el.classList.add('mph');
  el.innerHTML=`${esc(prev.slice(0,a))}<span class="sw"><span class="o">${esc(prev.slice(a,prev.length-z))}</span><span class="n">${esc(next.slice(a,next.length-z))}</span></span>${esc(next.slice(next.length-z))}`;
  const sw=el.querySelector('.sw'),[o,n]=sw.children;n.style.display='none';const wo=sw.getBoundingClientRect().width;n.style.display='';o.style.display='none';const wn=sw.getBoundingClientRect().width;o.style.display='';
  sw.style.width=wo+'px';void sw.offsetWidth;sw.style.width=wn+'px';
  el._mt=setTimeout(()=>{el.textContent=next},340)}
function odo(el,val,from){const s=String(val),f=from==null?null:String(from).padStart(s.length,'0');el.classList.add('odo');el.dataset.v=s;
  el.innerHTML=[...s].map(c=>/\d/.test(c)?`<span class="rc"><span class="rs">${Array.from({length:30},(_,k)=>`<span>${k%10}</span>`).join('')}</span></span>`:`<span>${esc(c)}</span>`).join('');
  const rs=[...el.querySelectorAll('.rs')],ds=[...s].filter(c=>/\d/.test(c)),fs=f?[...f].filter(c=>/\d/.test(c)):null;
  rs.forEach((r,i)=>{r.style.transition='none';r.style.transform=`translateY(${-(fs?+fs[i]||0:0)*1.1}em)`});void el.offsetWidth;
  rs.forEach((r,i)=>{const target=RM?+ds[i]:20+ +ds[i];r.style.transition=`transform ${1.1+i*.12}s cubic-bezier(.16,1,.3,1) ${i*80}ms`;
    if(!RM)r.classList.add('spinning');r.style.transform=`translateY(${-target*1.1}em)`;setTimeout(()=>r.classList.remove('spinning'),(1.1+i*.12)*700+i*80)})}
function setVal(el,v){if(!el)return;const s=String(v);if(el.dataset.v===s)return;if(el.classList.contains('odo')&&!el.dataset.rolled){el.dataset.rolled=1;el.classList.remove('odo')}popNum(el,s)}

/* ---------- beam: a light that rides the border of the element doing slow work ---------- */
function beam(el,type='run',on=true){let b=el.querySelector(':scope>.bm');
  if(!b){if(!on)return;b=document.createElement('span');b.className='bm';b.innerHTML='<i class="g"></i>';b.setAttribute('aria-hidden','true');el.appendChild(b)}
  b.classList.remove('run','line','pulse');b.classList.add(type);requestAnimationFrame(()=>b.classList.toggle('on',on));return b}

/* ---------- 3×3 dot-matrix loaders ---------- */
const MXD={scan:i=>(i%3)*190,twinkle:i=>[4,0,6,2,8,5,1,7,3][i]*122,orbit:i=>{const k=[0,1,2,5,8,7,6,3].indexOf(i);return k<0?-1:k*137},pulse:i=>i===4?0:[1,3,5,7].includes(i)?170:340};
function fillMx(el){const f=MXD[el.dataset.v]||MXD.orbit;el.innerHTML=Array.from({length:9},(_,i)=>{const d=f(i);return d<0?'<i style="animation:none;opacity:.55"></i>':`<i style="--d:${d}ms"></i>`}).join('')}
const mxHTML=(v,lg)=>{const s=document.createElement('span');s.className='mx'+(lg?' lg':'');s.dataset.v=v;fillMx(s);return s.outerHTML};
const OKSVG='<svg class="i okd" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- sparkline (quiet: sunken area, ink line, accent end dot) ---------- */
/* curve through points: quadratic segments via midpoints, so peaks stay where the data is */
function smooth(pts){const f=p=>p[0].toFixed(1)+' '+p[1].toFixed(1);if(pts.length<3)return'M'+pts.map(f).join(' L');
  let d='M'+f(pts[0]);for(let i=1;i<pts.length-1;i++){const m=[(pts[i][0]+pts[i+1][0])/2,(pts[i][1]+pts[i+1][1])/2];d+=` Q${f(pts[i])} ${f(m)}`}return d+' L'+f(pts.at(-1))}
function spark(svg,vals,opt={}){
  const W=200,H=40,v=vals.map(x=>x==null?null:+x),ok=v.filter(x=>x!=null);if(ok.length<2){svg.innerHTML='';svg._v=null;return}
  const mx=opt.max??Math.max(...ok),mn=opt.min??Math.min(...ok),rg=mx-mn||1,n=v.length;
  const pts=v.map((x,i)=>x==null?null:[i/(n-1)*W,36-((x-mn)/rg)*30]).filter(Boolean);
  const d=smooth(pts),e=pts.at(-1);
  svg.innerHTML=`<path d="${d} L${e[0]} 40 L${pts[0][0]} 40Z" fill="var(--sunken)"/><path d="${d}" fill="none" stroke="${opt.color||'var(--ink)'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${e[0]}" cy="${e[1]}" r="3" fill="var(--accent)"/>`;
  svg._v={v,pts,n,fmt:opt.fmt,label:opt.label};
}
function hoverSpark(svg){const w=svg.parentElement;if(w._hs)return;w._hs=1;const hov=document.createElement('span'),dm=document.createElement('span');hov.className='hov';dm.className='dotmark';w.append(hov,dm);
  w.addEventListener('pointermove',e=>{const s=svg._v;if(!s)return;const r=svg.getBoundingClientRect(),i=clamp(Math.round((e.clientX-r.left)/r.width*(s.n-1)),0,s.n-1);if(s.v[i]==null)return;
    const p=s.pts.find(q=>Math.abs(q[0]-i/(s.n-1)*200)<.01)||s.pts.at(-1),x=p[0]/200*r.width,y=p[1]/40*r.height+(r.top-w.getBoundingClientRect().top);
    hov.style.cssText=`left:${x}px;top:0;height:${w.clientHeight}px`;hov.classList.add('on');dm.style.left=x+'px';dm.style.top=y+'px';dm.classList.add('on');
    showTip(r.left+x,r.top+p[1]/40*r.height-4,`<small>${s.label(i)}</small>${s.fmt(s.v[i])}`)});
  w.addEventListener('pointerleave',()=>{hov.classList.remove('on');dm.classList.remove('on');hideTip()})}

/* ---------- charts: crosshair tooltip + arrow keys ---------- */
function chart(el,spec){
  el._spec=spec;
  if(!el._init){el._init=true;el.tabIndex=0;el.setAttribute('role','img');el._label=el.getAttribute('aria-label')||'';
    el._tip=document.createElement('div');el._tip.className='ctip';el._tip.hidden=true;
    el.addEventListener('pointermove',e=>{const g=el._geo;if(!g)return;const r=el.getBoundingClientRect();el._hi=g.idx((e.clientX-r.left)*(g.W/r.width));paintHi(el)});
    el.addEventListener('pointerleave',()=>{el._hi=null;paintHi(el)});
    el.addEventListener('blur',()=>{el._hi=null;paintHi(el)});
    el.addEventListener('keydown',e=>{const g=el._geo;if(!g)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();el._hi=clamp((el._hi??g.n-1)+(e.key==='ArrowLeft'?-1:1),0,g.n-1);paintHi(el)}})}
  const W=Math.max(300,el.clientWidth||600),H=spec.h||240,L=40,Rr=10,T=12,B=spec.sub?42:28,n=spec.x.length,yM=spec.yMax;
  const plotW=W-L-Rr,bar=spec.type==='bar',bw=plotW/n;
  const X=i=>bar?L+bw*(i+.5):L+(n<=1?plotW/2:i/(n-1)*plotW);
  const Y=v=>T+(1-clamp(v,0,yM)/yM)*(H-T-B);
  let s=`<svg viewBox="0 0 ${W} ${H}" height="${H}" aria-hidden="true">`;
  for(let k=0;k<=4;k++){const v=yM*k/4,y=Y(v);s+=`<line class="g" x1="${L}" x2="${W-Rr}" y1="${y}" y2="${y}"/><text class="t" x="${L-8}" y="${y+4}" text-anchor="end">${spec.yFmt?spec.yFmt(v):Math.round(v)}</text>`}
  const every=spec.every||Math.max(1,Math.ceil(n/Math.max(2,Math.floor(plotW/60))));
  spec.x.forEach((lb,i)=>{if((n-1-i)%every===0){s+=`<text class="t" x="${X(i)}" y="${H-(spec.sub?24:8)}" text-anchor="middle">${esc(lb)}</text>`;if(spec.sub)s+=`<text class="t" x="${X(i)}" y="${H-8}" text-anchor="middle">${esc(spec.sub[i])}</text>`}});
  s+=`<rect class="band" data-r="band" x="0" y="${T}" width="0" height="${H-T-B}" rx="6" opacity="0"/>`;
  (spec.refs||[]).forEach(r=>{const y=Y(r.v);s+=`<line x1="${L}" x2="${W-Rr}" y1="${y}" y2="${y}" stroke="${r.color}" stroke-dasharray="5 4" stroke-width="1.5"/><text class="t" x="${W-Rr}" y="${y-6}" text-anchor="end" style="fill:${r.color}">${esc(r.label)}</text>`});
  if(bar){const k=spec.series.filter(se=>!se.ghost).length,inner=Math.min(bw*.56,56),w=Math.max(3,inner/k-3);
    // a ghost series (forecast) draws in the slot of the series it stands in for
    spec.series.forEach((se,j)=>se.values.forEach((v,i)=>{if(v==null)return;const x=L+bw*i+(bw-inner)/2+(se.ghost?se.slot||0:j)*(inner/k),y=Y(v);s+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,Y(0)-y).toFixed(1)}" rx="${Math.min(4,w/2).toFixed(1)}" ${se.ghost?`fill="${se.color}" fill-opacity=".1" stroke="${se.color}" stroke-opacity=".45" stroke-dasharray="3 3"`:`fill="${se.color}"`}/>`}))}
  else spec.series.forEach((se,j)=>{const pts=se.values.map((v,i)=>v==null?null:[X(i),Y(v)]).filter(Boolean);if(!pts.length)return;
      const d='M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L');
      if(se.area)s+=`<path d="${d} L${pts.at(-1)[0].toFixed(1)} ${Y(0)} L${pts[0][0].toFixed(1)} ${Y(0)} Z" fill="${se.color}" opacity=".1"/>`;
      s+=`<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" ${se.dash?'stroke-dasharray="5 5"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
      if(!se.dash){const e=pts.at(-1);s+=`<circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="3.5" fill="${se.color}" stroke="${PAL.raised}" stroke-width="2"/>`}});
  s+=`<line class="xh" data-r="xh" x1="0" x2="0" y1="${T}" y2="${H-B}" opacity="0"/><g data-r="dots"></g></svg>`;
  el.innerHTML=s;el.appendChild(el._tip);
  el._geo={W,H,n,X,Y,bw,bar,idx:x=>bar?clamp(Math.floor((x-L)/bw),0,n-1):clamp(Math.round((x-L)/plotW*(n-1)),0,n-1)};
  if(el._hi!=null)el._hi=Math.min(el._hi,n-1);paintHi(el);
}
function paintHi(el){
  const g=el._geo,sp=el._spec,tp=el._tip,i=el._hi,svg=el.querySelector('svg');if(!g||!svg)return;
  const xh=svg.querySelector('[data-r="xh"]'),band=svg.querySelector('[data-r="band"]'),dots=svg.querySelector('[data-r="dots"]');
  if(i==null){tp.hidden=true;xh.setAttribute('opacity',0);band.setAttribute('opacity',0);dots.innerHTML='';el.setAttribute('aria-label',el._label);return}
  const x=g.X(i);
  if(g.bar){band.setAttribute('x',x-g.bw/2);band.setAttribute('width',g.bw);band.setAttribute('opacity',1);xh.setAttribute('opacity',0);dots.innerHTML=''}
  else{xh.setAttribute('x1',x);xh.setAttribute('x2',x);xh.setAttribute('opacity',1);band.setAttribute('opacity',0);
    dots.innerHTML=sp.series.map(se=>se.values[i]==null?'':`<circle cx="${x}" cy="${g.Y(se.values[i])}" r="4.5" fill="${se.color}" stroke="${PAL.raised}" stroke-width="2"/>`).join('')}
  const head=sp.tipX?sp.tipX(i):sp.x[i];
  tp.innerHTML=`<div class="h">${esc(head)}</div>`+sp.series.filter(se=>!se.ghost||se.values[i]!=null).map(se=>`<div class="r"><i style="background:${se.color}${se.ghost?';opacity:.4':''}"></i>${esc(se.name)}<b>${se.values[i]==null?'—':(se.fmt?se.fmt(se.values[i]):se.values[i])}</b></div>`).join('')+(sp.tipExtra?sp.tipExtra(i):'');
  tp.hidden=false;const r=el.getBoundingClientRect(),px=x*(r.width/g.W),tw=tp.offsetWidth;tp.style.left=(px+14+tw>r.width?px-14-tw:px+14)+'px';
  el.setAttribute('aria-label',`${el._label}｜${head}：`+sp.series.map(se=>`${se.name} ${se.values[i]==null?'無資料':(se.fmt?se.fmt(se.values[i]):se.values[i])}`).join('，'));
}

/* ---------- segmented controls, switches, tabs ---------- */
function placeThumb(seg){if(!seg)return;const on=seg.querySelector('[aria-pressed="true"]'),th=seg.querySelector('.thumb');if(!on||!th||!seg.offsetParent)return;th.style.left=on.offsetLeft+'px';th.style.width=on.offsetWidth+'px'}
function setSeg(seg,pred){if(!seg)return;seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',!!pred(b)));placeThumb(seg)}
document.addEventListener('click',e=>{const b=e.target.closest('.seg button');if(!b||b.disabled)return;const seg=b.closest('.seg');setSeg(seg,x=>x===b);seg.dispatchEvent(new CustomEvent('pick',{detail:b}))});
/* one accent bar that slides between rail links instead of each link drawing its own */
function placeNav(){const a=$('.nav a[aria-current]'),ind=$('.navind');if(!a||!ind)return;const mob=matchMedia('(max-width:720px)').matches;
  ind.classList.toggle('h',mob);ind.style.transform=mob?`translate(${a.offsetLeft+a.offsetWidth*.3}px,${a.offsetTop-7}px)`:`translateY(${a.offsetTop+10}px)`;
  ind.style[mob?'width':'height']=(mob?a.offsetWidth*.4:a.offsetHeight-20)+'px';ind.style[mob?'height':'width']='';ind.classList.add('on')}
const placeAll=()=>{$$('.seg').forEach(placeThumb);$$('.tabs').forEach(placeUl);placeNav()};
addEventListener('resize',placeAll);document.fonts?.ready.then(placeAll);
document.addEventListener('change',e=>{const s=e.target.closest('.switch');if(s)s.classList.add('is-init')});
function placeUl(t){const on=t.querySelector('[aria-selected="true"]'),ul=t.querySelector('.ul');if(!on||!ul||!t.offsetParent)return;ul.style.left=on.offsetLeft+'px';ul.style.width=on.offsetWidth+'px'}

/* ---------- popovers & menus: one open at a time ---------- */
const POPS=[];
function bindPop(btn,panel,onOpen){POPS.push([btn,panel]);
  btn.addEventListener('click',e=>{e.stopPropagation();const open=panel.hidden;closePops();if(open){onOpen?.();panel.hidden=false;btn.setAttribute('aria-expanded','true');requestAnimationFrame(()=>{placeAll();panel.querySelector('.mi')?.focus({preventScroll:true})})}})}
function closePops(){POPS.forEach(([b,p])=>{p.hidden=true;b.setAttribute('aria-expanded','false')})}
document.addEventListener('click',e=>{if(!POPS.some(([b,p])=>p.contains(e.target)))closePops()});

/* ---------- command palette ---------- */
let palSel=0,palShown=[];
function palCommands(){
  const P=[['overview','home','總覽','今天店裡的狀況','1'],['live','cube','即時店況','3D 店面與時間軸回放','2'],['analytics','chart','分析','人流、轉換、分區、準確度','3'],['events','bell','事件','所有告警與紀錄','4'],['devices','cpu','裝置','5 顆 ESP32','5'],['settings','cog','設定','規則、校正、資料來源','6']];
  return [...P.map(p=>({g:'頁面',ic:p[1],t:p[2],d:p[3],k:p[4],run:()=>go(p[0])})),
    {g:'動作',ic:'wifi',t:'立即校正 Wi-Fi',d:'以入口人數重算 k',run:()=>{go('settings/calib');setTimeout(()=>$('#calBtn').click(),350)}},
    {g:'動作',ic:'shield',t:S.gateMode==='closed'?'恢復自動限流':'暫停入場',d:S.gateMode==='closed'?'閘門回到自動模式':'閘門關閉，新顧客在門外排隊',run:()=>setGate(S.gateMode==='closed'?'auto':'closed')},
    {g:'動作',ic:'download',t:'匯出今日報表',d:'CSV',run:()=>exportData('CSV')},
    {g:'動作',ic:'keyboard',t:'鍵盤快捷鍵',d:'所有快捷鍵一覽',k:'?',run:()=>window.openKeys?.()},
    {g:'動作',ic:'cpu',t:'產生韌體設定 config.h',d:'設定 → 韌體設定',run:()=>go('settings/firmware')},
    {g:'動作',ic:isDark()?'sun':'moon',t:isDark()?'切換日間模式':'切換夜間模式',d:'',k:'T',run:()=>setTheme(isDark()?'light':'dark')},
    {g:'動作',ic:S.paused?'play':'pause',t:S.paused?'繼續即時更新':'暫停即時更新',d:'',k:'Space',run:togglePause},
    ...(S.source==='sim'?Object.entries(SCN).map(([k,v])=>({g:'模擬情境',ic:v.icon,t:'情境：'+v.name,d:v.desc,run:()=>setScenario(k,true)})):[]),
    ...ZONES.map(z=>({g:'分區',ic:'users',t:`${z.id} ${z.name}`,d:`${S.zones[z.id].stale?'節點離線':S.zones[z.id].est+' 人'} · ${z.node}`,run:()=>{go('live');setTimeout(()=>selectZone(z.id,true),250)}})),
    ...NODE_DEFS.map(d=>({g:'裝置',ic:'cpu',t:d.id,d:`${d.role} · ${S.nodes[d.id].online?S.nodes[d.id].rssi+' dBm':'離線'}`,run:()=>{go('devices');setTimeout(()=>selectNode(d.id),120)}}))];
}
function openPal(){if($('#palScrim'))return;closePops();
  document.body.insertAdjacentHTML('beforeend',`<div class="scrim" id="palScrim"><div class="palette" role="dialog" aria-label="指令面板"><div class="q">${icon('search',18)}<input id="pq" placeholder="搜尋頁面、分區、裝置，或輸入動作…" autocomplete="off" aria-controls="pres" aria-autocomplete="list"><span class="kbd">Esc</span></div><div class="res" id="pres" role="listbox"></div><div class="ft"><span><span class="kbd">↑</span><span class="kbd">↓</span>選擇</span><span><span class="kbd">↵</span>執行</span><span><span class="kbd">Esc</span>關閉</span></div></div></div>`);
  const cmds=palCommands(),q=$('#pq');q.focus();q.oninput=()=>{palSel=0;drawPal(cmds)};palSel=0;drawPal(cmds);
  $('#palScrim').addEventListener('click',e=>{if(e.target.id==='palScrim')closePal();const o=e.target.closest('.opt');if(o)runPal(+o.dataset.k)});
  $('#palScrim').addEventListener('pointermove',e=>{const o=e.target.closest('.opt');if(o&&+o.dataset.k!==palSel){palSel=+o.dataset.k;markPal()}})}
function closePal(){$('#palScrim')?.remove()}
function drawPal(cmds){const q=$('#pq').value.trim().toLowerCase();palShown=cmds.filter(c=>!q||(c.t+c.d+c.g).toLowerCase().includes(q));
  const hl=s=>{if(!q)return esc(s);const k=s.toLowerCase().indexOf(q);return k<0?esc(s):esc(s.slice(0,k))+'<mark>'+esc(s.slice(k,k+q.length))+'</mark>'+esc(s.slice(k+q.length))};
  let html='',g='';palShown.forEach((c,k)=>{if(c.g!==g){g=c.g;html+=`<div class="grp label">${g}</div>`}html+=`<button class="opt" role="option" data-k="${k}"><span class="oi">${icon(c.ic,16)}</span><span class="od"><span>${hl(c.t)}</span>${c.d?`<small>${hl(c.d)}</small>`:''}</span>${c.k?`<span class="kbd">${c.k}</span>`:''}</button>`});
  $('#pres').innerHTML=html||`<div class="none">找不到「${esc(q)}」<br><span style="font-size:13px">試試「校正」、「服飾」或「zone」</span></div>`;markPal()}
function markPal(){$$('#pres .opt').forEach(o=>o.setAttribute('aria-selected',+o.dataset.k===palSel));$(`#pres .opt[data-k="${palSel}"]`)?.scrollIntoView({block:'nearest'})}
function runPal(k){const c=palShown[k];closePal();c?.run()}

/* ---------- alert sound: two falling tones for critical, one for warning ---------- */
let actx=null;
function chime(level){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();const notes=level==='crit'?[880,660,880,660]:[740];
  notes.forEach((f,i)=>{const o=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime+i*.16;o.type='sine';o.frequency.value=f;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.12,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.14);o.connect(g).connect(actx.destination);o.start(t);o.stop(t+.15)})}catch{}}
