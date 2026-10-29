// 複製成 config.h 再填入（config.h 不會進 git）。四顆分區節點用同一份程式，只改 NODE_ID 與 HAS_RADAR。
#pragma once

#define WIFI_SSID      "your-wifi"
#define WIFI_PASSWORD  "your-password"
#define MQTT_HOST      "192.168.50.10"
#define MQTT_PORT      1883
#define NODE_ID        "zone-A"          // zone-A / zone-B / zone-C / zone-D
#define FW_VERSION     "1.3.8"
#define HAS_RADAR      1                  // C 區沒有裝 LD2410 就設 0

// Wi-Fi 監聽
#define HASH_SALT      "change-me-per-store"   // 每間店換一組，MAC 雜湊後無法反推，也無法跨店比對
#define MIN_RSSI       (-75)                   // 比這更弱的訊號視為區域外
#define WINDOW_MS      60000                   // 60 秒內沒再出現就不算
// 員工手機：先用序列埠印出的雜湊（前 16 碼），貼到這裡就不會被算成顧客
#define STAFF_HASHES   { "0000000000000000" }

// 接腳
#define PIN_RADAR_RX   16   // ESP32 RX ← LD2410 TX
#define PIN_RADAR_TX   17   // ESP32 TX → LD2410 RX
#define PIN_RADAR_OUT  27   // LD2410 OUT（有人 = HIGH），UART 沒資料時的備援
#define PIN_STATUS_LED 2    // 板載 LED：閃燈指令、連線狀態
