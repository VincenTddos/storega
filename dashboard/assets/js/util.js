/* StoreGA · shared helpers (classic script: everything here is global on purpose so the page also runs from file://) */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const pad=n=>String(n).padStart(2,'0');
const hhmm=t=>`${pad(Math.floor(t/3600)%24)}:${pad(Math.floor(t/60)%60)}`;
const hhmmss=t=>`${hhmm(t)}:${pad(Math.floor(t)%60)}`;
const dayKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const wallTod=()=>{const d=new Date();return d.getHours()*3600+d.getMinutes()*60+d.getSeconds()+d.getMilliseconds()/1000};
/* ws://host[:port][/path] — a path lets the broker share a port behind Node-RED or a reverse proxy (e.g. wss://host/mqtt) */
const isWsUrl=v=>/^wss?:\/\/[^\s/:]+(:\d{2,5})?(\/[^\s]*)?$/.test(v);
const pct1=v=>isFinite(v)?(v*100).toFixed(1):'—';
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const reduceMotion=RM;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const icon=(id,w=16,cls='')=>`<svg class="i ${cls}" style="width:${w}px;height:${w}px"><use href="#${id}"/></svg>`;
const wait=ms=>new Promise(r=>setTimeout(r,RM?Math.min(ms,40):ms));
const dur=s=>{s=Math.max(0,s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h} 時 ${m} 分`:`${m} 分`};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let R=mulberry32(20261028);
function poisson(l){if(l<=0)return 0;const L=Math.exp(-l);let k=0,p=1;do{k++;p*=R()}while(p>L);return k-1}
const gauss=(x,m,s)=>Math.exp(-((x-m)**2)/(2*s*s));
const store={get(k,d){try{const v=localStorage.getItem('storega:'+k);return v==null?d:JSON.parse(v)}catch{return d}},set(k,v){try{localStorage.setItem('storega:'+k,JSON.stringify(v))}catch{}},del(k){try{localStorage.removeItem('storega:'+k)}catch{}}};
function niceMax(v){if(v<=0)return 1;const e=Math.pow(10,Math.floor(Math.log10(v))),f=v/e;return(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e}
function download(name,text,type){const b=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
