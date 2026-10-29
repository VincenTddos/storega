// 感測融合：收下所有 sga/+/+ 訊息，算出每區的校正後人數，檢查規則並發出告警
// 輸出 1 → sga/system/state（整店狀態，retain）  輸出 2 → sga/system/alert  輸出 3 → 下行指令（msg.topic 已設好）
const NODES = ['entry-01', 'zone-A', 'zone-B', 'zone-C', 'zone-D'];
const RADAR = { A: true, B: true, C: false, D: true };
const st = flow.get('sga') || {
  capacity: Number(env.get('STOREGA_CAPACITY')) || 40,
  threshold: Number(env.get('STOREGA_THRESHOLD')) || 14,
  gateMode: 'auto', k: 0.62, kAuto: true,
  entry: { in: 0, out: 0, occupancy: 0, queue: 0, checkout: 0, gate: true, temp: null, hum: null },
  zones: { A: {}, B: {}, C: {}, D: {} }, nodes: {}, cool: {}, lastState: 0
};
const [, id, kind] = String(msg.topic).split('/');
const p = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
const now = Date.now();
const alerts = [];
const cmds = [];

function alert(key, level, title, detail, coolMs = 15 * 60 * 1000) {
  if (st.cool[key] && now - st.cool[key] < coolMs) return;
  st.cool[key] = now;
  alerts.push({ payload: { key, level, title, detail, ts: now, source: 'node-red' } });
}

if (NODES.includes(id)) {
  const n = st.nodes[id] || (st.nodes[id] = {});
  if (kind === 'cmd') {
    // 儀表板送給板子的指令也會經過這裡，用來同步 Node-RED 記得的設定
    if (p.action === 'capacity' && p.value >= 10 && p.value <= 80) st.capacity = Number(p.value);
    if (p.action === 'gate' && ['auto', 'open', 'closed'].includes(p.mode)) st.gateMode = p.mode;
    if (p.action === 'calibrate' && p.k > 0) { st.k = Number(p.k); }
    if (p.action === 'threshold' && p.value >= 4 && p.value <= 30) st.threshold = Number(p.value);
  } else if (p.online === false) {
    n.last = 0; // MQTT 遺言：板子斷線
  } else {
    n.last = now;
    if (p.rssi != null) n.rssi = p.rssi;
    if (p.ip) n.ip = p.ip;
    if (p.fw) n.fw = p.fw;
    if (kind === 'counter') {
      Object.assign(st.entry, p);
      if (['auto', 'open', 'closed'].includes(p.mode)) st.gateMode = p.mode;
      if (p.capacity >= 10) st.capacity = p.capacity;
    }
    const z = id.startsWith('zone-') ? st.zones[id.slice(-1)] : null;
    if (z && kind === 'wifi' && p.raw != null) z.raw = Number(p.raw);
    if (z && kind === 'radar') { z.presence = !!p.presence; z.moving = !!p.moving; }
  }
}

// 融合：雷達判斷無人 → 0；否則 Wi-Fi 原始數 × k
let sumRaw = 0, sumEst = 0;
for (const zid of Object.keys(st.zones)) {
  const z = st.zones[zid], node = st.nodes['zone-' + zid] || {};
  z.online = !!node.last && now - node.last < 15000;
  z.est = RADAR[zid] && z.presence === false ? 0 : Math.round((z.raw || 0) * st.k);
  if (z.online) { sumRaw += z.raw || 0; sumEst += z.est; }
}
st.sumRaw = sumRaw; st.sumEst = sumEst;

// 規則
const occ = Number(st.entry.occupancy) || 0, ratio = occ / st.capacity;
if (ratio >= 1) alert('cap100', 'crit', '已達人數上限，閘門關閉', `場內 ${occ} / ${st.capacity} 人，門外排隊 ${st.entry.queue || 0} 人。`, 5 * 60 * 1000);
else if (ratio >= 0.8) alert('cap80', 'warn', '場內人數接近上限', `目前 ${occ} / ${st.capacity} 人（${Math.round(ratio * 100)}%）。`);
for (const zid of Object.keys(st.zones)) {
  const z = st.zones[zid];
  if (z.online && z.est > st.threshold) alert('z-' + zid, 'warn', `${zid} 區擁擠`, `校正後估計 ${z.est} 人，門檻 ${st.threshold} 人。`);
}
if (st.entry.temp != null && st.entry.temp >= 30) alert('temp', 'warn', '入口溫度偏高', `DHT11 讀值 ${st.entry.temp}°C。`, 30 * 60 * 1000);

flow.set('sga', st);
node.status({ fill: ratio >= 1 ? 'red' : ratio >= 0.8 ? 'yellow' : 'green', shape: 'dot', text: `場內 ${occ}/${st.capacity} · k ${st.k.toFixed(2)}` });

// 狀態最多每秒送一次
let state = null;
if (now - st.lastState >= 1000) {
  st.lastState = now;
  state = { payload: {
    ts: now, occupancy: occ, capacity: st.capacity, queue: st.entry.queue || 0, gate: !!st.entry.gate, gateMode: st.gateMode,
    entries: st.entry.in || 0, checkouts: st.entry.checkout || 0, conversion: st.entry.in ? +(st.entry.checkout / st.entry.in).toFixed(3) : 0,
    temp: st.entry.temp, hum: st.entry.hum, k: +st.k.toFixed(3), threshold: st.threshold,
    zones: Object.fromEntries(Object.entries(st.zones).map(([zid, z]) => [zid, { raw: z.raw || 0, est: z.est, presence: z.presence ?? null, online: z.online }])),
    nodes: Object.fromEntries(NODES.map(nid => { const n = st.nodes[nid] || {}; return [nid, { online: !!n.last && now - n.last < 15000, rssi: n.rssi ?? null }]; }))
  } };
}
return [state, alerts.length ? alerts : null, cmds.length ? cmds : null];
