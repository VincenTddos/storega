/* StoreGA · 分析: hourly flow, the checkout funnel, zone heat and how well Wi-Fi estimates match the door count */
let aTab=store.get('aTab','flow'),dnMode='now';
function aStats(){
  const t=S.today,e=t.entries,cur=Math.floor(S.t/3600),off=S.offHour?.entries||0,best=S.hourly.filter(h=>h.h<=cur).sort((a,b)=>b.entries-a.entries)[0];
  const items=[['users','今日進場',`${e}<small>人</small>`,(off?`含營業時間外 ${off} 人 · `:'')+(YK()?`${yLabel()}全天 ${YK().entries} 人`:'還沒有前一天的紀錄')],['bag','轉換率',`${e?(t.checkouts/e*100).toFixed(1):'0'}<small>%</small>`,`結帳 ${t.checkouts} 筆 · RFID`],
    ['clock','最忙時段',best&&best.entries?`${pad(best.h)}:00`:'—',best&&best.entries?`${best.entries} 人進場`:'還沒有資料'],['target','估計準確度',`${(accNow()*100).toFixed(1)}<small>%</small>`,`校正前 ${pct1(accRaw())}%`]];
  const box=$('#aStats');if(!box.children.length)box.innerHTML=items.map(i=>`<div class="stat"><span class="label">${icon(i[0],14)}${i[1]}</span><b></b><p></p></div>`).join('');
  [...box.children].forEach((c,k)=>{const b=c.querySelector('b');if(b.innerHTML!==items[k][2])b.innerHTML=items[k][2];c.querySelector('p').textContent=items[k][3]});
}
/* hours still to come: yesterday's hourly share of the day × today's pace so far */
const hourFc=h=>{const v=yHour(h);return v==null?null:Math.round(v*fcRatio())};
function aFlow(){const cur=Math.floor(S.t/3600),fc=S.hourly.map(h=>h.h>cur?hourFc(h.h):null);$('#ghostLgd').hidden=!fc.some(v=>v!=null);
  chart($('#chHour'),{type:'bar',h:260,x:S.hourly.map(h=>`${h.h}時`),yMax:niceMax(Math.max(10,...S.hourly.map(h=>h.entries),...fc.filter(v=>v!=null))),
    tipX:i=>`${pad(S.hourly[i].h)}:00 – ${pad(S.hourly[i].h+1)}:00`,tipExtra:i=>{const h=S.hourly[i];return h.entries?`<div class="r m">轉換率<b>${pct1(h.checkouts/h.entries)}%</b></div>`:''},
    series:[{name:'進場',color:PAL.ink,values:S.hourly.map(h=>h.h>cur?null:h.entries),fmt:v=>v+' 人'},{name:'結帳',color:PAL.accent,values:S.hourly.map(h=>h.h>cur?null:h.checkouts),fmt:v=>v+' 筆'},{name:'預測進場',color:PAL.ink,ghost:true,values:fc,fmt:v=>'約 '+v+' 人'}]});
  const wk=[...S.days,{label:'今天',sub:S.real?'即時':'展示',entries:S.today.entries,checkouts:S.today.checkouts}];
  chart($('#chWeek'),{type:'bar',h:260,x:wk.map(d=>d.label),sub:wk.map(d=>`${d.entries?(d.checkouts/d.entries*100).toFixed(1):'0'}%`),every:1,yMax:niceMax(Math.max(...wk.map(d=>d.entries))),
    tipX:i=>`${wk[i].label} ${wk[i].sub}`,series:[{name:'進場',color:PAL.ink,values:wk.map(d=>d.entries),fmt:v=>v+' 人'},{name:'結帳',color:PAL.accent,values:wk.map(d=>d.checkouts),fmt:v=>v+' 筆'}]})}
function aConv(){const t=S.today,e=Math.max(1,t.entries),cur=Math.floor(S.t/3600);
  const st=[['進場',t.entries],['進入任一區',t.engaged],['停留超過 10 分',t.long],['到達結帳區',t.reachedD],['完成結帳',t.checkouts]];
  $('#funnel').innerHTML=st.map((s,i)=>{const prev=i?st[i-1][1]:s[1],drop=i&&prev?Math.round((1-s[1]/prev)*100):0,w=clamp(s[1]/e,0,1);
    return `<div class="fs"><span>${s[0]}</span><span class="trk"><b style="transform:scaleX(${w.toFixed(3)});opacity:${1-i*.14}"></b>${w>.3?`<span>${pct1(s[1]/e)}%</span>`:''}</span><span class="nr">${s[1].toLocaleString()}<small class="${drop>0?'drop':''}">${i?(drop>0?`▼ ${drop}%`:'—'):'基準'}</small></span></div>`}).join('');
  const hrs=S.hourly.filter(h=>h.h<=cur),y=YK();
  chart($('#chConv'),{type:'line',h:220,x:hrs.map(h=>`${h.h}時`),yMax:60,yFmt:v=>v+'%',every:1,tipX:i=>`${pad(hrs[i].h)}:00 時段`,refs:y&&y.entries?[{v:y.checkouts/y.entries*100,label:`${yLabel()}平均`,color:PAL.ink4}]:[],
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
/* ---------- 現場驗證: human counts are the ground truth for the door beams and the Wi-Fi estimate ---------- */
const VAL={run:null,undo:[]};
const valStore=()=>S.real?store.get('validations',[]):(S.demoVal||(S.demoVal=[]));
function valSave(r){const L=valStore();L.unshift(r);if(S.real)store.set('validations',L.slice(0,100))}
const pctErr=(ir,man)=>man?Math.abs(ir-man)/man:ir?1:0;
function valIR(){const r=VAL.run;return{inn:S.today.entries-r.in0,out:S.today.exits-r.out0}}
function aVal(){const r=VAL.run,box=$('#valCmp');
  $('#valIn').disabled=$('#valOut').disabled=!r;$('#valUndo').disabled=!r||!VAL.undo.length;
  $('#valState').className='chip '+(r?'ok':'n');$('#valState').innerHTML=`<i></i>${r?`計數中 · ${dur(S.t-r.t0)}`:'還沒開始'}`;
  if(r){const ir=valIR();$('#valInN').textContent=r.inn;$('#valOutN').textContent=r.out;
    box.innerHTML=`<div><span class="label">紅外線 同一段時間</span><b>進 ${ir.inn} · 出 ${ir.out}</b></div><div><span class="label">差異</span><b>進 ${ir.inn-r.inn>=0?'+':''}${ir.inn-r.inn} · 出 ${ir.out-r.out>=0?'+':''}${ir.out-r.out}</b></div>`}
  else box.innerHTML=`<div><span class="label">怎麼做</span><b style="font-size:14px;font-weight:500;font-family:var(--tc)">至少數 10 分鐘或 30 人，數字才有意義；兩人並肩、推嬰兒車都照實按。</b></div>`;
  $('#valNote').textContent=S.real?'結果存在這台電腦，可匯出放進報告':'展示模式：紅外線數字是模擬的，結果不會保存';
  const z=$('#spotSeg [aria-pressed="true"]').dataset.z,zv=S.zones[z];$('#spotNow').textContent=`${z} 區目前估計 ${zv.stale?'—（節點離線）':zv.est+' 人'} · Wi-Fi 原始 ${zv.raw} · k ${S.k.toFixed(2)}`;
  const L=valStore(),key=L.length+'|'+(L[0]?.end||'');if($('#valList').dataset.k===key)return;$('#valList').dataset.k=key;
  const doors=L.filter(x=>x.type==='door'),spots=L.filter(x=>x.type==='spot');
  const dm=doors.reduce((a,x)=>a+x.manIn+x.manOut,0),de=doors.reduce((a,x)=>a+Math.abs(x.irIn-x.manIn)+Math.abs(x.irOut-x.manOut),0);
  const sm=spots.reduce((a,x)=>a+x.counted,0),se=spots.reduce((a,x)=>a+Math.abs(x.est-x.counted),0),sr=spots.reduce((a,x)=>a+Math.abs(x.raw-x.counted),0);
  $('#valSum').textContent=[dm?`紅外線準確度 ${pct1(Math.max(0,1-de/dm))}%（${dm} 人次）`:'',sm?`分區估計 ${pct1(Math.max(0,1-se/sm))}%、Wi-Fi 原始 ${pct1(Math.max(0,1-sr/sm))}%（${spots.length} 次抽查）`:''].filter(Boolean).join(' · ');
  $('#valList').innerHTML=L.length?`<table class="tbl"><thead><tr><th>時間</th><th>項目</th><th>人工</th><th>系統</th><th>誤差</th></tr></thead><tbody>${L.slice(0,30).map(x=>x.type==='door'
      ?`<tr><td class="m">${x.date.slice(5)} ${x.start}–${x.end}</td><td>門口計數 · ${x.min} 分</td><td class="m">進 ${x.manIn} · 出 ${x.manOut}</td><td class="m">進 ${x.irIn} · 出 ${x.irOut}</td><td class="m">${pct1((Math.abs(x.irIn-x.manIn)+Math.abs(x.irOut-x.manOut))/Math.max(1,x.manIn+x.manOut))}%</td></tr>`
      :`<tr><td class="m">${x.date.slice(5)} ${x.end}</td><td>${x.zone} 區抽查</td><td class="m">${x.counted} 人</td><td class="m">估計 ${x.est} · 原始 ${x.raw}</td><td class="m">${x.counted?pct1(Math.abs(x.est-x.counted)/x.counted)+'%':x.est?'—':'0%'}</td></tr>`).join('')}</tbody></table>`
    :'<div class="ev-empty">還沒有驗證紀錄。數一次門口、抽查幾個區，評審問「準確度怎麼來的」時就有實測數字。</div>'}
function valToggle(){
  if(!VAL.run){VAL.run={t0:S.t,in0:S.today.entries,out0:S.today.exits,inn:0,out:0};VAL.undo=[];morph($('#valGo'),'結束並比對');slog('op','info','開始人工計數對照','');aVal();return}
  const r=VAL.run,ir=valIR(),min=Math.max(1,Math.round((S.t-r.t0)/60));VAL.run=null;morph($('#valGo'),'開始計數');
  if(!r.inn&&!r.out){toast('info','沒有記錄任何人','這次不會存起來。');aVal();return}
  const rec={type:'door',date:S.date,start:hhmm(r.t0),end:hhmm(S.t),min,manIn:r.inn,manOut:r.out,irIn:ir.inn,irOut:ir.out,demo:!S.real};valSave(rec);
  const err=(Math.abs(ir.inn-r.inn)+Math.abs(ir.out-r.out))/(r.inn+r.out);
  slog('op','info','完成人工計數對照',`人工 進 ${r.inn}/出 ${r.out}，紅外線 進 ${ir.inn}/出 ${ir.out}，誤差 ${pct1(err)}%`);toast('ok',`紅外線準確度 ${pct1(Math.max(0,1-err))}%`,`${min} 分鐘、${r.inn+r.out} 人次`);aVal()}
function valTap(k){const r=VAL.run;if(!r)return;r[k]++;VAL.undo.push(k);const b=$(k==='inn'?'#valIn':'#valOut');b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit');navigator.vibrate?.(15);aVal()}
function initVal(){
  $('#valGo').onclick=valToggle;$('#valIn').onclick=()=>valTap('inn');$('#valOut').onclick=()=>valTap('out');
  $('#valUndo').onclick=()=>{const k=VAL.undo.pop();if(k&&VAL.run){VAL.run[k]--;aVal()}};
  document.addEventListener('keydown',e=>{if(!VAL.run||view!=='analytics'||aTab!=='val'||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||e.metaKey||e.ctrlKey)return;
    const k=e.key.toLowerCase();if(k==='i'){e.preventDefault();valTap('inn')}else if(k==='o'){e.preventDefault();valTap('out')}});
  $('#spotSeg').addEventListener('pick',()=>aVal());
  const spot=()=>{const v=+$('#spotN').value,z=$('#spotSeg [aria-pressed="true"]').dataset.z,zv=S.zones[z];
    if($('#spotN').value===''||!Number.isInteger(v)||v<0){$('#spotN').focus();return}
    if(zv.stale){toast('warn',`${z} 區節點離線`,'沒有估計值可以比對。');return}
    valSave({type:'spot',date:S.date,end:hhmm(S.t),zone:z,counted:v,est:zv.est,raw:zv.raw,k:+S.k.toFixed(3),demo:!S.real});
    slog('op','info',`${z} 區抽查：現場 ${v} 人`,`估計 ${zv.est}（Wi-Fi 原始 ${zv.raw} × k ${S.k.toFixed(2)}）`);toast('ok',`已記錄 ${z} 區抽查`,`現場 ${v} · 估計 ${zv.est} · 原始 ${zv.raw}`);$('#spotN').value='';aVal()};
  $('#spotGo').onclick=spot;$('#spotN').onkeydown=e=>{if(e.key==='Enter')spot()};
  $('#valCsv').onclick=()=>{const L=valStore(),rows=[['日期','開始','結束','項目','人工進','人工出','紅外線進','紅外線出','分區','現場人數','估計','Wi-Fi 原始','k','展示模式']].concat(L.map(x=>x.type==='door'?[x.date,x.start,x.end,'門口計數',x.manIn,x.manOut,x.irIn,x.irOut,'','','','','',x.demo?'是':'']:[x.date,'',x.end,'分區抽查','','','','',x.zone,x.counted,x.est,x.raw,x.k,x.demo?'是':'']));
    download(`storega-validation-${S.date}.csv`,'\ufeff'+rows.map(r=>r.join(',')).join('\n'),'text/csv');slog('op','info','匯出驗證紀錄',`${L.length} 筆`);toast('ok','已匯出驗證紀錄',`${L.length} 筆`)};
}
function renderAnalytics(){aStats();({flow:aFlow,conv:aConv,zone:aZone,acc:aAcc,val:aVal})[aTab]()}
/* printing shows every tab, so draw them all first (button or Ctrl+P) */
function renderAllAnalytics(){aStats();$('#matrix').dataset.k='';aFlow();aConv();aZone();aAcc();$('#printDate').textContent=`${new Date().toLocaleDateString('zh-TW')} · 截至 ${hhmm(S.t)}`}
addEventListener('beforeprint',renderAllAnalytics);
function setATab(t){aTab=t;store.set('aTab',t);$$('#aTabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));$$('.apanel').forEach(p=>p.hidden=p.dataset.t!==t);placeUl($('#aTabs'));renderAnalytics()}
function initAnalytics(){initVal();$('#aTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setATab(b.dataset.t)});
  $('#aTabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...$$('#aTabs button')],i=bs.findIndex(b=>b.dataset.t===aTab),n=bs[(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length];setATab(n.dataset.t);n.focus()});
  $('#dnSeg').addEventListener('pick',e=>{dnMode=e.detail.dataset.k;drawDonut()});
  $$('.apanel').forEach(p=>p.hidden=p.dataset.t!==aTab);$$('#aTabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===aTab))}
