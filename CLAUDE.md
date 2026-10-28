# StoreGA：給 Claude Code 的專案說明

學校物聯網期中專題：ESP32（紅外線、RFID、Wi-Fi 探針、LD2410 雷達）→ MQTT → Node-RED（Aedes）→ 網頁儀表板。這個 repo 目前是儀表板與設計規範；ESP32 韌體與 Node-RED flow 不在這裡。

## 跑起來

- 不需要建置。直接開 `dashboard/index.html`，或 `npx serve dashboard`。
- 預設是模擬器，不需要硬體。設定 → 資料來源可以連 `ws://…` 的 Aedes WebSocket。
- 外部資源：Google Fonts、`unpkg.com/three@0.163.0`、`unpkg.com/mqtt@5.10.1`（需要網路）。

## 程式結構（`dashboard/assets/js/`，依載入順序）

全部是 classic script（不是 ES module），刻意共用全域變數，這樣從 `file://` 打開也能動。

| 檔案 | 負責 |
| --- | --- |
| `util.js` | `$`、`$$`、時間格式、`store`（localStorage）、亂數 |
| `model.js` | 模擬器、感測融合、k 校正、心跳、告警 `addAlert`、MQTT 橋接、回放 `snap()` |
| `ui.js` | 主題、提示框、toast、`popNum`／`morph`／`odo`（數字動態）、`beam`（光束）、`mxHTML`（點陣載入）、`spark`、`chart`、分段控制、popover、指令面板 |
| `overview.js` 等 | 各頁的 `init*()` 與 `render*()` |
| `twin.js` | three.js 3D 店面，第一次進「即時店況」才載入；顧客走 A* 網格 |
| `app.js` | 路由（`#page` 或 `#settings/sub`）、上方列、快捷鍵、啟動與計時器 |

狀態都在全域 `S`（見 `freshState()`）。畫面每 0.8 秒重繪目前那一頁（分析、設定每 2.4 秒）。

## 設計規範

改介面前先看 `design/spec.html`。重點：

- 顏色只用 `base.css` 的 token（`--bg`、`--raised`、`--ink`、`--accent`、`--zA…zD`），深色模式靠 `data-theme` 與 `prefers-color-scheme` 切換。
- 訊號橘 `--accent` 只用在「現在」與每頁最關鍵的一個動作。
- 文字：中文 Noto Sans TC、數字 Geist Mono、場內人數大數字 Doto。文案用動詞開頭、說清楚做了什麼，並提供「復原」。
- 等待：< 2 秒按鈕內跳點；2–3 秒 `mxHTML()` + 一句說明；> 3 秒再 `beam(el,'line'|'run')`。

## 測試方式

用 Playwright 開頁面，檢查 console 沒有錯誤、`document.documentElement.scrollWidth` 等於視窗寬度（日間、夜間、390px 手機都要）。無頭瀏覽器的 3D 建造動畫很慢，可用 `reducedMotion:'reduce'` 直接看建好的場景。
