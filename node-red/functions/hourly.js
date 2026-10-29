// 整點紀錄：每小時把當下狀態寫成一行 CSV（接 file 節點，附加到 storega-log.csv）
const st = flow.get('sga');
if (!st) return null;
const d = new Date(), z = st.zones;
const line = [d.toISOString(), st.entry.in || 0, st.entry.out || 0, st.entry.occupancy || 0, st.entry.checkout || 0,
  st.k.toFixed(3), z.A.est ?? '', z.B.est ?? '', z.C.est ?? '', z.D.est ?? '', st.entry.temp ?? '', st.entry.hum ?? ''].join(',');
return { payload: line };
