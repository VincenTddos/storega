/* StoreGA · 事件: every alert and system action today, grouped by hour */
const EV={lv:'all',unack:false,q:'',key:'',open:null,seen:0,h:null};
/* alerts per business hour split by level; the overview's todo card and this page share the strip */
function evHist(){const H=Array.from({length:12},(_,i)=>({h:10+i,crit:0,warn:0,info:0}));for(const a of S.alerts){const i=Math.floor(a.t/3600)-10;if(i>=0&&i<12)H[i][a.level]++}return H}
function evStripHTML(sel){const H=evHist(),mx=Math.max(3,...H.map(x=>x.crit+x.warn+x.info)),cur=Math.floor(S.t/3600);
  return H.map(x=>{const n=x.crit+x.warn+x.info,fut=x.h>cur,seg=l=>x[l]?`<i class="${l}" style="height:${(x[l]/mx*100).toFixed(1)}%"></i>`:'';
    return `<button class="eh${fut?' f':''}${sel===x.h?' on':''}" data-h="${x.h}"${fut?' disabled':''} aria-pressed="${sel===x.h}" aria-label="${x.h} 點：${n} 則" data-tt="<small>${pad(x.h)}:00 – ${pad(x.h+1)}:00</small>${fut?'還沒到':n?`嚴重 <b>${x.crit}</b>　警告 <b>${x.warn}</b>　紀錄 <b>${x.info}</b>`:'沒有事件'}"><span class="eb">${seg('info')}${seg('warn')}${seg('crit')}</span><small>${x.h}</small></button>`}).join('')}
const EVTXT={crit:'嚴重',warn:'警告',info:'紀錄'};
function evItem(a){const ic=a.level==='info'?'info':a.level==='crit'?(a.target?.node?'plug':'crit'):'warn',open=EV.open===a.id;
  return `<div class="evrow ${open?'open':''}" data-id="${a.id}"><button class="ev ${a.ack?'acked':''} ${a.id>EV.seen&&EV.seen?'new':''}" aria-expanded="${open}"><span class="sev ${a.level}">${icon(ic,17)}</span>
    <span style="min-width:0"><b>${esc(a.title)}</b><p>${esc(a.detail)}</p></span>
    <span class="side">${a.ack?`<span class="tag">${icon('check',13)}已處理</span>`:a.level!=='info'?'<span class="chip '+a.level+'" style="height:22px"><i></i>未處理</span>':''}<time>${hhmm(a.t)}</time></span></button>
    <div class="evx"><div><div class="evd"><dl><dt>時間</dt><dd>${hhmmss(a.t)}</dd><dt>等級</dt><dd>${EVTXT[a.level]}</dd><dt>來源</dt><dd>${a.target?.node||(a.target?.zone?a.target.zone+' 區':'入口 entry-01')}</dd></dl>
      <div class="row">${a.level!=='info'?`<button class="btn ${a.ack?'ghost':'pri'} sm" data-evack="${a.id}">${a.ack?'改回未處理':'標為已處理'}</button>`:''}${a.target?`<button class="btn sec sm" data-evgo="${a.id}">前往查看</button>`:''}</div></div></div></div></div>`}
function renderEvents(force){
  const q=EV.q.toLowerCase(),L=S.alerts.filter(a=>(EV.lv==='all'||a.level===EV.lv)&&(EV.h==null||Math.floor(a.t/3600)===EV.h)&&(!EV.unack||(!a.ack&&a.level!=='info'))&&(!q||(a.title+a.detail).toLowerCase().includes(q)));
  const key=`${S.alertVer}|${EV.lv}|${EV.unack}|${q}|${EV.open}|${EV.h}|${Math.floor(S.t/3600)}`;if(!force&&key===EV.key)return;EV.key=key;
  $('#evHist').innerHTML=evStripHTML(EV.h);
  $('#evHistL').innerHTML=EV.h==null?'點一個時段只看那一小時':`只看 ${pad(EV.h)}:00 – ${pad(EV.h+1)}:00 <button class="link" id="evHistX">顯示全部</button>`;
  ['all','crit','warn','info'].forEach(l=>{$('#evN-'+l).textContent=l==='all'?S.alerts.length:S.alerts.filter(a=>a.level===l).length});
  let html='',h=null;
  for(const a of L.slice(0,200)){const hh=Math.floor(a.t/3600);if(hh!==h){h=hh;html+=`<div class="evgrp">${pad(hh)}:00</div>`}html+=evItem(a)}
  $('#evList').innerHTML=html||`<div class="ev-empty"><span class="nempty"><span class="ok">${icon('check',20)}</span></span><br>${EV.unack?'沒有未處理的事件':EV.h!=null?`${pad(EV.h)}:00 這一小時沒有符合的事件`:'這個條件下沒有事件'}</div>`;
  EV.seen=S.alerts[0]?.id||0;
  $('#evAckAll').disabled=!S.alerts.some(a=>!a.ack&&a.level!=='info');
}
function ackAll(){const L=S.alerts.filter(a=>!a.ack&&a.level!=='info');if(!L.length)return;L.forEach(a=>a.ack=true);S.alertVer++;renderBadges();renderEvents(true);renderBellList();
  toast('ok',`已處理 ${L.length} 則事件`,'',{label:'復原',fn:()=>{L.forEach(a=>a.ack=false);S.alertVer++;renderBadges();renderEvents(true)}})}
function initEvents(){
  $('#evSeg').addEventListener('pick',e=>{EV.lv=e.detail.dataset.lv;renderEvents()});
  $('#evUnack').onchange=e=>{EV.unack=e.target.checked;renderEvents()};
  $('#evQ').oninput=e=>{EV.q=e.target.value.trim();renderEvents()};
  $('#evAckAll').onclick=ackAll;
  $('#evHist').addEventListener('click',e=>{const b=e.target.closest('.eh');if(!b||b.disabled)return;setEvHour(EV.h===+b.dataset.h?null:+b.dataset.h)});
  $('#evHistL').addEventListener('click',e=>{if(e.target.closest('#evHistX'))setEvHour(null)});
  $('#evList').addEventListener('click',e=>{
    const ak=e.target.closest('[data-evack]');if(ak){const a=S.alerts.find(x=>x.id==ak.dataset.evack);a.ack=!a.ack;S.alertVer++;renderBadges();renderEvents(true);toast('ok',a.ack?'已標為處理':'已改回未處理',a.title);return}
    const g=e.target.closest('[data-evgo]');if(g){const a=S.alerts.find(x=>x.id==g.dataset.evgo);goTarget(a.target);return}
    const row=e.target.closest('.ev');if(row){const id=+row.parentElement.dataset.id;EV.open=EV.open===id?null:id;renderEvents()}});
}
function setEvHour(h){EV.h=h;EV.open=null;renderEvents(true)}
