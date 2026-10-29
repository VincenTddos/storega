// 心跳檢查（每 5 秒）：超過 15 秒沒有訊息就判定離線，恢復時再通知一次
const NODES = ['entry-01', 'zone-A', 'zone-B', 'zone-C', 'zone-D'];
const st = flow.get('sga');
if (!st) return null;
const now = Date.now(), out = [];
st.offline = st.offline || {};
for (const id of NODES) {
  const n = st.nodes[id] || {}, online = !!n.last && now - n.last < 15000;
  if (!online && !st.offline[id] && n.seen !== undefined) {
    st.offline[id] = now;
    out.push({ payload: { key: 'off-' + id, level: 'crit', title: `${id} 離線`, detail: '超過 15 秒沒有心跳，請檢查電源與 Wi-Fi。', ts: now, source: 'node-red' } });
  }
  if (online && st.offline[id]) {
    const sec = Math.round((now - st.offline[id]) / 1000);
    delete st.offline[id];
    out.push({ payload: { key: 'on-' + id, level: 'info', title: `${id} 恢復連線`, detail: `離線 ${sec} 秒，訊號 ${n.rssi} dBm。`, ts: now, source: 'node-red' } });
  }
  if (online) n.seen = true;
}
flow.set('sga', st);
const off = NODES.filter(id => st.offline[id]);
node.status(off.length ? { fill: 'red', shape: 'ring', text: '離線：' + off.join(', ') } : { fill: 'green', shape: 'dot', text: '5 / 5 在線' });
return [out.length ? out : null];
