// 複製成 config.h 再填入你的網路設定（config.h 不會進 git）
#pragma once

#define WIFI_SSID      "your-wifi"
#define WIFI_PASSWORD  "your-password"
#define MQTT_HOST      "192.168.50.10"   // 跑 Node-RED 的電腦 IP
#define MQTT_PORT      1883
#define NODE_ID        "entry-01"
#define FW_VERSION     "1.4.2"

// 接腳（ESP32 DevKit V1）
#define PIN_IR_A       32   // 外側紅外線（被遮斷 = LOW）
#define PIN_IR_B       33   // 內側紅外線
#define PIN_RFID_SS    5    // RC522：SCK 18、MISO 19、MOSI 23
#define PIN_RFID_RST   27
#define PIN_TM_CLK     22
#define PIN_TM_DIO     21
#define PIN_LED        4    // WS2812 資料線
#define LED_COUNT      14
#define PIN_SERVO      13   // SG90 訊號線
#define PIN_DHT        15
#define PIN_BUTTON     26   // 校正按鈕，另一腳接 GND
#define PIN_BUZZER     25   // 選用；沒有蜂鳴器就留空接腳

#define SERVO_OPEN_DEG    90
#define SERVO_CLOSED_DEG  0
#define DEFAULT_CAPACITY  40
#define TZ_OFFSET_SEC     (8 * 3600)   // 台灣 UTC+8，用來在午夜歸零
