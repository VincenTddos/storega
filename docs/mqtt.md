# MQTT 主題與資料格式

所有訊息都是 JSON。ESP32 透過 TCP `1883` 連到 Aedes broker；儀表板透過 WebSocket `8080` 訂閱 `sga/+/+`，使用者操作時發佈到 `sga/{node}/cmd`。

```
entry-01 ─┐  sga/entry-01/{counter,status,event}           ┌─ 儀表板（ws://…:8080）
zone-A~D ─┼─ sga/zone-X/{wifi,radar,status} ──▶ Aedes ──┼─ Node-RED 融合／規則 ─▶ sga/system/{state,alert,online}
          └◀ sga/{node}/cmd ◀────────────────────────────┘
```

## 上行（ESP32 → broker）

### `sga/entry-01/counter`：入口節點，有變化時立即送（最快 4 次／秒），否則每 2 秒

```json
{ "in": 412, "out": 393, "occupancy": 19, "queue": 0, "checkout": 129, "gate": true,
  "temp": 24.1, "hum": 60, "dwell_avg": 1014, "mode": "auto", "capacity": 40 }
```

| 欄位 | 說明 |
| --- | --- |
| `in` / `out` | 今日累計進場／離場（兩組紅外線判斷方向），午夜歸零 |
| `occupancy` | 場內人數（`in − out`，系統的標準答案） |
| `queue` | 閘門關閉時，在門口等待的人數 |
| `checkout` | 今日 RFID 結帳次數（同一張卡 3 秒內只算一次） |
| `gate` | 閘門現在是否開著 |
| `temp` / `hum` | DHT11 溫濕度；讀取失敗時為 `null` |
| `dwell_avg` | 平均停留秒數（Little's law：場內人數對時間的積分 ÷ 進場人數） |
| `mode` / `capacity` | 板子實際使用的閘門模式與上限；收到指令後會回報，讓畫面和板子一致 |

### `sga/entry-01/event`

```json
{ "type": "button", "action": "calibrate" }
```

入口的校正按鈕按住 1 秒。Node-RED 收到後立刻重新計算 k。

### `sga/zone-X/wifi`：分區節點，每 5 秒

```json
{ "raw": 14 }
```

`raw` = 過去 60 秒內聽到的不同裝置數。MAC 在板子上做 `SHA-256(鹽 + MAC)` 後只留前 8 bytes，不儲存也不上傳原始 MAC；訊號弱於 `MIN_RSSI` 的裝置與員工白名單不計。

### `sga/zone-X/radar`：有變化時立即送，否則每 2 秒（C 區沒有雷達）

```json
{ "presence": true, "moving": false, "move_cm": 90, "still_cm": 300 }
```

HLK-LD2410 的判斷。雷達說「沒人」時，該區估計值直接歸零。

### `sga/{node}/status`：心跳，每 5 秒

```json
{ "rssi": -56, "ip": "192.168.50.31", "fw": "1.3.8", "uptime": 22140, "heap": 181000 }
```

超過 15 秒沒有任何訊息就判定離線。每塊板子連線時都設定 **遺言（last will）**：斷電或斷網時 broker 會代為發佈 `{"online": false}`，系統立刻知道。

## 下行指令：`sga/{node}/cmd`

| 動作 | 範例 | 誰會處理 |
| --- | --- | --- |
| 閘門模式 | `{ "action": "gate", "mode": "auto" }`（`auto` / `open` / `closed`） | entry-01 |
| 人數上限 | `{ "action": "capacity", "value": 40 }`（10–80） | entry-01 |
| 擁擠門檻 | `{ "action": "threshold", "value": 14 }`（4–30） | Node-RED |
| Wi-Fi 校正 | `{ "action": "calibrate", "k": 0.612 }` | Node-RED |
| 閃燈找裝置 | `{ "action": "blink", "seconds": 4 }` | 全部 |
| 遠端重開機 | `{ "action": "reboot" }` | 全部 |
| 今日歸零 | `{ "action": "reset_day" }` | entry-01 |

Node-RED 也訂閱了 `sga/+/+`，所以儀表板送出的指令它都看得到，並會記住上限、門檻與 k。

## Node-RED 發佈的主題

| 主題 | 內容 |
| --- | --- |
| `sga/system/state`（retain，每秒） | 整店狀態：場內、上限、排隊、閘門、進場、結帳、轉換率、溫濕度、k、各區 `{raw, est, presence, online}`、各節點 `{online, rssi}` |
| `sga/system/alert` | `{ key, level: "crit"/"warn"/"info", title, detail, ts, source: "node-red" }` |
| `sga/system/online`（retain） | Node-RED 自己的上線／離線（birth / last will） |

## 校正係數 k

```
k = 入口場內人數 ÷ 各區 Wi-Fi 裝置數總和        （限制在 0.2–1.2）
分區估計 = 雷達判斷無人 ? 0 : round(raw × k)
```

每分鐘自動以 `k = 0.7 × k + 0.3 × 新值` 微調；按入口的校正按鈕、Node-RED 的「立即校正」或儀表板的「立即校正」則直接採用新值。為什麼需要：一個人可能帶好幾支裝置、新手機會隨機化 MAC、ESP32 只聽得到一個頻道——原始數一定不準，但入口紅外線的人數是準的。
