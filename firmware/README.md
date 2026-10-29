# ESP32 韌體

兩份 Arduino 程式，對應系統裡的兩種節點。MQTT 主題與格式見 [docs/mqtt.md](../docs/mqtt.md)。

| 資料夾 | 板子 | 做什麼 |
| --- | --- | --- |
| `entry_node/` | 入口 ×1（`entry-01`） | 紅外線進出計數、RFID 結帳、TM1637、WS2812、SG90 閘門、DHT11、校正按鈕 |
| `zone_node/` | 分區 ×4（`zone-A`～`zone-D`） | Wi-Fi 探針計數（MAC 雜湊）、LD2410 毫米波雷達 |
| `common/` | 共用 | `storega_core.h`：純邏輯，不呼叫任何 Arduino 函式，可以在電腦上測試；`storega_net.h`：MQTT 登入、訊息序號與時間戳、指令回覆、看門狗、OTA |

## 接線

### 入口節點 entry-01

| 元件 | 元件腳位 | ESP32 | 備註 |
| --- | --- | --- | --- |
| 紅外線 A（外側） | OUT | GPIO 32 | 被遮斷時輸出 LOW；VCC 5V、GND |
| 紅外線 B（內側） | OUT | GPIO 33 | 與 A 相距約 15 cm、離地約 1 m |
| RC522 RFID | SDA/SS · SCK · MOSI · MISO · RST | 5 · 18 · 23 · 19 · 27 | **3.3V**，不能接 5V |
| TM1637 四位數顯示 | CLK · DIO | 22 · 21 | 5V |
| WS2812 燈條（14 顆） | DIN | GPIO 4 | 5V，資料線串 330 Ω；燈條兩端並 1000 µF 電容 |
| SG90 伺服馬達 | 訊號（橘） | GPIO 13 | **用獨立 5V 電源**，GND 與 ESP32 共地 |
| DHT11 | DATA | GPIO 15 | 3.3V，DATA 接 10 kΩ 上拉 |
| 校正按鈕 | 一腳 | GPIO 26 | 另一腳接 GND（內部上拉） |
| 蜂鳴器（選用） | + | GPIO 25 | 進場、結帳、關閘時發出提示音 |

### 分區節點 zone-X

| 元件 | 元件腳位 | ESP32 | 備註 |
| --- | --- | --- | --- |
| HLK-LD2410 | TX → | GPIO 16（RX2） | 鮑率 256000 |
| | RX ← | GPIO 17（TX2） | |
| | OUT | GPIO 27 | 有人時 HIGH；UART 沒資料時的備援 |
| | VCC · GND | 5V · GND | |
| 板載 LED | — | GPIO 2 | 連上 MQTT 時恆亮；收到「閃燈」指令時快閃 |

C 區沒有裝雷達：`config.h` 設 `HAS_RADAR 0`，Node-RED 與儀表板會直接用 Wi-Fi × k。

## 安裝與燒錄

1. Arduino IDE 2 → 開發板管理員 → 安裝 **esp32 by Espressif Systems**，開發板選 **ESP32 Dev Module**。
2. 程式庫管理員安裝：
   - 兩種節點都要：`PubSubClient`（Nick O'Leary）、`ArduinoJson` 7.x
   - 只有入口要：`TM1637Display`（Avishay Orpaz）、`Adafruit NeoPixel`、`ESP32Servo`、`DHT sensor library` + `Adafruit Unified Sensor`、`MFRC522`
3. 在 `entry_node/`（或 `zone_node/`）把 `config.example.h` 複製成 `config.h`，填 Wi-Fi、Node-RED 電腦的 IP、節點名稱；broker 有設帳號密碼時填 `MQTT_USER`／`MQTT_PASS`，想用無線更新就設 `OTA_PASSWORD`。（儀表板「設定 → 韌體設定」可以直接產生這個檔案。）
4. 開啟 `entry_node/entry_node.ino` → 上傳。序列埠監控視窗設 115200。
5. 四顆分區節點用同一份 `zone_node.ino`，每次燒錄前改 `NODE_ID`（zone-A～D）與 `HAS_RADAR`。**每塊板子的 `NODE_ID` 不能重複**：同名的兩塊板子會互相把對方踢下 broker。
6. 之後更新韌體不用接線：Arduino IDE → 工具 → 連接埠，選 `storega-entry-01` 這類網路連接埠（要先設 `OTA_PASSWORD`、電腦與板子在同一個網路），輸入密碼後上傳。

## 設計重點

- **閘門由入口板子自己決定。** 自動模式下 `場內人數 < 上限` 才開；Wi-Fi 或 Node-RED 斷線時照樣限流。上限與模式存在 NVS，斷電重開不會遺失，今天的計數也每 30 秒存一次，午夜（NTP 校時後）自動歸零。
- **方向判斷**：先遮 A 再遮 B 是進場，反過來是離場；只遮 A 然後離開（或在關閉的閘門前等待）記為排隊。40 ms 去彈跳，站在光束裡不會重複計數。
- **平均停留時間**用 Little's law：`平均停留 = 場內人數對時間的積分 ÷ 進場人數`，不需要追蹤任何人。
- **隱私**：分區節點收到的 MAC 先做 `SHA-256(鹽 + MAC)`，只留前 8 bytes，60 秒沒再出現就丟掉；原始 MAC 不存也不傳。每間店用不同的鹽（`HASH_SALT`），雜湊無法反推，也無法跨店比對。
- **員工白名單**：序列埠輸入 `l` 進入 30 秒學習模式，把員工手機貼近板子，印出的雜湊貼到 `STAFF_HASHES`。
- **Wi-Fi 監聽的限制**：ESP32 連著店裡的 Wi-Fi 時只能聽同一個頻道；新款手機會隨機化 MAC。兩者都會讓原始數偏多或偏少，所以系統用入口紅外線的「標準答案」持續校正係數 k。
- **斷線偵測**：每塊板子連 MQTT 時設定遺言（last will）`{"online":false}`，斷電或斷網時 broker 會立刻通知 Node-RED 與儀表板。
- **登入**：`MQTT_USER` 有填就用帳號密碼連 broker；本機 broker（`tools/broker.js`）還會限制板子只能發自己的主題、不能發指令。
- **每則訊息都有 `seq` 與 `ts`**：`seq` 每送一則加一，收到的一方看到跳號就知道掉了幾則；`ts` 是 NTP 校時後的毫秒時間，用來算延遲。儀表板「裝置」頁的延遲與遺失率就是這樣算的。
- **指令回覆**：帶 `id` 的指令，板子執行後在 `sga/<節點>/ack` 回覆成功或拒絕（例如上限 500 超出 10–80 會被拒絕並附原因）。
- **看門狗**：`loop()` 超過 15 秒沒跑完（感測器卡住、死結）晶片會自己重開；下一次心跳的 `reset` 欄位會寫 `watchdog`，儀表板與日誌看得到。
- **人數漂移的修正**：紅外線偶爾漏算（兩人並肩、在門口來回），場內人數會慢慢偏掉。打烊時間 `CLOSE_HOUR` 過 30 分鐘，入口節點會把剩下的人數歸零並送出 `auto_zero` 事件；營業中也可以從儀表板送 `set_occupancy` 指令，輸入現場實際人數。

## 修改共用邏輯

`common/` 是唯一的來源；Arduino 只會編譯 sketch 資料夾裡的檔案，所以每個 sketch 裡放一份副本。改完 `common/*.h` 之後：

```bash
sh firmware/sync-common.sh
```

```bash
sh firmware/test/run.sh
```

第二個指令在電腦上（需要 g++ 或 clang++）跑 59 項邏輯測試（SHA-256、方向判斷、閘門與排隊、LD2410 封包解析、MAC 計數、JSON 格式、人數校正、序號時間戳、指令回覆），確認副本已同步，並用模擬的 Arduino 標頭檔對兩份 sketch 做語法檢查。

> 語法檢查用的是簡化過的 Arduino API，不能取代真正的 ESP32 編譯；第一次燒錄前請在 Arduino IDE 按一次「驗證」。

## 排錯

| 狀況 | 檢查 |
| --- | --- |
| 序列埠一直顯示連不上 MQTT | `MQTT_HOST` 是不是跑 Node-RED 那台電腦的 IP；防火牆是否開放 1883；broker 有設帳號密碼時 `MQTT_USER`／`MQTT_PASS` 是否正確 |
| 板子一直連上又斷、儀表板的遺失率很高 | 兩塊板子用了同一個 `NODE_ID`，broker 只允許一個，會輪流把對方踢掉 |
| 儀表板顯示「上次重開原因：看門狗」 | 某個感測器讀取卡住；看序列埠最後印出的內容，檢查那個模組的接線與電源 |
| 進出方向相反 | 對調 `PIN_IR_A` 與 `PIN_IR_B`，或把兩顆感測器位置互換 |
| 人數一直加不會減 | 內側感測器 B 沒接好或角度偏掉：用手遮 B，看序列埠／儀表板是否有反應 |
| 伺服馬達抖動、ESP32 重開 | SG90 不要吃 ESP32 的 5V，改用獨立電源並共地 |
| 雷達一直顯示無人 | LD2410 的 TX/RX 是否交叉接；鮑率必須是 256000 |
| Wi-Fi 數字很大 | 正常，Node-RED 會用 k 校正；也可調高 `MIN_RSSI`（例如 -70）只算近的裝置 |
