// StoreGA 入口節點 entry-01
// 兩組紅外線判斷進出 → 場內人數；RFID 結帳；TM1637 顯示人數；WS2812 燈條顯示擁擠程度；
// SG90 閘門在自動模式下由板子自己決定（網路斷了也照樣限流）；DHT11 溫濕度。
// MQTT 主題與格式見 docs/mqtt.md。邏輯在 storega_core.h（已在電腦上單元測試）。
//
// 需要的函式庫（Arduino IDE → 程式庫管理員）：
//   PubSubClient (Nick O'Leary)、ArduinoJson 7.x (Benoit Blanchon)、TM1637Display (Avishay Orpaz)、
//   Adafruit NeoPixel、ESP32Servo (Kevin Harrington)、DHT sensor library + Adafruit Unified Sensor、MFRC522 (GithubCommunity)
// 開發板：ESP32 Dev Module（esp32 by Espressif 2.x 或 3.x）

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <SPI.h>
#include <MFRC522.h>
#include <TM1637Display.h>
#include <Adafruit_NeoPixel.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <time.h>
#include "config.h"
#include "storega_core.h"
#include "storega_net.h"

using namespace sga;

WiFiClient net;
PubSubClient mqtt(net);
Link link(mqtt);
Preferences prefs;
MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
TM1637Display tm(PIN_TM_CLK, PIN_TM_DIO);
Adafruit_NeoPixel strip(LED_COUNT, PIN_LED, NEO_GRB + NEO_KHZ800);
Servo gate;
DHT dht(PIN_DHT, DHT11);

DoorCounter door;
Store store;
DwellEstimator dwell;
CheckoutDebounce tap;
float temp = NAN, hum = NAN;
bool lastGateOpen = true, dirty = true;
uint32_t blinkUntil = 0, lastCounter = 0, lastStatus = 0, lastDht = 0, lastMqttTry = 0, lastSave = 0, buttonDown = 0;
int lastDay = -1, zeroDay = -1;
#ifndef CLOSE_HOUR
#define CLOSE_HOUR 22
#endif

const char* T_COUNTER = "sga/" NODE_ID "/counter";
const char* T_STATUS  = "sga/" NODE_ID "/status";
const char* T_EVENT   = "sga/" NODE_ID "/event";
const char* T_CMD     = "sga/" NODE_ID "/cmd";
const char* T_ACK     = "sga/" NODE_ID "/ack";

/* ---------- persistence: today's counters survive a reboot or power cut ---------- */
void saveState() {
  prefs.putUInt("in", store.in); prefs.putUInt("out", store.out); prefs.putUInt("co", store.checkout);
  prefs.putUShort("cap", store.capacity); prefs.putUChar("mode", (uint8_t)store.mode); prefs.putInt("day", lastDay);
}
void loadState() {
  store.in = prefs.getUInt("in", 0); store.out = prefs.getUInt("out", 0); store.checkout = prefs.getUInt("co", 0);
  store.capacity = prefs.getUShort("cap", DEFAULT_CAPACITY); store.mode = (GateMode)prefs.getUChar("mode", 0); lastDay = prefs.getInt("day", -1);
}

/* ---------- outputs ---------- */
uint8_t segFor(char c) {
  switch (c) {
    case 'F': return SEG_A | SEG_E | SEG_F | SEG_G;
    case 'U': return SEG_B | SEG_C | SEG_D | SEG_E | SEG_F;
    case 'L': return SEG_D | SEG_E | SEG_F;
    case ' ': return 0;
    default: return (c >= '0' && c <= '9') ? tm.encodeDigit(c - '0') : SEG_G;
  }
}
void drawDisplay(uint32_t now) {
  char txt[5]; displayText(txt, store.occupancy(), !store.gateOpen(), now);
  uint8_t segs[4]; for (int i = 0; i < 4; i++) segs[i] = segFor(txt[i]);
  tm.setSegments(segs);
}
void drawStrip(uint32_t now) {
  if (blinkUntil > now) {  // "閃燈" command: find this board on the shelf
    uint32_t c = (now / 160) % 2 ? strip.Color(255, 255, 255) : strip.Color(255, 149, 0);
    for (int i = 0; i < LED_COUNT; i++) strip.setPixelColor(i, c);
  } else {
    Bar b = ledBar(store.occupancy(), store.capacity, LED_COUNT);
    for (int i = 0; i < LED_COUNT; i++) strip.setPixelColor(i, i < b.lit ? strip.Color(b.color >> 16, (b.color >> 8) & 0xFF, b.color & 0xFF) : strip.Color(6, 6, 6));
  }
  strip.show();
}
void driveGate() {
  bool open = store.gateOpen();
  if (open != lastGateOpen) {
    gate.write(open ? SERVO_OPEN_DEG : SERVO_CLOSED_DEG);
    lastGateOpen = open; dirty = true;
    if (!open) tone(PIN_BUZZER, 2200, 120);
  }
}

/* ---------- MQTT ---------- */
void publishCounter() {
  char j[360]; counterJson(j, sizeof j, store, temp, hum, dwell.averageSec(store.in));
  link.publish(T_COUNTER, j, sizeof j); lastCounter = millis(); dirty = false;
}
void publishStatus() {
  char j[256]; statusJson(j, sizeof j, WiFi.RSSI(), WiFi.localIP().toString().c_str(), FW_VERSION, millis() / 1000, ESP.getFreeHeap(), resetReason());
  link.publish(T_STATUS, j, sizeof j); lastStatus = millis();
}
void onMessage(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;
  const char* action = doc["action"] | "";
  const char* id = doc["id"] | "";
  bool ok = true; const char* why = "";
  if (!strcmp(action, "gate")) { GateMode m; if (parseGateMode(doc["mode"] | "", m)) { store.mode = m; driveGate(); } else { ok = false; why = "mode must be auto/open/closed"; } }
  else if (!strcmp(action, "capacity")) { ok = store.setCapacity(doc["value"] | 0); if (!ok) why = "capacity must be 10-80"; }
  else if (!strcmp(action, "set_occupancy")) { ok = store.setOccupancy(doc["value"] | -1); if (!ok) why = "must be 0..today's entries"; }
  else if (!strcmp(action, "blink")) blinkUntil = millis() + (uint32_t)(doc["seconds"] | 4) * 1000;
  else if (!strcmp(action, "reboot")) { saveState(); link.ack(T_ACK, id, action, true); mqtt.loop(); delay(300); ESP.restart(); }
  else if (!strcmp(action, "reset_day")) { store.resetDay(); dwell.reset(); }
  else if (!strcmp(action, "threshold") || !strcmp(action, "calibrate")) return;  // Node-RED's business, not the board's
  else { ok = false; why = "unknown action"; }
  link.ack(T_ACK, id, action, ok, why);
  saveState(); dirty = true;  // echo the new mode/capacity so the dashboard shows what the board really uses
}
void ensureMqtt() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED || millis() - lastMqttTry < 3000) return;
  lastMqttTry = millis();
  // last will: the broker announces we are gone if power or Wi-Fi drops
  if (link.connect("esp32-" NODE_ID, T_STATUS)) {
    mqtt.subscribe(T_CMD, 1);
    publishStatus(); publishCounter();
  }
}

/* ---------- midnight reset and closing-time correction (both need NTP) ---------- */
void checkNewDay() {
  struct tm t; if (!getLocalTime(&t, 10)) return;
  if (lastDay != -1 && t.tm_yday != lastDay) { store.resetDay(); dwell.reset(); dirty = true; }
  if (t.tm_yday != lastDay) { lastDay = t.tm_yday; saveState(); }
  // 30 minutes after closing the shop is empty: whatever the beams missed today is written off here, and reported
  if (t.tm_hour * 60 + t.tm_min >= CLOSE_HOUR * 60 + 30 && zeroDay != t.tm_yday) {
    zeroDay = t.tm_yday; int was = store.occupancy();
    if (was > 0 && store.setOccupancy(0)) { char j[96]; snprintf(j, sizeof j, "{\"type\":\"auto_zero\",\"was\":%d}", was); if (mqtt.connected()) link.publish(T_EVENT, j, sizeof j); saveState(); dirty = true; }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_IR_A, INPUT_PULLUP); pinMode(PIN_IR_B, INPUT_PULLUP); pinMode(PIN_BUTTON, INPUT_PULLUP);
  prefs.begin("storega", false); loadState();
  tm.setBrightness(5); strip.begin(); strip.setBrightness(60);
  gate.setPeriodHertz(50); gate.attach(PIN_SERVO, 500, 2400); lastGateOpen = !store.gateOpen(); driveGate();
  SPI.begin(); rfid.PCD_Init(); dht.begin();
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(TZ_OFFSET_SEC, 0, "pool.ntp.org", "time.stdtime.gov.tw");
  mqtt.setServer(MQTT_HOST, MQTT_PORT); mqtt.setBufferSize(512); mqtt.setCallback(onMessage);
  startWatchdog();
  Serial.printf("StoreGA %s v%s  場內 %d / %d  （上次重開：%s）\n", NODE_ID, FW_VERSION, store.occupancy(), store.capacity, resetReason());
}

void loop() {
  feedWatchdog();
  uint32_t now = millis();
  // beams read LOW when broken
  DoorEvent ev = door.update(digitalRead(PIN_IR_A) == LOW, digitalRead(PIN_IR_B) == LOW, now);
  if (ev != DoorEvent::None) { store.apply(ev); dirty = true; if (ev == DoorEvent::In) tone(PIN_BUZZER, 1800, 30); }
  dwell.tick(store.occupancy(), now);

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    if (tap.accept(rfid.uid.uidByte, rfid.uid.size, now)) { store.checkout++; dirty = true; tone(PIN_BUZZER, 2600, 60); }
    rfid.PICC_HaltA();
  }
  // calibration button: hold 1 s, Node-RED recalculates k against the door count
  if (digitalRead(PIN_BUTTON) == LOW) { if (!buttonDown) buttonDown = now; }
  else if (buttonDown) { if (now - buttonDown > 1000 && mqtt.connected()) { char j[96] = "{\"type\":\"button\",\"action\":\"calibrate\"}"; link.publish(T_EVENT, j, sizeof j); } buttonDown = 0; }

  if (now - lastDht > 5000) { lastDht = now; float t = dht.readTemperature(), h = dht.readHumidity(); if (!isnan(t)) temp = t; if (!isnan(h)) hum = h; checkNewDay(); }

  driveGate(); drawDisplay(now); drawStrip(now);
  ensureMqtt(); mqtt.loop(); handleOta("storega-" NODE_ID, saveState);
  if (mqtt.connected()) {
    if (dirty && now - lastCounter > 250) publishCounter();   // changes go out at once (rate-limited)
    else if (now - lastCounter > 2000) publishCounter();      // otherwise every 2 s
    if (now - lastStatus > 5000) publishStatus();
  }
  if (now - lastSave > 30000) { lastSave = now; saveState(); }
}
