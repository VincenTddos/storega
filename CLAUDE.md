# StoreGA：給 Claude Code 的專案說明

學校物聯網期中專題，完整的 IoT 系統：ESP32 韌體 → MQTT → Node-RED（Aedes）→ 網頁儀表板。各部分的說明在各資料夾的 README。

## 跑起來

- 儀表板不需要建置：直接開 `dashboard/index.html`。第一次會問模式：**真實模式**（`S.real`，只顯示 MQTT 收到的資料，存在 localStorage）或**展示模式**（模擬器，不保存）。
- 本機真的 MQTT：`cd tools && npm install && npm run demo` → http://localhost:8080 → 真實模式 → `ws://localhost:8080`，帳號 `dashboard` 密碼 `storega-dashboard`（`tools/broker.js` 預設要登入並有角色權限，見 `docs/mqtt.md`）。
- 評審可能問的問題與答案在 `docs/review.md`；改了相關功能要一起更新。
- 真實模式不准出現假資料：沒收到的值顯示「—／尚未回報」，`YK()`、`yesterdayNow()`、`yOcc()`、`yHour()` 沒有紀錄時回傳 `null`，頁面要處理。
- 外部資源：Google Fonts、`unpkg.com/three@0.163.0`、`unpkg.com/mqtt@5.10.1`（需要網路）。
- 全部測試：`sh scripts/test-all.sh`（需要 Node 18+ 與 g++；tools 的測試要先 `npm install`）。

## 共同的協定

`docs/mqtt.md` 是唯一的協定說明。改任何一邊的訊息格式，四個地方要一起改並跑測試：
`firmware/common/storega_core.h`（JSON 產生）、`tools/fake-nodes.js`（模擬板子）、`node-red/functions/fusion.js`、`dashboard/assets/js/model.js` 的 `onMqtt()`。每則上行訊息都帶 `seq`/`ts`；板子負責的指令帶 `id`，要在 `sga/<node>/ack` 回覆。

## 儀表板（`dashboard/assets/js/`，依載入順序）

全部是 classic script（不是 ES module），刻意共用全域變數，這樣從 `file://` 打開也能動。

| 檔案 | 負責 |
| --- | --- |
| `util.js` | `$`、`$$`、時間格式、`store`（localStorage）、亂數、`download` |
| `model.js` | 模擬器、感測融合、k 校正、心跳、告警 `addAlert`、MQTT 橋接 `onMqtt`／`mqttCmd`、訊息紀錄 `logMsg`、模式 `startReal()`／`startDemo()`、每日保存與封存 `saveReal`／`restoreReal`／`archiveDay`、前一天的比較值、日誌 `slog()`、回放 `snap()`、匯出 |
| `ui.js` | 主題、提示框、toast、`popNum`／`morph`／`odo`（數字動態）、`beam`、`mxHTML`、`spark`、`chart`、分段控制、popover、指令面板、`chime`（告警聲） |
| `overview.js` 等 | 各頁的 `init*()` 與 `render*()`；`devices.js` 含 MQTT 主控台；`logs.js` 是日誌頁；`settings.js` 含門市資訊與韌體 config.h 產生器 |
| `twin.js` | three.js 3D 店面，第一次進「即時店況」才載入；顧客走 A* 網格 |
| `app.js` | 路由（`#page` 或 `#settings/sub`）、上方列、橫幅、模式選擇、門市資訊、快捷鍵、啟動與計時器 |

狀態都在全域 `S`（見 `freshState(real)`）。新的操作或系統事件請呼叫 `slog(分類, 等級, 訊息, 細節)` 寫進日誌。畫面每 0.8 秒重繪目前那一頁（分析、設定每 2.4 秒）。`dashboard/test/` 用 `vm` 載入 `util.js`＋`model.js` 測試，不需要瀏覽器。

## 韌體（`firmware/`）

- 純邏輯都在 `common/storega_core.h`（不呼叫 Arduino API）；`common/storega_net.h` 放兩種板子共用的網路程式（登入、`seq`/`ts`、指令回覆、看門狗、OTA）。**改 `common/` 之後要跑 `sh firmware/sync-common.sh`**，因為 Arduino 只編譯 sketch 資料夾內的檔案，每個 sketch 有一份副本；`firmware/test/run.sh` 會檢查副本是否同步。
- `firmware/test/mock/` 是簡化的 Arduino 標頭檔，只用來做語法檢查，不代表真實 API 的全部行為。
- `config.h` 不進 git；範本是 `config.example.h`，儀表板「設定 → 韌體設定」也能產生。

## Node-RED（`node-red/`）

function 節點的程式在 `functions/*.js`。改完要 `node node-red/build-flows.js` 重新產生 `flows.json` 並一起提交（`test-all.sh` 會檢查兩者同步）。

## 設計規範

改介面前先看 `design/spec.html`。重點：

- 顏色只用 `base.css` 的 token（`--bg`、`--raised`、`--ink`、`--accent`、`--zA…zD`），深色模式靠 `data-theme` 與 `prefers-color-scheme` 切換。
- 訊號橘 `--accent` 只用在「現在」與每頁最關鍵的一個動作。
- 文字：中文 Noto Sans TC、數字 Geist Mono、場內人數大數字 Doto。文案用動詞開頭、說清楚做了什麼，並提供「復原」。
- 等待：< 2 秒按鈕內跳點；2–3 秒 `mxHTML()` + 一句說明；> 3 秒再 `beam(el,'line'|'run')`。

## 介面測試方式

用 Playwright 開頁面，檢查 console 沒有錯誤、`document.documentElement.scrollWidth` 等於視窗寬度（日間、夜間、390px 手機都要）。無頭瀏覽器的 3D 建造動畫很慢，可用 `reducedMotion:'reduce'` 直接看建好的場景；有毛玻璃（backdrop-filter）的畫面在軟體 GPU 模式下截圖會很慢，互動測試用一般模式啟動 Chromium。
