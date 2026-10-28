# MQTT 主題與資料格式

所有訊息都是 JSON。儀表板訂閱 `sga/+/+`，並在使用者操作時發佈到 `sga/{node}/cmd`。

## 上行（ESP32 → Node-RED → 儀表板）

### `sga/entry-01/counter`（入口節點，建議每 1–5 秒）

```json
{ "in": 412, "out": 393, "occupancy": 19, "queue": 0, "checkout": 129,
  "gate": true, "temp": 24.1, "hum": 60, "dwell_avg": 1014 }
```

| 欄位 | 說明 |
| --- | --- |
| `in` / `out` | 今日累計進場／離場（兩組紅外線判斷方向） |
| `occupancy` | 場內人數（標準答案） |
| `queue` | 門外排隊人數 |
| `checkout` | 今日 RFID 結帳次數 |
| `gate` | 閘門是否開啟 |
| `temp` / `hum` | DHT11 溫濕度 |
| `dwell_avg` | 今日平均停留秒數（選填） |

### `sga/zone-X/wifi`（分區節點，X = A–D）

```json
{ "raw": 14, "dwell_avg": 540 }
```

`raw` 是這一輪監聽到的裝置數。MAC 位址在板子上先加鹽再做 SHA-256，只上傳計數，不上傳原始 MAC。

### `sga/zone-X/radar`

```json
{ "presence": true, "moving": false }
```

HLK-LD2410 的判斷。雷達判斷無人時，該區估計值直接歸零。

### `sga/{node}/status`（心跳，建議每 5 秒）

```json
{ "rssi": -56, "ip": "192.168.50.31", "fw": "1.3.8", "uptime": 22140 }
```

超過 15 秒沒有任何訊息就判定離線。

## 下行（儀表板 → ESP32）：`sga/{node}/cmd`

| 動作 | 範例 |
| --- | --- |
| 閘門模式 | `{ "action": "gate", "mode": "auto" }`（`auto` / `open` / `closed`） |
| 人數上限 | `{ "action": "capacity", "value": 40 }` |
| Wi-Fi 校正 | `{ "action": "calibrate", "k": 0.612 }` |
| 閃燈找裝置 | `{ "action": "blink", "seconds": 4 }` |
| 遠端重開機 | `{ "action": "reboot" }` |

## 校正係數 k

```
k = 入口場內人數 ÷ 各區 Wi-Fi 裝置數總和
分區估計 = 雷達判斷無人 ? 0 : round(raw × k)
```

自動模式下每分鐘以 `k = 0.7 × k + 0.3 × 新值` 微調；按「立即校正」則直接採用新值。
