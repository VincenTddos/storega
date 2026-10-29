// 每日紀錄（每分鐘）：把今天的逐時進場與每 5 分鐘場內人數記在 Node-RED，換日時封存成一天的摘要
// 歷史（最多 30 天）存在 storega-history.json，並以 retain 發到 sga/system/history，任何一台電腦打開儀表板都看得到
// msg.history（部署時從檔案讀進來）會先載入
// 輸出 1 → sga/system/history（retain）  輸出 2 → 寫檔 storega-history.json
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let hist = flow.get('sgaHistory') || [];
if (Array.isArray(msg.history)) {  // loaded from the file at deploy
  hist = msg.history.filter(x => x && x.date).slice(-30);
  flow.set('sgaHistory', hist);
  return [{ payload: { days: hist, ts: Date.now() } }, null];
}
const st = flow.get('sga');
if (!st) return null;
const now = msg.now ? new Date(msg.now) : new Date(), today = dayKey(now);
const e = st.entry || {}, inn = Number(e.in) || 0, co = Number(e.checkout) || 0;
let day = flow.get('sgaDay');
let out1 = null, out2 = null;
if (!day || day.date !== today) {
  if (day && day.entries > 0) {  // the day just ended: keep its summary
    const d = new Date(day.date + 'T12:00:00');
    hist = hist.filter(x => x.date !== day.date).concat([{ date: day.date, label: `${d.getMonth() + 1}/${d.getDate()}`, sub: '週' + '日一二三四五六'[d.getDay()],
      entries: day.entries, checkouts: day.checkouts, dwell: day.dwell, hourly: day.hourly, occ: day.occ, source: 'node-red' }]).slice(-30);
    flow.set('sgaHistory', hist);
    out1 = { payload: { days: hist, ts: Date.now() } };
    out2 = { payload: JSON.stringify(hist) };
  }
  day = { date: today, hourly: Array(12).fill(0), occ: Array(144).fill(null), lastIn: inn, entries: 0, checkouts: 0, dwell: 0 };
}
// entries into the hour they happened (a smaller counter means the board reset: start again from it)
const delta = inn >= day.lastIn ? inn - day.lastIn : inn;
day.lastIn = inn;
const h = now.getHours();
if (delta > 0 && h >= 10 && h < 22) day.hourly[h - 10] += delta;
const slot = Math.floor(((h - 10) * 60 + now.getMinutes()) / 5);
if (slot >= 0 && slot < 144) day.occ[slot] = Number(e.occupancy) || 0;
day.entries = inn; day.checkouts = co; day.dwell = e.dwell_avg ? +(e.dwell_avg / 60).toFixed(1) : 0;
flow.set('sgaDay', day);
node.status({ fill: 'green', shape: 'dot', text: `${today} 進場 ${inn} · 歷史 ${hist.length} 天` });
return [out1, out2];
