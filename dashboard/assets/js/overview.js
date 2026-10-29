/* StoreGA · 總覽: the one screen a store manager opens first */
const OV={todoVer:-1,lastEntries:null,mapHl:null,booted:false};
/* next 30 minutes: the previous day's curve shape scaled to today's volume, starting from the current count; the gate caps it.
   null when there is no earlier day on record (真實模式 on its first day) — then nothing is forecast. */
const fcRatio=()=>{const yn=yesterdayNow();return yn>5?clamp(S.today.entries/yn,.5,2):1};
const fcOcc=(t0,o0,t)=>{const a=yOcc(t),b=yOcc(t0);return a==null||b==null?null:clamp(Math.round(o0+(a-b)*fcRatio()),0,S.capacity)};
const waitingEntry=()=>S.real&&!S.nodes['entry-01'].seen;
/* people in and out over the 15 minutes before series index i */
function paceAt(i){const s=S.series;if(i==null||i<1)return null;const a=s[Math.max(0,i-15)],b=s[i],inn=b.entries-a.entries;return{inn,out:Math.max(0,inn-(b.occ-a.occ))}}

function ovHeadline(){
  const sn=snap(),o=vOcc(),cap=vCap(),r=o/cap,offline=NODE_DEFS.filter(d=>!S.nodes[d.id].online).length;
  const st=$('#state');let cls='',txt='營運正常';
  if(sn){cls='replay';txt=`回放 · ${hhmm(sn.t)}`}else if(r>=1){cls='crit';txt='已達人數上限'}else if(r>=.8){cls='warn';txt='接近人數上限'}else if(offline){cls='warn';txt=`${offline} 個節點離線`}else if(S.paused)txt='已暫停更新';
  st.className='state '+cls;st.querySelector('span').textContent=txt;
  const yn=yesterdayNow(),yl=yLabel()==='昨天'?'昨天':`${yLabel()} `;let cmp='';
  if(!sn&&yn!=null&&yn>5){const d=(S.today.entries-yn)/yn;cmp=Math.abs(d)<.01?`，和${yl}這時候差不多`:`，比${yl}這時候<span class="${d>0?'cmpu':'cmpd'}">${d>0?'多':'少'} ${Math.abs(d*100).toFixed(1)}%</span>`}
  if(waitingEntry()){st.className='state warn';st.querySelector('span').textContent=S.conn==='ok'?'等待入口節點':'尚未連線'}
  const html=waitingEntry()?'還沒有入口的人數':sn?`${hhmm(sn.t)} 時店內 <em id="hOcc">${o}</em> 人`:`店內 <em id="hOcc">${o}</em> 人${cmp}`;
  const h=$('#headline');if(h.dataset.k!==html.replace(/<em id="hOcc">\d+<\/em>/,'')){h.dataset.k=html.replace(/<em id="hOcc">\d+<\/em>/,'');h.innerHTML=html;if($('#hOcc'))$('#hOcc').dataset.v=String(o)}else if($('#hOcc'))popNum($('#hOcc'),o);
}
/* 真實模式: the next busy hour on the previous day's record; nothing to say until there is one */
function realPredict(){const y=YK();if(waitingEntry())return S.conn==='ok'?'已連上 Node-RED，等 entry-01 送出第一筆 sga/entry-01/counter。':'連上 Node-RED 之後，這裡會顯示店內人數。';
  if(!y||!y.hourly)return'收集滿一天的資料後，這裡會依前一天的紀錄提醒下一波人潮。';
  const cur=Math.floor(S.t/3600),next=y.hourly.map((v,i)=>[10+i,v]).filter(([h])=>h>cur).sort((a,b)=>b[1]-a[1])[0];
  return next&&next[1]>0?`依${yLabel()}的紀錄，${pad(next[0])}:00 是接下來最忙的一小時（${next[1]} 人進場）${S.gateMode==='auto'?'，自動限流會照常運作':''}。`:`${yLabel()}這個時間之後人潮就減少了。`}
function ovPredict(thinking){const p=$('#predict');
  if(S.real){const txt=realPredict();if(p.dataset.t!==txt){p.dataset.t=txt;p.textContent=txt}return}
  const peakH=S.t<12.6*3600?'12:30':S.t<18.6*3600?'18:30':null,mins=peakH?Math.round(((peakH==='12:30'?12.5:18.5)*3600-S.t)/60):0;
  const txt=peakH?(mins>0?`下一波人潮預計 ${peakH} 左右開始（約 ${mins<60?mins+' 分鐘':Math.round(mins/6)/10+' 小時'}後），${S.gateMode==='auto'?'建議維持自動限流':'建議切回自動限流'}。`:`正在經歷${peakH==='12:30'?'午餐':'下班'}尖峰，留意結帳區排隊。`):'今天的尖峰已經過去，預計 21:30 後人潮明顯減少。';
  if(thinking){p.innerHTML=`<span class="think">${mxHTML('pulse')}<span class="shim">正在比對過去 4 週同一時段的人流…</span></span>`;
    setTimeout(()=>{p.innerHTML=`<span class="tsw in">${esc(txt)}</span>`;p.dataset.t=txt},RM?0:2600);return}
  if(p.dataset.t&&p.dataset.t!==txt){p.dataset.t=txt;p.textContent=txt}}

function ovHero(){
  const o=vOcc(),cap=vCap(),r=o/cap,gate=vGate(),q=vQueue(),sn=snap();
  popNum($('#bigOcc'),o);$('#bigCap').textContent='/'+cap;
  const on=Math.round(clamp(r,0,1.2)*40),lim=Math.round(.8*40);
  [...$('#ticks').children].forEach((t,i)=>{t.className=i<Math.min(on,40)?'on':i>=lim?'lim':''});
  $('#heroSub').innerHTML=`容量 <b>${Math.round(r*100)}%</b> · ${gate?'閘門開啟':'<b style="color:#FF8A5C">閘門關閉</b>'} · ${q?`門外 <b>${q}</b> 人排隊`:'門外無人排隊'}`;
  popNum($('#fInV'),sn?sn.entries:S.today.entries);
  const pk=peakToday();$('#fPeak').innerHTML=`${pk.occ}<small>@${hhmm(pk.t)}</small>`;
  $('#fEnv').innerHTML=S.temp==null?'--':`${S.temp.toFixed(1)}<small>°C</small> ${S.hum==null?'--':Math.round(S.hum)}<small>%</small>`;
  $('#fK').innerHTML=`k ${S.k.toFixed(2)}<small>${S.kAuto?'自動':'手動'}</small>`;
  const hero=$('.hero'),at=r>=.8&&!sn;if(at!==hero.classList.contains('at-lim')){hero.classList.toggle('at-lim',at);beam(hero,'run',at)}
  $('#limNote').innerHTML=`${mxHTML('pulse')}${r>=1?'已達上限 · 閘門已關閉':'已達 80% · 自動限流待命'}`;
  const left=Math.max(0,cap-o),pc=paceAt(sn?replayIdx:S.series.length-1);
  $('#hkLeft').innerHTML=`${left}<small>人</small>`;$('#hkLeft').classList.toggle('zero',!left);
  $('#hkPace').innerHTML=pc?`+${pc.inn}<small>進</small> −${pc.out}<small>出</small>`:'—';
  const f30=sn?null:fcOcc(S.t,o,S.t+1800);$('#hkFc').innerHTML=f30==null?'—':`約 ${f30}<small>人</small>`;$('#hkFc').parentElement.dataset.tt=f30==null?'需要前一天的紀錄才能預測':'依前一天同時段的走勢推算';
  if(waitingEntry()){$('#hkLeft').innerHTML='—';$('#hkPace').innerHTML='—'}
  // flow: last 90 minutes vs yesterday, then a dashed forecast for the next 30
  const s=S.series.slice(-90),W=300,H=84,FM=30,t0=S.t,o0=occ(),hasY=yOcc(t0)!=null,PW=hasY&&!sn?W*.75:W,mx=Math.max(cap*1.05,...s.map(p=>p.occ),10);
  $('#flowLbl').textContent=PW<W?'近 90 分鐘 · 未來 30 分鐘':'近 90 分鐘';const fk=$$('.flowkey>span');fk[1].hidden=PW===W;fk[2].hidden=!hasY;fk[2].lastChild.textContent=yLabel()||'昨天';
  if(s.length<2){$('#flow').innerHTML=`<text x="150" y="46" text-anchor="middle" fill="rgba(243,240,234,.4)" font-size="11">${S.real?'收到資料後每分鐘畫一點':''}</text>`;$('#flow')._s=null;$('.flow-wrap .now')?.remove()}
  if(s.length>1){const X=i=>i/(s.length-1)*PW,XF=m=>PW+m/FM*(W-PW),Y=v=>H-4-v/mx*(H-10);
    const fc=PW<W?Array.from({length:FM/3+1},(_,k)=>fcOcc(t0,o0,t0+k*180)):null;
    const d='M'+s.map((p,i)=>X(i).toFixed(1)+' '+Y(p.occ).toFixed(1)).join(' L'),
      yp=s.map((p,i)=>[X(i),yOcc(p.t)]).concat(fc?fc.map((_,k)=>[XF(k*3),yOcc(t0+k*180)]):[]).filter(p=>p[1]!=null),
      yd=yp.length>1?'M'+yp.map(p=>p[0].toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' L'):'',
      fd=fc?`M${PW} ${Y(o0).toFixed(1)} L`+fc.map((v,k)=>XF(k*3).toFixed(1)+' '+Y(v).toFixed(1)).join(' L'):'';
    const cy=Y(cap*.8);$('#flow').innerHTML=`<defs><linearGradient id="fg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FF5A1F" stop-opacity=".45"/><stop offset="1" stop-color="#FF5A1F" stop-opacity="0"/></linearGradient></defs>
      ${fc?`<rect x="${PW}" y="0" width="${W-PW}" height="${H}" fill="rgba(243,240,234,.035)"/><line x1="${PW}" x2="${PW}" y1="0" y2="${H}" stroke="rgba(243,240,234,.22)" vector-effect="non-scaling-stroke"/>`:''}
      <line x1="0" x2="${W}" y1="${cy}" y2="${cy}" stroke="rgba(243,240,234,.25)" stroke-dasharray="3 4"/>${yd?`<path d="${yd}" fill="none" stroke="rgba(243,240,234,.35)" stroke-width="1.4" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`:''}
      <path d="${d} L${PW} ${H} L0 ${H}Z" fill="url(#fg)"/>${fd?`<path d="${fd}" fill="none" stroke="#FF5A1F" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`:''}
      <path d="${d}" fill="none" stroke="#FF5A1F" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    $('#flow')._s=s;$('#flow')._fc=fc?{t0,fc}:null;$('#flow')._pw=PW/W;
    // the "now" dot is HTML so it stays round when the SVG stretches
    const fw=$('.flow-wrap');let dot=fw.querySelector('.now');if(!dot){dot=document.createElement('span');dot.className='now';fw.appendChild(dot)}dot.style.cssText=`left:${PW/W*100}%;top:${(Y(s.at(-1).occ)/H*100).toFixed(1)}%`}
}
function ovFlowHover(){const fw=$('.flow-wrap'),hov=document.createElement('span');hov.className='hov';fw.appendChild(hov);
  fw.addEventListener('pointermove',e=>{const s=$('#flow')._s,F=$('#flow')._fc,pw=$('#flow')._pw||1;if(!s)return;const r=fw.getBoundingClientRect(),f=clamp((e.clientX-r.left)/r.width,0,1);let x,html;
    if(f<=pw||!F){const n=s.length,i=clamp(Math.round(Math.min(f,pw)/pw*(n-1)),0,n-1),p=s[i],yv=yOcc(p.t);x=i/(n-1)*pw;
      const y=yv==null?null:Math.round(yv),d=y==null?0:p.occ-y;
      html=`<small>${hhmm(p.t)}</small><span class="sw2" style="background:var(--accent)"></span>今天 <b>${p.occ}</b> 人${y==null?'':`　<span style="opacity:.6">${yLabel()}約 ${y}（${d>=0?'+':''}${d}）</span>`}`}
    else{const k=clamp(Math.round((f-pw)/(1-pw)*(F.fc.length-1)),0,F.fc.length-1),t=F.t0+k*180;x=pw+k/(F.fc.length-1)*(1-pw);
      html=`<small>${hhmm(t)} · 預測</small><span class="sw2" style="background:var(--accent);opacity:.6"></span>約 <b>${F.fc[k]}</b> 人　<span style="opacity:.6">依${yLabel()}同時段的走勢推算</span>`}
    hov.style.cssText=`left:${x*r.width}px;top:0;height:${r.height}px`;hov.classList.add('on');showTip(r.left+x*r.width,r.top,html)});
  fw.addEventListener('pointerleave',()=>{hov.classList.remove('on');hideTip()})}

/* rolling 15-minute windows ending now, so the KPI sparklines have shape long before the first full hour */
function windows15(){const s=S.series,out=[];
  for(let e=s.length-1;e-15>=0&&out.length<48;e-=15){const a=s[e-15],b=s[e],seg=s.slice(e-14,e+1);let o=0,ee=0;
    for(const p of seg){let est=0;for(const v of Object.values(p.zones))if(!v[3])est+=v[2];o+=p.occ;ee+=Math.abs(est-p.occ)}
    out.unshift({t0:a.t,t1:b.t,ent:b.entries-a.entries,ck:b.checkouts,cent:b.entries,occ:o/seg.length,acc:o?Math.max(0,1-ee/o)*100:null})}
  // Little's law over 30 minutes: average people inside ÷ arrivals per minute
  out.forEach((w,i)=>{const p=out[i-1],ent=w.ent+(p?p.ent:0),o=p?(w.occ+p.occ)/2:w.occ,mins=p?30:15;w.dw=ent>=3?o/(ent/mins):null});
  return out}
function ovKpis(first){
  const t=S.today,ent=t.entries,conv=ent?t.checkouts/ent*100:0,dw=dwellMin(),acc=accNow()*100,y=YK(),yn=yesterdayNow();
  const vals=[[$('#kIn'),String(ent)],[$('#kConv'),conv.toFixed(1)],[$('#kDwell'),dw.toFixed(1)],[$('#kAcc'),acc.toFixed(1)]];
  vals.forEach(([el,v])=>first?odo(el,v):setVal(el,v));
  const delta=(el,d,unit,dec=1,goodUp=true)=>{if(!isFinite(d)){el.textContent='';return}const up=d>=0;el.className='delta '+((up===goodUp)?'up':'down');el.textContent=`${up?'▲':'▼'} ${Math.abs(d).toFixed(dec)}${unit}`};
  delta($('#kInD'),yn!=null&&yn>5?(ent-yn)/yn*100:NaN,'%');$('#kInC').textContent=yn!=null?`${yLabel()}同時段 ${Math.round(yn)}`:'還沒有前一天的紀錄';
  const yc=y&&y.entries?y.checkouts/y.entries*100:NaN;delta($('#kConvD'),ent?conv-yc:NaN,' pt');$('#kConvC').textContent=`RFID 結帳 ${t.checkouts} 筆`;
  const top=ZONES.map(z=>[z,S.zones[z.id]]).filter(([,z])=>z.dwellN).map(([zd,z])=>[zd,z.dwellSum/z.dwellN/60]).sort((a,b)=>b[1]-a[1])[0];
  const yd=yDwell();delta($('#kDwellD'),dw&&yd?dw-yd:NaN,' 分');$('#kDwellC').textContent=top?`${top[0].name}最久 ${top[1].toFixed(1)} 分`:dw?'各區的停留時間還沒有資料':'等待第一位顧客離場';
  delta($('#kAccD'),acc?acc-accRaw()*100:NaN,' pt');$('#kAccC').textContent=`校正前 ${pct1(accRaw())}%`;
  const w=windows15(),lbl=i=>`${hhmm(w[i].t0)} – ${hhmm(w[i].t1)}`;
  spark($('#sIn'),w.map(x=>x.ent),{fmt:v=>`<b>${v}</b> 人進場`,label:lbl});
  spark($('#sConv'),w.map(x=>x.cent?x.ck/x.cent*100:null),{fmt:v=>`累計轉換率 <b>${v.toFixed(1)}%</b>`,label:i=>`截至 ${hhmm(w[i].t1)}`});
  spark($('#sDwell'),w.map(x=>x.dw),{fmt:v=>`估計停留 <b>${v.toFixed(1)}</b> 分`,label:lbl});
  spark($('#sAcc'),w.map(x=>x.acc),{fmt:v=>`準確度 <b>${v.toFixed(1)}%</b>`,label:lbl});
  ['#sIn','#sConv','#sDwell','#sAcc'].forEach(s=>hoverSpark($(s)));
}

/* needs attention: unacknowledged warnings, with the action that fixes each one */
const todoList=()=>{const seen=new Set();return S.alerts.filter(a=>{if(a.ack||a.level==='info'||a.snooze>S.t||seen.has(a.title))return false;seen.add(a.title);return true})};
function todoDetail(a){
  const rows=[['發生時間',hhmmss(a.t)],['等級',a.level==='crit'?'嚴重':'警告']];
  const nid=a.target?.node;if(nid){const n=S.nodes[nid];rows.push(['最後心跳',hhmmss(n.lastSeen)],['訊號',n.online?n.rssi+' dBm':'—'],['建議','遠端重新開機，約 4 秒恢復'])}
  const zid=a.target?.zone;if(zid){const z=S.zones[zid];rows.push(['Wi-Fi 原始',z.raw+' 支裝置'],['校正係數 k',S.k.toFixed(2)],['目前估計',z.est+' 人'],['擁擠門檻',S.threshold+' 人'])}
  if(!nid&&!zid)rows.push(['場內',`${occ()} / ${S.capacity} 人`],['門外排隊',S.queue+' 人'],['閘門',S.gateOpen?'開啟':'關閉']);
  return rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}
function renderTodo(force){
  const L=todoList(),key=L.map(a=>a.id).join(',');if(!force&&key===OV.todoKey)return;OV.todoKey=key;
  $('#todoN').textContent=L.length||'';const ul=$('#todo');
  if(!L.length){ul.innerHTML=`<li class="alldone"><span class="ok">${icon('check',20)}</span><b>都處理完了</b><span style="font-size:13px">新的狀況出現時會在這裡和右上角通知你。</span></li>`;return}
  ul.innerHTML=L.slice(0,4).map(a=>{const nid=a.target?.node,off=nid&&!S.nodes[nid].online;
    return `<li class="item" data-id="${a.id}"><span class="sev ${a.level}">${icon(a.level==='crit'?(nid?'plug':'crit'):'warn',18)}</span>
      <div><b>${esc(a.title)}</b><p>${esc(a.detail)}</p><button class="exp" aria-expanded="false">詳細資料${icon('chev',14)}</button></div>
      <div class="acts"><span class="t">${hhmm(a.t)}</span>${off?`<button class="btn sec sm" data-reboot="${nid}">重新開機</button>`:`<button class="btn ghost sm" data-snooze>稍後提醒</button><button class="btn pri sm" data-ack>知道了</button>`}</div>
      <div class="more"><div><dl>${todoDetail(a)}</dl></div></div></li>`}).join('')+(L.length>4?`<li class="item more-n"><a class="link" href="#events">還有 ${L.length-4} 則，前往事件頁</a></li>`:'');
}
async function rebootStory(nid,li){
  const n=S.nodes[nid],acts=li.querySelector('.acts');OV.busy=true;
  acts.innerHTML=`<span class="busy">${mxHTML('orbit')}<span class="tsw">送出重開指令</span></span>`;beam(li,'line',true);
  rebootNode(nid);
  const say=async t=>{const s=li.querySelector('.busy .tsw');if(!s)return;s.className='tsw out';await wait(160);s.textContent=t;s.className='tsw in'};
  const t0=performance.now();await wait(1300);await say('等待重新上線');
  while(!(n.online&&n.rebootUntil<=performance.now())&&performance.now()-t0<(S.real?60000:10000))await wait(400);
  if(!n.online){beam(li,'line',false);acts.innerHTML=`<button class="btn sec sm" data-reboot="${nid}">再試一次</button>`;OV.busy=false;
    toast('warn',`${nid} 還沒有重新上線`,S.real?'60 秒內沒有收到心跳。到現場確認電源與 Wi-Fi，或到裝置頁看最後心跳。':'',{label:'查看裝置',fn:()=>goTarget({view:'devices',node:nid})});return}
  const took=((performance.now()-t0)/1000).toFixed(1);await say('收到心跳');await wait(700);
  beam(li,'line',false);li.classList.add('fixed');const sev=li.querySelector('.sev');sev.className='sev ok';sev.innerHTML=OKSVG.replace('16px','18px').replace('16px','18px');
  morph(li.querySelector('b'),`${nid} 已恢復連線`);li.querySelector('p').textContent='資料已改回感測器即時回報。';li.querySelector('.exp')?.remove();acts.innerHTML='<span class="t">剛剛</span>';
  S.alerts.filter(a=>a.target?.node===nid&&!a.ack).forEach(a=>a.ack=true);S.alertVer++;
  await wait(1700);li.classList.add('leaving');await wait(300);OV.busy=false;renderTodo(true);
  toast('ok',`${nid} 已恢復連線`,`從送出指令到收到心跳花了 ${took} 秒`);
}

/* devices + 12-hour uptime strip */
function ovDevices(){
  const now=performance.now();let on=0;
  $('#devs').innerHTML=NODE_DEFS.map(d=>{const n=S.nodes[d.id],reb=n.rebootUntil>now,b=n.online&&n.rssi!=null?(n.rssi>-55?4:n.rssi>-65?3:n.rssi>-75?2:1):0;if(n.online)on++;
    const tip=reb?'重新開機中…':n.online?`訊號 <b>${n.rssi??'—'} dBm</b>${n.boot!=null?` · 運行 ${dur(S.t-n.boot)}`:''}`:n.seen?`${Math.round(S.t-n.lastSeen)} 秒沒有心跳`:'還沒收到這個節點的訊息';
    return`<div class="chipdev ${n.online?'':n.seen?'off':'never'} ${reb?'reb':''}" tabindex="0" data-tt="<small>${d.id} · ${d.role}</small>${tip}"><span class="d"><i></i>${d.id.replace('-01','')}</span><span class="bars">${[5,8,11,14].map((h,i)=>`<i style="height:${h}px" class="${i<b?'on':''}"></i>`).join('')}</span><small>${reb?'重開中':n.online?(n.rssi!=null?n.rssi+' dBm':'在線'):n.seen?'離線':'未回報'}</small></div>`}).join('');
  const c=$('#devChip');c.className='chip '+(on===5?'ok':on>=3?'warn':'crit');c.innerHTML=`<i></i>${on} / 5 在線`;
  const onl=NODE_DEFS.map(d=>S.nodes[d.id]).filter(n=>n.online&&n.rssi!=null),avg=Math.round(onl.reduce((a,n)=>a+n.rssi,0)/Math.max(1,onl.length)),
    offs=S.alerts.filter(a=>a.level==='crit'&&a.target?.node),last=offs[0],good=S.upt.filter(v=>v===0).length,done=S.upt.length;
  $('#devSum').innerHTML=`<div><span class="label">平均訊號</span><b>${onl.length?avg:'—'}<small>dBm</small></b></div><div><span class="label">全部在線</span><b>${done?`${Math.round(good/done*100)}<small>% 時段</small>`:'—'}</b></div><div><span class="label">最近離線</span><b>${last?`${hhmm(last.t)}<small>${last.target.node}</small>`:'今天沒有'}</b></div>`;
  const cur=Math.floor((S.t-OPEN)/900);
  $('#uptime').innerHTML=Array.from({length:48},(_,i)=>{const v=i<cur?(S.upt[i]??0):i===cur?S.uptCur:null,m=OPEN/60+i*15,lbl=`${pad(m/60|0)}:${pad(m%60)}–${pad((m+15)/60|0)}:${pad((m+15)%60)}`;
    return`<i class="${v==null?'f':v===2?'c':v===1?'w':''}" data-tt="<small>${lbl}</small>${v==null?'尚未發生':v===2?'有節點離線':v===1?'訊號偏弱或重開機':'5 / 5 在線'}"></i>`}).join('');
}

/* 2D floor plan: dots rest at browse spots in front of fixtures and hop between them; nobody walks through a wall */
const MZ=[{id:'A',x0:0,x1:11.5,z0:0,z1:8},{id:'B',x0:13.5,x1:25,z0:0,z1:8},{id:'C',x0:0,x1:11.5,z0:9,z1:17},{id:'D',x0:18.5,x1:25,z0:9,z1:17}];
const FX=[['A',2.2,2.6,3,1.3],['A',6.6,2.6,3,1.3],['A',4.4,5.6,1.8,1.8],['B',15.5,2.4,3,.9],['B',19.5,2.4,3,.9],['B',17.5,5.5,3,.9],['C',2.5,11.3,7.5,.7],['C',2.5,14.4,7.5,.7],['D',19.3,11.5,4.6,1.1]];
const SPOTS2={A:[],B:[],C:[],D:[]};FX.forEach(([z,x,y,w,h])=>{for(let k=.5;k<w;k+=1.1){SPOTS2[z].push([x+k,y-.5]);SPOTS2[z].push([x+k,y+h+.5])}});
let dots=[],seq=1000;
function syncDots(){for(const z of MZ){const v=zoneVals(ZMAP[z.id]),want=v.stale?0:Math.min(18,v.est),have=dots.filter(d=>d.z===z.id&&!d.dead);
  while(have.length<want){const s=SPOTS2[z.id][Math.random()*SPOTS2[z.id].length|0],d={z:z.id,x:s[0],y:s[1],a:0,born:S.t,id:++seq};dots.push(d);have.push(d)}
  while(have.length>want){have.pop().dead=true}}}
const cssv=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let mapGeo=null,ripples=[];
function mapFrame(now){requestAnimationFrame(mapFrame);const cv=$('#map');if(view!=='overview'||document.hidden)return;
  const r=cv.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio);if(!r.width)return;
  if(cv.width!==Math.round(r.width*dpr)||cv.height!==Math.round(r.height*dpr)){cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr)}
  const ctx=cv.getContext('2d'),p=16,s=Math.min((r.width-p*2)/25,(r.height-p*2)/17),ox=(r.width-25*s)/2,oy=(r.height-17*s)/2,X=x=>ox+x*s,Y=y=>oy+y*s;mapGeo={X,Y,r};
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
  const ink=PAL.ink,hl=OV.mapHl;
  MZ.forEach(z=>{const v=zoneVals(ZMAP[z.id]),h=v.stale?'stale':heatOf({est:v.est,stale:false});ctx.fillStyle=h==='hot'?PAL.crit:h==='warm'?PAL.warn:PAL['z'+z.id];
    ctx.globalAlpha=v.stale?.04:hl&&hl!==z.id?.03:h==='hot'?.16:.08;ctx.beginPath();ctx.roundRect(X(z.x0)+2,Y(z.z0)+2,(z.x1-z.x0)*s-4,(z.z1-z.z0)*s-4,8);ctx.fill();ctx.globalAlpha=1;
    if(v.stale){ctx.save();ctx.beginPath();ctx.roundRect(X(z.x0)+2,Y(z.z0)+2,(z.x1-z.x0)*s-4,(z.z1-z.z0)*s-4,8);ctx.clip();ctx.strokeStyle=PAL.line2;ctx.lineWidth=1;for(let k=-20;k<40;k++){ctx.beginPath();ctx.moveTo(X(z.x0)+k*10,Y(z.z0));ctx.lineTo(X(z.x0)+k*10+(z.z1-z.z0)*s,Y(z.z1));ctx.stroke()}ctx.restore();
      ctx.fillStyle=PAL.ink3;ctx.font='600 12px "Noto Sans TC",sans-serif';ctx.fillText('節點離線',X((z.x0+z.x1)/2)-24,Y((z.z0+z.z1)/2)+4)}
    ctx.fillStyle=PAL.ink3;ctx.font='600 11px "Geist Mono",monospace';ctx.fillText(z.id,X(z.x0)+9,Y(z.z0)+17)});
  ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(X(14.5),Y(17));ctx.lineTo(X(0),Y(17));ctx.lineTo(X(0),Y(0));ctx.lineTo(X(25),Y(0));ctx.lineTo(X(25),Y(17));ctx.lineTo(X(17.5),Y(17));ctx.stroke();
  ctx.strokeStyle=vGate()?PAL.accent:PAL.crit;ctx.setLineDash(vGate()?[3,3]:[]);ctx.beginPath();ctx.moveTo(X(14.5),Y(17));ctx.lineTo(X(17.5),Y(17));ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=PAL.ink3;ctx.font='500 10px "Geist Mono",monospace';ctx.fillText(vGate()?'入口':'閘門關閉',X(15.1),Y(17)-6);
  FX.forEach(([z,x,y,w,h])=>{ctx.fillStyle=PAL.raised;ctx.strokeStyle=PAL.line2;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(X(x),Y(y),w*s,h*s,3);ctx.fill();ctx.stroke()});
  dots=dots.filter(d=>!(d.dead&&d.a<=0));
  for(const d of dots){d.a=clamp(d.a+(d.dead?-1:1)*.04,0,1);
    if(!d.dead&&!RM&&Math.random()<.003){const sp=SPOTS2[d.z][Math.random()*SPOTS2[d.z].length|0];d.tx=sp[0];d.ty=sp[1];d.hop=1}
    if(d.hop){d.hop-=.03;if(d.hop<=.5&&!d.moved){d.x=d.tx;d.y=d.ty;d.moved=true}if(d.hop<=0){d.hop=0;d.moved=false}}
    const vis=d.hop?Math.abs(d.hop-.5)*2:1,col=PAL['z'+d.z],b=Math.sin(now/600+d.x*3)*.6;ctx.globalAlpha=d.a*vis*(hl&&hl!==d.z?.25:1);
    ctx.fillStyle=col;ctx.globalAlpha*=.18;ctx.beginPath();ctx.arc(X(d.x),Y(d.y),7+b,0,7);ctx.fill();ctx.globalAlpha/=.18;ctx.beginPath();ctx.arc(X(d.x),Y(d.y),3.6,0,7);ctx.fill();ctx.globalAlpha=1}
  ripples=ripples.filter(q=>now-q<1400);for(const q of ripples){const k=(now-q)/1400;ctx.strokeStyle=PAL.accent;ctx.globalAlpha=1-k;ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(16),Y(17),6+k*26,Math.PI,2*Math.PI);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=PAL.accent;ctx.globalAlpha=1-k;ctx.font='700 11px "Noto Sans TC",sans-serif';ctx.fillText('+1 進場',X(16)-20,Y(17)-14-k*14);ctx.globalAlpha=1}
}
function mapHover(){const cv=$('#map');
  cv.addEventListener('pointermove',e=>{if(!mapGeo)return;const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;let best=null,bd=12;
    for(const d of dots){if(d.dead)continue;const dd=Math.hypot(mapGeo.X(d.x)-mx,mapGeo.Y(d.y)-my);if(dd<bd){bd=dd;best=d}}
    if(best){const z=ZMAP[best.z];cv.style.cursor='pointer';showTip(r.left+mapGeo.X(best.x),r.top+mapGeo.Y(best.y)-6,`<small>訪客 #${best.id}</small><span class="sw2" style="background:var(--z${z.id})"></span>${z.id} ${z.name}　停留 <b>${Math.max(1,Math.round((S.t-best.born)/60))}</b> 分`)}else{cv.style.cursor='';hideTip()}});
  cv.addEventListener('pointerleave',hideTip)}
function ovLegend(){
  $('#zleg').innerHTML=ZONES.map(z=>`<button data-z="${z.id}" aria-pressed="${OV.mapHl===z.id}"><span><i style="background:var(--z${z.id})"></i>${z.id} ${z.name}</span><b id="zc-${z.id}">0</b></button>`).join('');
  $('#zleg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;OV.mapHl=OV.mapHl===b.dataset.z?null:b.dataset.z;$$('#zleg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.z===OV.mapHl))})}

/* bottom of the todo card: today's alerts at a glance; a column opens the events page filtered to that hour */
function ovTodoSum(){const k=S.alertVer+'|'+Math.floor(S.t/3600);if(OV.sumKey===k)return;OV.sumKey=k;
  const A=S.alerts.filter(a=>a.level!=='info'),done=A.filter(a=>a.ack).length,crit=A.filter(a=>a.level==='crit').length;
  $('#todoSum').innerHTML=`<div class="ts-h"><span class="label">今天的告警</span><span class="mono">${A.length} 則 · 已處理 ${done}${crit?` · 嚴重 ${crit}`:''}</span></div><div class="ehist mini">${evStripHTML(null)}</div>`}
function renderOverview(){
  ovHeadline();ovHero();ovKpis(false);ovDevices();if(!OV.busy)renderTodo();ovTodoSum();ovPredict();
  ZONES.forEach(z=>{const v=zoneVals(z);popNum($('#zc-'+z.id),v.stale?'—':v.est)});syncDots();
  const e=S.today.entries;if(OV.lastEntries!=null&&e>OV.lastEntries&&!snap()&&!RM)ripples.push(performance.now());OV.lastEntries=e;
}
function initOverview(){
  $('#ticks').innerHTML='<i></i>'.repeat(40);ovLegend();ovFlowHover();mapHover();requestAnimationFrame(mapFrame);
  $('#todo').addEventListener('click',e=>{const li=e.target.closest('.item');if(!li||!li.dataset.id)return;const a=S.alerts.find(x=>x.id==li.dataset.id);
    if(e.target.closest('.exp')){li.classList.toggle('open');e.target.closest('.exp').setAttribute('aria-expanded',li.classList.contains('open'));return}
    const rb=e.target.closest('[data-reboot]');if(rb){rebootStory(rb.dataset.reboot,li);return}
    const ack=e.target.closest('[data-ack]'),sn=e.target.closest('[data-snooze]');if(!ack&&!sn||!a)return;
    li.classList.add('leaving');setTimeout(()=>{if(ack)a.ack=true;else a.snooze=S.t+1800;S.alertVer++;slog('op','info',ack?`標為已處理：${a.title}`:`30 分鐘後再提醒：${a.title}`,'');renderTodo(true);renderBadges();
      toast('ok',ack?'已標記為處理':'30 分鐘後再提醒你',a.title,{label:'復原',fn:()=>{a.ack=false;a.snooze=0;S.alertVer++;renderTodo(true);renderBadges()}})},280)});
  $('#todoSum').addEventListener('click',e=>{const b=e.target.closest('.eh');if(!b||b.disabled)return;EV.h=+b.dataset.h;go('events')});
  $('#expMain').onclick=()=>exportData(OV.fmt||'CSV');
  bindPop($('#expMore'),$('#expMenu'));
  $('#expMenu').addEventListener('click',e=>{const mi=e.target.closest('.mi');if(!mi)return;OV.fmt=mi.dataset.f;closePops();morph($('#expLbl'),'匯出 '+OV.fmt)});
}
function bootOverview(){ /* skeleton → staggered reveal → numbers roll in, prediction "thinks" first */
  const c=$('#main');c.classList.remove('ready');c.classList.add('booting');
  [$('.hello'),...$$('#p-overview .card')].forEach((el,i)=>el.style.setProperty('--d',(i*60)+'ms'));
  setTimeout(()=>{c.classList.remove('booting');void c.offsetWidth;c.classList.add('ready');ovKpis(true);ovPredict(true)},RM?0:800);
}
