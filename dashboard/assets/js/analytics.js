/* StoreGA · 分析: hourly flow, the checkout funnel, zone heat and how well Wi-Fi estimates match the door count */
let aTab=store.get('aTab','flow'),dnMode='now';
function aStats(){
  const t=S.today,e=t.entries,cur=Math.floor(S.t/3600),best=S.hourly.filter(h=>h.h<=cur).sort((a,b)=>b.entries-a.entries)[0];
  const items=[['users','今日進場',`${e}<small>人</small>`,`昨天全天 ${YK().entries} 人`],['bag','轉換率',`${e?(t.checkouts/e*100).toFixed(1):'0'}<small>%</small>`,`結帳 ${t.checkouts} 筆 · RFID`],
    ['clock','最忙時段',best&&best.entries?`${pad(best.h)}:00`:'—',best&&best.entries?`${best.entries} 人進場`:'還沒有資料'],['target','估計準確度',`${(accNow()*100).toFixed(1)}<small>%</small>`,`校正前 ${pct1(accRaw())}%`]];
  const box=$('#aStats');if(!box.children.length)box.innerHTML=items.map(i=>`<div class="stat"><span class="label">${icon(i[0],14)}${i[1]}</span><b></b><p></p></div>`).join('');
  [...box.children].forEach((c,k)=>{const b=c.querySelector('b');if(b.innerHTML!==items[k][2])b.innerHTML=items[k][2];c.querySelector('p').textContent=items[k][3]});
}
function aFlow(){const cur=Math.floor(S.t/3600);
  chart($('#chHour'),{type:'bar',h:260,x:S.hourly.map(h=>`${h.h}時`),yMax:niceMax(Math.max(10,...S.hourly.map(h=>h.entries))),
    tipX:i=>`${pad(S.hourly[i].h)}:00 – ${pad(S.hourly[i].h+1)}:00`,tipExtra:i=>{const h=S.hourly[i];return h.entries?`<div class="r m">轉換率<b>${pct1(h.checkouts/h.entries)}%</b></div>`:''},
    series:[{name:'進場',color:PAL.ink,values:S.hourly.map(h=>h.h>cur?null:h.entries),fmt:v=>v+' 人'},{name:'結帳',color:PAL.accent,values:S.hourly.map(h=>h.h>cur?null:h.checkouts),fmt:v=>v+' 筆'}]});
  const wk=[...S.days,{label:'今天',sub:'即時',entries:S.today.entries,checkouts:S.today.checkouts}];
  chart($('#chWeek'),{type:'bar',h:260,x:wk.map(d=>d.label),sub:wk.map(d=>`${d.entries?(d.checkouts/d.entries*100).toFixed(1):'0'}%`),every:1,yMax:niceMax(Math.max(...wk.map(d=>d.entries))),
    tipX:i=>`${wk[i].label} ${wk[i].sub}`,series:[{name:'進場',color:PAL.ink,values:wk.map(d=>d.entries),fmt:v=>v+' 人'},{name:'結帳',color:PAL.accent,values:wk.map(d=>d.checkouts),fmt:v=>v+' 筆'}]})}
function aConv(){const t=S.today,e=Math.max(1,t.entries),cur=Math.floor(S.t/3600);
  const st=[['進場',t.entries],['進入任一區',t.engaged],['停留超過 10 分',t.long],['到達結帳區',t.reachedD],['完成結帳',t.checkouts]];
  $('#funnel').innerHTML=st.map((s,i)=>{const prev=i?st[i-1][1]:s[1],drop=i&&prev?Math.round((1-s[1]/prev)*100):0,w=clamp(s[1]/e,0,1);
    return `<div class="fs"><span>${s[0]}</span><span class="trk"><b style="transform:scaleX(${w.toFixed(3)});opacity:${1-i*.14}"></b>${w>.3?`<span>${pct1(s[1]/e)}%</span>`:''}</span><span class="nr">${s[1].toLocaleString()}<small class="${drop>0?'drop':''}">${i?(drop>0?`▼ ${drop}%`:'—'):'基準'}</small></span></div>`}).join('');
  const hrs=S.hourly.filter(h=>h.h<=cur),y=YK();
  chart($('#chConv'),{type:'line',h:220,x:hrs.map(h=>`${h.h}時`),yMax:60,yFmt:v=>v+'%',every:1,tipX:i=>`${pad(hrs[i].h)}:00 時段`,refs:[{v:y.checkouts/y.entries*100,label:'昨天平均',color:PAL.ink4}],
    series:[{name:'轉換率',color:PAL.accent,area:true,values:hrs.map(h=>h.entries?h.checkouts/h.entries*100:null),fmt:v=>v.toFixed(1)+'%'}]})}
function aZone(){const cur=Math.floor(S.t/3600),mk=Math.floor(S.t/300)+'|'+S.threshold;if($('#matrix').dataset.k===mk){drawDonut();return}$('#matrix').dataset.k=mk;let mx=1;S.hourly.forEach(h=>ZONES.forEach(z=>{if(h.zn)mx=Math.max(mx,h.zsum[z.id]/h.zn)}));
  let m='<div></div>'+S.hourly.map(h=>`<div class="mh">${h.h}</div>`).join('');
  ZONES.forEach(zd=>{m+=`<div class="ml">${zd.id} ${zd.name}</div>`+S.hourly.map(h=>{if(!h.zn||h.h>cur)return`<div class="mc na" data-tt="<small>${zd.name} ${h.h}:00</small>尚無資料">·</div>`;const v=h.zsum[zd.id]/h.zn,k=v/mx;
    return `<div class="mc" style="background:color-mix(in srgb,var(--z${zd.id}) ${Math.round((.08+k*.8)*100)}%,transparent);color:${k>.5?'#fff':PAL.ink}" data-tt="<small>${zd.name} · ${pad(h.h)}:00</small>平均 <b>${v.toFixed(1)}</b> 人">${v>=1?Math.round(v):''}</div>`}).join('')});
  const mt=$('#matrix');mt.style.gridTemplateColumns=`auto repeat(${S.hourly.length},minmax(26px,1fr))`;mt.innerHTML=m;
  const dw=ZONES.map(zd=>{const z=S.zones[zd.id];return{zd,v:z.dwellN?z.dwellSum/z.dwellN/60:0}}),dm=Math.max(1,...dw.map(d=>d.v));
  $('#dwell').innerHTML=dw.map(d=>`<div class="hb"><span>${d.zd.id} ${d.zd.name}</span><span class="trk"><b style="transform:scaleX(${(d.v/dm).toFixed(3)});background:var(--z${d.zd.id})"></b></span><span class="v">${d.v.toFixed(1)}</span></div>`).join('');
  drawDonut()}
function drawDonut(){const dn=$('#dn'),C=2*Math.PI*58;
  if(!dn.querySelector('.s')){dn.insertAdjacentHTML('beforeend',ZONES.map(z=>`<circle class="s" cx="75" cy="75" r="58" stroke="var(--z${z.id})"/>`).join(''));
    $('#dnl').innerHTML=ZONES.map(z=>`<div><i style="background:var(--z${z.id})"></i><span>${z.id} ${z.name}</span><b data-p="${z.id}">0%</b></div>`).join('')}
  const tot=S.hourly.reduce((a,h)=>a+h.zn,0);
  const v=dnMode==='now'?ZONES.map(z=>S.zones[z.id].stale?0:S.zones[z.id].est):ZONES.map(z=>S.hourly.reduce((a,h)=>a+h.zsum[z.id],0)/Math.max(1,tot));
  const t=v.reduce((a,b)=>a+b,0)||1;let st=0;
  [...dn.querySelectorAll('.s')].forEach((c,i)=>{const len=Math.max(.1,v[i]/t*C-22);c.style.strokeDasharray=`${len} ${C}`;c.style.strokeDashoffset=-(st+11);st+=v[i]/t*C});
  ZONES.forEach((z,i)=>popNum($(`[data-p="${z.id}"]`),Math.round(v[i]/t*100)+'%'))}
function aAcc(){const cur=Math.floor(S.t/3600),hrs=S.hourly.filter(h=>h.h<=cur);
  const acc=hrs.map(h=>h.base?[Math.max(0,100*(1-h.errRaw/h.base)),Math.max(0,100*(1-h.errEst/h.base))]:[null,null]);
  if(hrs.length>1)chart($('#chAcc'),{type:'line',h:240,x:hrs.map(h=>`${h.h}時`),yMax:100,yFmt:v=>v+'%',every:1,tipX:i=>`${pad(hrs[i].h)}:00 時段`,
    series:[{name:'Wi-Fi 原始',color:PAL.zB,dash:true,values:acc.map(a=>a[0]),fmt:v=>v.toFixed(1)+'%'},{name:'校正後',color:PAL.accent,area:true,values:acc.map(a=>a[1]),fmt:v=>v.toFixed(1)+'%'}]});
  else $('#chAcc').innerHTML=`<div class="ev-empty">開店滿兩個小時後顯示逐時比較</div>`;
  const t=S.today,rr=t.base?t.errRaw/t.base:NaN,ee=t.base?t.errEst/t.base:NaN;
  $('#accStats').innerHTML=`<div><span class="label">原始誤差</span><b style="color:var(--zB)">${pct1(rr)}%</b></div><div><span class="label">校正後誤差</span><b style="color:var(--accent)">${pct1(ee)}%</b></div><div><span class="label">誤差下降</span><b style="color:var(--ok)">${isFinite(rr)&&rr>0?pct1(1-ee/rr):'—'}%</b></div>`}
function renderAnalytics(){aStats();({flow:aFlow,conv:aConv,zone:aZone,acc:aAcc})[aTab]()}
/* printing shows every tab, so draw them all first (button or Ctrl+P) */
function renderAllAnalytics(){aStats();$('#matrix').dataset.k='';aFlow();aConv();aZone();aAcc();$('#printDate').textContent=`${new Date().toLocaleDateString('zh-TW')} · 截至 ${hhmm(S.t)}`}
addEventListener('beforeprint',renderAllAnalytics);
function setATab(t){aTab=t;store.set('aTab',t);$$('#aTabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));$$('.apanel').forEach(p=>p.hidden=p.dataset.t!==t);placeUl($('#aTabs'));renderAnalytics()}
function initAnalytics(){$('#aTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setATab(b.dataset.t)});
  $('#aTabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...$$('#aTabs button')],i=bs.findIndex(b=>b.dataset.t===aTab),n=bs[(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length];setATab(n.dataset.t);n.focus()});
  $('#dnSeg').addEventListener('pick',e=>{dnMode=e.detail.dataset.k;drawDonut()});
  $$('.apanel').forEach(p=>p.hidden=p.dataset.t!==aTab);$$('#aTabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===aTab))}
