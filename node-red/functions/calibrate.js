// 自動校正 k（每分鐘）：k = 0.7 × k + 0.3 × (入口人數 ÷ Wi-Fi 裝置總數)
// msg.payload === 'now' 時（手動按鈕）直接採用新值並通知入口節點
const st = flow.get('sga');
if (!st) return null;
const occ = Number(st.entry.occupancy) || 0;
if (!(st.sumRaw > 0) || occ <= 0) { node.status({ fill: 'grey', shape: 'ring', text: '等待資料' }); return null; }
const target = Math.min(1.2, Math.max(0.2, occ / st.sumRaw));
const manual = msg.payload === 'now';
if (!manual && !st.kAuto) return null;
const before = st.k;
st.k = manual ? target : 0.7 * st.k + 0.3 * target;
flow.set('sga', st);
node.status({ fill: 'blue', shape: 'dot', text: `k ${before.toFixed(2)} → ${st.k.toFixed(2)}` });
if (!manual) return null;
return { topic: 'sga/entry-01/cmd', payload: { action: 'calibrate', k: +st.k.toFixed(3) } };
