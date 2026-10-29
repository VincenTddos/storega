# StoreGA · 實體門市人流分析與自動限流系統

物聯網期中專題。ESP32 收集店內人流 → MQTT → Node-RED（Aedes broker）融合與規則 → 網頁儀表板。
就像網站的 Google Analytics，StoreGA 讓實體店看得到：場內幾個人、大家在哪一區、逛多久、多少人結帳；人數到上限時入口自動關閘。

```
入口節點 entry-01（ESP32）                      分區節點 zone-A ~ zone-D（ESP32）
├ 紅外線 ×2：判斷進出方向 → 場內人數（標準答案）   ├ Wi-Fi 探針：MAC 加鹽 SHA-256 後計數
├ RFID RC522：結帳次數 → 轉換率                  └ HLK-LD2410 毫米波雷達：有沒有人、在不在動
├ TM1637 顯示人數、WS2812 燈條、SG90 閘門
└ DHT11 溫濕度、校正按鈕、蜂鳴器
              │ MQTT  sga/{node}/{counter|wifi|radar|status|event}
              ▼
Node-RED + Aedes ── 融合（雷達無人 ? 0 : Wi-Fi × k）、自動校正 k、心跳 15 秒、告警、整點 CSV
              │ MQTT over WebSocket :8080
              ▼
儀表板 ── 總覽、3D 即時店況、分析、事件、裝置（MQTT 主控台）、設定（產生韌體 config.h）
```

## 三種開法

**1. 只看介面（不需要任何東西）**：直接用瀏覽器打開 `dashboard/index.html`。預設是模擬器，依時段產生人流；右上角「模擬器」可以調速度與情境（人潮湧入、節點故障、Wi-Fi 雜訊）。需要網路載入字型與 three.js。

**2. 在電腦上跑真的 MQTT（不需要硬體）**：

```bash
cd tools && npm install && npm run demo
```

這會啟動本機 broker（`1883` + WebSocket `8080`）、在 http://localhost:8080 提供儀表板，並啟動 5 個模擬 ESP32 節點。打開網頁 → 設定 → 資料來源 → 輸入 `ws://localhost:8080` → 連線。

**3. 接上真的硬體**：

1. 啟動 Node-RED，再執行 `cd tools && npm install && npm run connect`：自動安裝 Aedes、匯入 flow、用模擬節點測試，最後印出儀表板要填的位址（手動步驟見 [node-red/README.md](node-red/README.md)）。
2. 儀表板「設定 → 韌體設定」填 Wi-Fi 與 Node-RED 電腦的 IP，下載每塊板子的 `config.h`。
3. 照 [firmware/README.md](firmware/README.md) 的接線表接線、燒錄 `entry_node` 與四顆 `zone_node`。
4. 儀表板「設定 → 資料來源」輸入 `ws://<Node-RED 電腦 IP>:8080` → 連線。

## 儀表板六頁

| 頁面 | 內容 |
| --- | --- |
| 總覽 | 場內人數、還能進幾人、近 15 分鐘進出、近 90 分鐘與昨天比較＋未來 30 分鐘預測、四區平面圖、4 個指標（15 分鐘一格的走勢，點了會跳到對應分析）、需要處理的事（可直接遠端重開機）與今天的告警分布、裝置健康 |
| 即時店況 | three.js 3D 店面（顧客走 A* 路徑不穿牆）、入口面板（TM1637／WS2812／閘門，長按 1.5 秒緊急關閘）、分區、感測紀錄、時間軸回放 |
| 分析 | 每小時人流（還沒到的時段顯示預測）、近 7 天、轉換漏斗、分區熱度矩陣、占比圓環、Wi-Fi 校正前後準確度；可列印成一頁式日報 |
| 事件 | 每小時事件分布（點一格只看那一小時）、告警依時段分組，篩選、搜尋、標為已處理、匯出 CSV |
| 裝置 | 5 顆 ESP32 的訊號與運行時間、節點事件紀錄、定位／閃燈／遠端重開機、**即時 MQTT 訊息主控台** |
| 設定 | 限流規則、Wi-Fi 校正流程、資料來源、通知與告警聲、**韌體設定（產生 config.h、員工白名單）**、外觀、資料匯出／清除 |

快捷鍵：`⌘K / Ctrl K` 指令面板、`1–6` 換頁、`T` 日夜模式、`Space` 暫停、`?` 快捷鍵說明、`Esc` 關閉／結束回放。

## 目錄

```
dashboard/        網頁儀表板（純 HTML/CSS/JS，不需要建置，file:// 也能開）
  assets/js/      util → model（模擬器＋MQTT）→ ui → 各頁 → twin（3D）→ app
  test/           資料模型測試（在 Node 裡載入，不需要瀏覽器）
firmware/         ESP32 Arduino 程式：entry_node、zone_node、common（可在電腦上測試的核心邏輯）
node-red/         flows.json 與它的 function 原始碼、測試
tools/            本機 MQTT broker、5 個模擬 ESP32 節點、一鍵 demo
docs/             mqtt.md（主題與格式）、demo.md（期中展示腳本）
design/spec.html  設計規範樣張：顏色、文字、按鈕、欄位、狀態、動態
legacy/           舊版單頁儀表板（參考用）
scripts/          test-all.sh：一次跑完所有測試
```

## 測試

```bash
sh scripts/test-all.sh
```

| 範圍 | 檢查內容 |
| --- | --- |
| 韌體 | 49 項：SHA-256 標準向量、進出方向狀態機、閘門與排隊、Little's law 停留時間、RFID 去重、LD2410 封包解析、MAC 雜湊計數與白名單、JSON 格式；兩份 sketch 用模擬 Arduino 標頭檔做語法檢查 |
| Node-RED | 7 項：融合、告警冷卻、指令同步、心跳離線／恢復、遺言、k 校正、flows.json 接線完整 |
| 儀表板 | 6 項：模擬一整天人數守恆且不超過上限、融合、校正、MQTT 對應、指令紀錄、CSV 跳脫 |
| 工具 | 4 項：模擬節點的人數守恆與 payload 格式、broker 端到端轉送指令 |

推到 GitHub 時 `.github/workflows/test.yml` 會自動跑一遍。

> 韌體的 Arduino 部分（接腳、函式庫呼叫）只做了語法檢查，第一次燒錄前請在 Arduino IDE 按「驗證」。

## 設計原則（摘要）

- 米白底、墨黑字，**訊號橘**只留給「現在」與每頁最關鍵的動作；四個分區固定顏色（A 藍、B 紫、C 青、D 綠）。
- 數字用等寬字，大數字用點陣字（Doto），中文用 Noto Sans TC。
- 等待的階梯：< 2 秒按鈕內跳點；2–3 秒加點陣載入與一句說明；> 3 秒再在工作中的元件邊緣點亮光束。
- 會影響現場的動作（緊急關閘）長按 1.5 秒；不可逆的動作（清除資料）要輸入門市名稱。
- 隱私：MAC 只在板子上停留到雜湊完成，雲端與儀表板都看不到原始 MAC。
