# Node-RED flow

`flows.json` 是一份可以直接匯入的 flow，負責 StoreGA 的後端：

| 區塊 | 做什麼 |
| --- | --- |
| **Aedes broker** | MQTT broker：ESP32 連 `1883`，儀表板連 WebSocket `8080` |
| **感測融合與規則** | 收 `sga/+/+`；每區 `雷達無人 ? 0 : round(Wi-Fi × k)`；檢查上限 80%／100%、分區擁擠、溫度；發 `sga/system/state`（每秒、retain）與 `sga/system/alert` |
| **心跳檢查** | 每 5 秒；節點超過 15 秒沒訊息 → 嚴重告警；恢復時再發一次 |
| **自動校正 k** | 每分鐘 `k = 0.7k + 0.3 × 入口人數 ÷ Wi-Fi 總數`；「立即校正」按鈕直接採用並通知入口節點 |
| **整點紀錄** | 10:00–22:00 每小時整點附加一行到 `storega-log.csv` |
| **部署時下發上限** | 部署後 5 秒把人數上限送給 `entry-01` |

告警格式：`{ key, level: "crit"|"warn"|"info", title, detail, ts, source: "node-red" }`。

## 一鍵安裝（建議）

先啟動 Node-RED（終端機執行 `node-red`），再開另一個終端機：

```bash
cd tools && npm install && npm run connect
```

它會：確認 Node-RED 在 `http://localhost:1880` 執行 → 缺少時自動安裝 `node-red-contrib-aedes`（不用重開）→ 把 StoreGA 加成獨立分頁並部署（不動你其他分頁；原本已有 Aedes 或 1883 被占用時會先問你）→ 用 5 個模擬 ESP32 測試直到收到 `sga/system/state` → 印出儀表板要填的 `ws://…:8080`。重複執行只會更新 StoreGA 分頁。Node-RED 不在本機或不是 1880 埠時加 `-- --url http://IP:埠`。

## 手動安裝

1. Node-RED 3.x 或 4.x 都可以。選單 → **管理節點** → 安裝 `node-red-contrib-aedes`。
2. 選單 → **匯入** → 選 `node-red/flows.json` → **部署**。
3. 預設上限 40 人、擁擠門檻 14 人；要改的話在 Node-RED 的環境變數設 `STOREGA_CAPACITY`、`STOREGA_THRESHOLD`，或直接在儀表板的「設定」改（儀表板送出的指令 Node-RED 也會記住）。

> 如果你原本的 flow 已經有 Aedes 節點，只匯入其他節點即可，避免 1883 埠被開兩次。

### 讓 Node-RED 順便提供儀表板網頁（選用）

在 `~/.node-red/settings.js` 設定：

```js
httpStatic: '/絕對路徑/storega/dashboard',
```

重新啟動 Node-RED 後，打開 `http://<電腦 IP>:1880/` 就是儀表板，資料來源填 `ws://<電腦 IP>:8080`。

## 修改 flow 的程式

function 節點的程式放在 `functions/*.js`，比較好讀也能測試。改完執行：

```bash
node node-red/build-flows.js
```

```bash
node --test node-red/test/*.test.js
```

第一個指令重新產生 `flows.json`，第二個在不啟動 Node-RED 的情況下測試融合、心跳與校正邏輯。

## 沒有 ESP32 也能測

```bash
cd tools && npm install && node fake-nodes.js --url mqtt://localhost:1883 --scenario surge
```

5 個假節點會連到 Node-RED 的 Aedes，送出和真的板子一樣的訊息，也會回應儀表板送出的指令。
