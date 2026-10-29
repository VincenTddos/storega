# MQTT 主題與資料格式

所有訊息都是 JSON。ESP32 透過 TCP `1883` 連到 Aedes broker；儀表板透過 WebSocket `8080` 訂閱 `sga/+/+`，使用者操作時發佈到 `sga/{node}/cmd`。

```
entry-01 ─┐  sga/entry-01/{counter,status,event}           ┌─ 儀表板（ws://…:8080）
zone-A~D ─┼─ sga/zone-X/{wifi,radar,status} ──▶ Aedes ──┼─ Node-RED 融合／規則 ─▶ sga/system/{state,alert,online}
          └◀ sga/{node}/cmd ◀────────────────────────────┘
```

## 每則上行訊息都有的欄位

```json
{ "...": "...", "seq": 1842, "ts": 1761710000123 }
```

| 欄位 | 說明 |
| --- | --- |
| `seq` | 這塊板子送出的第幾則（所有主題共用一個計數，重開機從 1 開始）。收到的一方看到跳號 = 中間掉了幾則 |
| `ts` | 送出時間，NTP 校時後的毫秒（UTC）；還沒校時是 `0`。收到時間 − `ts` = 延遲（兩邊時鐘都要校時，誤差約數 ms～數十 ms） |

儀表板「裝置」頁的延遲（中位數／95%）與遺失率就是用這兩個欄位算的。

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

```json
{ "type": "auto_zero", "was": 3 }
```

打烊時間（`CLOSE_HOUR`）過 30 分鐘，場內人數還不是 0：入口節點把它歸零（紅外線今天少算了 `was` 個人的離場），Node-RED 發一則 info 告警。

### `sga/{node}/ack`：指令回覆

```json
{ "id": "cmvt2ahnk1", "action": "capacity", "ok": false, "reason": "capacity must be 10-80" }
```

指令帶了 `id` 時，板子執行後立刻回覆。儀表板 6 秒內沒收到回覆就記一筆「沒有回應」。

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
{ "rssi": -56, "ip": "192.168.50.31", "fw": "1.4.0", "uptime": 22140, "heap": 181000, "reset": "poweron" }
```

`reset` 是上次重開的原因：`poweron`（通電）、`software`（指令或 OTA）、`watchdog`（看門狗：程式卡住超過 15 秒）、`panic`（當機）、`brownout`（電壓不足）、`other`。

超過 15 秒沒有任何訊息就判定離線。每塊板子連線時都設定 **遺言（last will）**：斷電或斷網時 broker 會代為發佈 `{"online": false}`，系統立刻知道。

## 下行指令：`sga/{node}/cmd`

| 動作 | 範例 | 誰會處理 |
| --- | --- | --- |
| 閘門模式 | `{ "action": "gate", "mode": "auto" }`（`auto` / `open` / `closed`） | entry-01 |
| 人數上限 | `{ "action": "capacity", "value": 40 }`（10–80） | entry-01 |
| 場內人數校正 | `{ "action": "set_occupancy", "value": 0 }`（0–今天進場數；調整離場數讓場內 = value） | entry-01 |
| 擁擠門檻 | `{ "action": "threshold", "value": 14 }`（4–30） | Node-RED |
| Wi-Fi 校正 | `{ "action": "calibrate", "k": 0.612 }` | Node-RED |
| 閃燈找裝置 | `{ "action": "blink", "seconds": 4 }` | 全部 |
| 遠端重開機 | `{ "action": "reboot" }` | 全部 |
| 今日歸零 | `{ "action": "reset_day" }` | entry-01 |

板子負責的指令（閘門、上限、人數校正、閃燈、重開、歸零）儀表板會加上 `"id"`，板子在 `sga/{node}/ack` 回覆；門檻與校正是 Node-RED 的事，不帶 `id`，板子也不回。

Node-RED 也訂閱了 `sga/+/+`，所以儀表板送出的指令它都看得到，並會記住上限、門檻與 k。

## Node-RED 發佈的主題

| 主題 | 內容 |
| --- | --- |
| `sga/system/state`（retain，每秒） | 整店狀態：場內、上限、排隊、閘門、進場、結帳、轉換率、溫濕度、k、各區 `{raw, est, presence, online}`、各節點 `{online, rssi}` |
| `sga/system/alert` | `{ key, level: "crit"/"warn"/"info", title, detail, ts, source: "node-red" }` |
| `sga/system/online`（retain） | Node-RED 自己的上線／離線（birth / last will） |
| `sga/system/history`（retain） | `{ days: [{ date, entries, checkouts, dwell, hourly[12], occ[144] }…], ts }`：過去最多 30 天的摘要，存在 Node-RED 的 `storega-history.json` |

儀表板收到 `sga/system/state` 時，規則、告警與 k 都以 Node-RED 為準，自己不再判斷；沒有 Node-RED（例如 `npm run demo` 的本機 broker）時才由儀表板判斷。

## QoS 與保留訊息

| 訊息 | QoS | retain | 為什麼 |
| --- | --- | --- | --- |
| 板子上行（counter、wifi、radar、status） | 0 | 否 | 每 2–5 秒就有新的一則，而且 `in`／`out`／`checkout` 是**累計值**：掉一則，下一則就補回來，不需要重送。PubSubClient 也只能用 QoS 0 發布。掉了多少看 `seq` |
| 遺言 `{"online":false}` | 1 | 否 | 斷線通知一定要送到 |
| 指令 `sga/{node}/cmd` | 1 | 否 | 儀表板以 QoS 1 發、板子以 QoS 1 訂閱；再加上 `ack` 確認有執行 |
| `sga/system/state`、`online`、`history` | 0／1 | 是 | 新打開的儀表板一連上就拿到最新狀態，不用等下一則 |

## 登入與權限

| 角色 | 誰 | 可以發布 | 可以訂閱 |
| --- | --- | --- | --- |
| `device` | ESP32（clientId 必須是 `esp32-<節點>`） | 只有自己的 `sga/<節點>/{counter,status,event,wifi,radar,ack}` | 只有自己的 `sga/<節點>/cmd` |
| `dashboard` | 網頁 | 只有 `sga/<節點>/cmd`（不能假造感測資料） | `sga/#` |
| `server` | Node-RED、工具 | 全部 | 全部 |

`tools/broker.js` 完整實作這張表（帳號在 `--users` 檔案，預設帳號只給課堂展示用）；違規的發布會被 broker 拒絕並把連線切掉。Node-RED 的 Aedes 節點只支援一組帳號密碼（`npm run connect -- --mqtt-user … --mqtt-pass …`），能擋掉沒有密碼的人，但沒有角色區分。

目前沒有加密：帳號密碼與資料在區網內是明文。正式部署請改用 TLS（MQTT 8883、WebSocket 用 `wss://`；Aedes 節點可以設定憑證），或把 broker 放在只有店內設備能連的獨立 Wi-Fi。

## 校正係數 k

```
k = 入口場內人數 ÷ 各區 Wi-Fi 裝置數總和        （限制在 0.2–1.2）
分區估計 = 雷達判斷無人 ? 0 : round(raw × k)
```

每分鐘自動以 `k = 0.7 × k + 0.3 × 新值` 微調；按入口的校正按鈕、Node-RED 的「立即校正」或儀表板的「立即校正」則直接採用新值。為什麼需要：一個人可能帶好幾支裝置、新手機會隨機化 MAC、ESP32 只聽得到一個頻道——原始數一定不準，但入口紅外線的人數是準的。
