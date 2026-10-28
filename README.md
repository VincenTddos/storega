# StoreGA · 實體門市人流分析與自動限流系統

物聯網期中專題。用 ESP32 收集店內人流，經 MQTT 送到 Node-RED（內建 Aedes broker），在網頁儀表板上看到像 Google Analytics 一樣的「實體店 GA」：場內人數、分區熱度、轉換率、停留時間，並在人數到上限時自動關閘限流。

## 系統架構

```
入口節點 entry-01（ESP32）                    分區節點 zone-A ~ zone-D（ESP32）
├ 紅外線 ×2：判斷進出方向，算場內人數（標準答案）  ├ Wi-Fi 探針：MAC 加鹽 SHA-256 後計數
├ RFID：結帳次數 → 轉換率                      └ HLK-LD2410 毫米波雷達：有人／移動
├ TM1637 七段顯示器、WS2812 燈條、SG90 閘門
└ DHT11 溫濕度、校正按鈕
            │ MQTT  sga/{node}/{counter|wifi|radar|status}
            ▼
Node-RED + Aedes（WebSocket）── 融合、校正係數 k、心跳離線判斷、告警、限流
            │ MQTT over WebSocket
            ▼
dashboard/（這個 repo）── 六頁網頁儀表板，沒有硬體時自動用模擬器
```

## 怎麼打開

**最快：直接用瀏覽器打開** `dashboard/index.html`（需要網路，用來載入字型、three.js 與 mqtt.js）。

如果瀏覽器擋住本機檔案，改用任一個簡單伺服器：

```bash
npx serve dashboard
```

```bash
python3 -m http.server 5500 -d dashboard
```

第一個指令會印出網址（通常是 http://localhost:3000），第二個則打開 http://localhost:5500 。

預設是**模擬器**模式，不需要任何硬體：依時段產生人流（午餐與下班兩波尖峰），右上角的「模擬器」按鈕可以切換速度（1× / 10× / 60×）與情境（人潮湧入、節點故障、Wi-Fi 雜訊）。

### 接上真正的 Node-RED

1. Node-RED 的 Aedes broker 節點打開 **WebSocket**（例如埠 8080）。
2. 儀表板 → 設定 → 資料來源 → 輸入 `ws://<Node-RED 電腦 IP>:8080` → 連線。
3. 主題格式見 [docs/mqtt.md](docs/mqtt.md)。

## 六個頁面

| 頁面 | 內容 |
| --- | --- |
| 總覽 | 場內人數大數字、近 90 分鐘 vs 昨天、四區平面圖、4 個 KPI、需要處理的事、裝置健康 |
| 即時店況 | three.js 3D 店面（顧客走 A* 路徑不穿牆）、入口面板（TM1637／WS2812／閘門）、分區、感測紀錄、時間軸回放 |
| 分析 | 每小時人流、近 7 天、轉換漏斗、分區熱度矩陣、占比圓環、Wi-Fi 校正前後準確度 |
| 事件 | 所有告警依時段分組，可篩選、搜尋、標為已處理 |
| 裝置 | 5 顆 ESP32 的訊號、運行時間；定位、閃燈、遠端重開機 |
| 設定 | 限流規則、Wi-Fi 校正、資料來源、通知、外觀、匯出／清除資料 |

快捷鍵：`⌘K / Ctrl K` 指令面板、`1–6` 切換頁面、`T` 日夜模式、`Space` 暫停、`Esc` 關閉／結束回放；即時店況頁 `H` 熱度圖、`L` 標籤、`R` 重設視角。

## 目錄

```
dashboard/            網頁儀表板（不需要建置，純 HTML/CSS/JS）
  index.html          六頁的結構
  assets/css/base.css 設計系統：色彩、字型、按鈕、欄位等元件
  assets/css/app.css  版面與各頁樣式
  assets/js/          util → model（模擬器＋MQTT）→ ui → 各頁 → twin（3D）→ app（路由與啟動）
design/spec.html      設計規範樣張（顏色、文字、按鈕、欄位、狀態、動態…），所有頁面照這份做
docs/mqtt.md          MQTT 主題與 JSON 格式
legacy/               舊版單頁儀表板（參考用）
```

## 設計原則（摘要）

- 米白底、墨黑字，**訊號橘**只留給「現在」：即時數字、主要動作。四個分區固定顏色（A 藍、B 紫、C 青、D 綠），每頁一致。
- 數字用等寬字，大數字用點陣字（Doto），中文用 Noto Sans TC。
- 等待的階梯：< 2 秒只在按鈕內跳點；2–3 秒加點陣載入與一句說明；> 3 秒再在工作中的元件邊緣點亮光束。
- 會影響現場的動作（緊急關閘）用長按 1.5 秒確認；不可逆的動作（清除資料）要輸入門市名稱。
- 支援日間／夜間模式、鍵盤操作、減少動態設定。
