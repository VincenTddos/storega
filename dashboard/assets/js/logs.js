/* StoreGA · 日誌: everything that happened, newest first — connection, nodes, hourly flow, alerts, commands, operator actions.
   真實模式 reads past days from localStorage (14 kept); 展示模式 shows only this session. */
const LG={day:null,lv:'all',cats:new Set(),q:'',limit:300,open:null,key:'',seen:0,cache:{}};
const lgData=()=>LG.day===S.date?S.logs:(LG.cache[LG.day]||(LG.cache[LG.day]=loadLogs(LG.day)));
const lgLine=(e,day)=>`${day} ${hhmmss(e.t)} [${LOGLV[e.lv]}] [${LOGCAT[e.cat]}] ${e.msg}${e.detail?' — '+e.detail:''}`;
function lgDays(){const d=S.real?logDays().filter(x=>x!==S.date):[];return [S.date,...d.reverse()]}
function renderLog(force){
  if(!LG.day||(LG.day!==S.date&&!lgDays().includes(LG.day)))LG.day=S.date;
  const all=lgData(),q=LG.q.toLowerCase(),today=LG.day===S.date;
  const key=`${today?S.logVer:0}|${LG.day}|${LG.lv}|${[...LG.cats]}|${q}|${LG.limit}|${LG.open}`;if(!force&&key===LG.key)return;LG.key=key;
  // day picker
  const days=lgDays(),sel=$('#lgDay'),dk=days.join();if(sel.dataset.k!==dk){sel.dataset.k=dk;sel.innerHTML=days.map((d,i)=>`<option value="${d}">${i?d:`今天 ${d.slice(5)}${S.real?'':'（展示）'}`}</option>`).join('')}sel.value=LG.day;
  // category chips with counts for the chosen day
  const cnt={};for(const e of all)cnt[e.cat]=(cnt[e.cat]||0)+1;
  $('#lgCats').innerHTML=`<button class="lc" data-c="" aria-pressed="${!LG.cats.size}">全部<b>${all.length.toLocaleString()}</b></button>`+
    Object.entries(LOGCAT).map(([c,n])=>`<button class="lc c-${c}" data-c="${c}" aria-pressed="${LG.cats.has(c)}"><i></i>${n}<b>${(cnt[c]||0).toLocaleString()}</b></button>`).join('');
  // rows, newest first
  const L=[];for(let i=all.length-1;i>=0;i--){const e=all[i];if((LG.lv==='all'||e.lv===LG.lv)&&(!LG.cats.size||LG.cats.has(e.cat))&&(!q||(e.msg+' '+e.detail).toLowerCase().includes(q)))L.push([i,e])}
  const fresh=today&&LG.seen?all.length-LG.seen:0;if(today)LG.seen=all.length;
  $('#lgList').innerHTML=L.slice(0,LG.limit).map(([i,e])=>{const o=LG.open===i;
    return `<div class="lr lv-${e.lv}${o?' open':''}${i>=all.length-fresh&&fresh>0&&fresh<20?' new':''}" data-i="${i}" tabindex="0" role="button" aria-expanded="${o}"><time>${hhmmss(e.t)}</time><span class="lvt">${LOGLV[e.lv]}</span><span class="lct c-${e.cat}"><i></i>${LOGCAT[e.cat]}</span>
      <span class="lm"><b>${esc(e.msg)}</b>${e.detail?`<small>${esc(e.detail)}</small>`:''}</span>${o?`<div class="lx"><dl><dt>記錄時間</dt><dd>${new Date(e.ts).toLocaleString('zh-TW',{hour12:false})}</dd><dt>店內時間</dt><dd>${hhmmss(e.t)}${S.real?'':'（模擬時鐘）'}</dd><dt>分類</dt><dd>${LOGCAT[e.cat]} · ${LOGLV[e.lv]}</dd>${e.detail?`<dt>內容</dt><dd><code>${esc(e.detail)}</code></dd>`:''}</dl><button class="btn ghost sm" data-copy="${esc(lgLine(e,LG.day))}"><span class="mph">複製這一行</span></button></div>`:''}</div>`}).join('')
    ||`<div class="ev-empty">${all.length?'沒有符合條件的紀錄':today?'今天還沒有任何紀錄':'這一天沒有紀錄'}</div>`;
  $('#lgCount').textContent=`顯示 ${Math.min(L.length,LG.limit).toLocaleString()} / ${L.length.toLocaleString()} 筆`+(S.real?' · 存在這台電腦的瀏覽器，保留 14 天':' · 展示模式：只存在這次開啟的頁面');
  $('#lgMore').hidden=L.length<=LG.limit;
  $('#lgSub').textContent=S.real?'連線、節點、人流、告警、指令與每一個操作，依時間記錄；每 15 秒存一次。':'連線、節點、人流、告警、指令與每一個操作。展示模式的紀錄來自模擬器，關掉頁面就不見；切到真實模式後每天保存。';
}
function lgExport(fmt){const all=lgData(),day=LG.day,name=`storega-log-${day}${S.real?'':'-demo'}.${fmt}`;
  const txt=fmt==='csv'?'﻿'+[['日期','時間','等級','分類','訊息','內容']].concat(all.map(e=>[day,hhmmss(e.t),LOGLV[e.lv],LOGCAT[e.cat],e.msg,e.detail])).map(r=>r.map(c=>/[",\n]/.test(String(c))?`"${String(c).replace(/"/g,'""')}"`:c).join(',')).join('\n')
    :all.map(e=>lgLine(e,day)).join('\n')+'\n';
  download(name,txt,fmt==='csv'?'text/csv':'text/plain');slog('op','info',`匯出日誌 .${fmt}`,`${day} · ${all.length} 筆`);toast('ok','已匯出日誌',`${name} · ${all.length} 筆`)}
function initLog(){
  $('#lgDay').onchange=e=>{LG.day=e.target.value;LG.open=null;LG.limit=300;renderLog()};
  $('#lgSeg').addEventListener('pick',e=>{LG.lv=e.detail.dataset.lv;renderLog()});
  $('#lgQ').oninput=e=>{LG.q=e.target.value.trim();LG.limit=300;renderLog()};
  $('#lgCats').addEventListener('click',e=>{const b=e.target.closest('.lc');if(!b)return;const c=b.dataset.c;if(!c)LG.cats.clear();else LG.cats.has(c)?LG.cats.delete(c):LG.cats.add(c);renderLog()});
  $('#lgList').addEventListener('click',e=>{if(e.target.closest('[data-copy],.lx'))return;const r=e.target.closest('.lr');if(!r)return;LG.open=LG.open===+r.dataset.i?null:+r.dataset.i;renderLog()});
  $('#lgList').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList.contains('lr'))e.target.click()});
  $('#lgMore').onclick=()=>{LG.limit+=300;renderLog()};
  $('#lgExp').onclick=()=>lgExport(LG.fmt||'log');bindPop($('#lgExpMore'),$('#lgExpMenu'));
  $('#lgExpMenu').addEventListener('click',e=>{const mi=e.target.closest('.mi');if(!mi)return;LG.fmt=mi.dataset.f;closePops();morph($('#lgExpL'),'匯出 .'+LG.fmt)});
}
