// StoreGA 分區節點 zone-A ~ zone-D
// Wi-Fi 探針：監聽手機的 probe request，MAC 在板子上「加鹽 + SHA-256」後只留前 8 bytes，
//            60 秒內出現過的不同裝置數 = raw；原始 MAC 不儲存也不上傳。
// LD2410 毫米波雷達：判斷區內有沒有人、有沒有在動（雷達說沒人時 Node-RED 會把該區歸零）。
// MQTT 主題與格式見 docs/mqtt.md。邏輯在 storega_core.h（已在電腦上單元測試）。
//
// 需要的函式庫：PubSubClient、ArduinoJson 7.x
// 開發板：ESP32 Dev Module
//
// 注意：ESP32 只有一個射頻，連著店裡的 Wi-Fi 時只能聽「同一個頻道」的封包。
// 手機會輪流在各頻道發 probe，所以 60 秒視窗內大多聽得到；這也是需要用入口人數校正 k 的原因之一。
// 另外新款手機會隨機化 MAC，同一支手機可能被算成好幾支，一樣靠 k 修正。

#include <WiFi.h>
#include <esp_wifi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "storega_core.h"
#include "storega_net.h"

using namespace sga;

WiFiClient net;
PubSubClient mqtt(net);
Link link(mqtt);
DeviceSet<256> devices;
const char* STAFF[] = STAFF_HASHES;
#if HAS_RADAR
LD2410Parser radarParser;
RadarReading radar;
uint32_t lastRadarFrame = 0, lastRadarPub = 0;
bool lastPresence = false, lastMoving = false;
#endif
uint32_t blinkUntil = 0, lastWifiPub = 0, lastStatus = 0, lastMqttTry = 0, lastDebug = 0, learnUntil = 0;

const char* T_WIFI   = "sga/" NODE_ID "/wifi";
const char* T_RADAR  = "sga/" NODE_ID "/radar";
const char* T_STATUS = "sga/" NODE_ID "/status";
const char* T_CMD    = "sga/" NODE_ID "/cmd";
const char* T_ACK    = "sga/" NODE_ID "/ack";

/* ---------- promiscuous callback: runs in the Wi-Fi task, so it only copies into a ring buffer ---------- */
struct Seen { uint8_t mac[6]; int8_t rssi; };
volatile uint16_t ringHead = 0, ringTail = 0;
Seen ring[64];
portMUX_TYPE ringMux = portMUX_INITIALIZER_UNLOCKED;

void IRAM_ATTR onFrame(void* buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT) return;
  const wifi_promiscuous_pkt_t* pkt = (const wifi_promiscuous_pkt_t*)buf;
  if (!isProbeRequest(pkt->payload, pkt->rx_ctrl.sig_len)) return;
  portENTER_CRITICAL_ISR(&ringMux);
  uint16_t next = (ringHead + 1) % 64;
  if (next != ringTail) { memcpy(ring[ringHead].mac, frameSource(pkt->payload), 6); ring[ringHead].rssi = pkt->rx_ctrl.rssi; ringHead = next; }
  portEXIT_CRITICAL_ISR(&ringMux);
}
void drainRing(uint32_t now) {
  for (;;) {
    Seen s;
    portENTER_CRITICAL(&ringMux);
    if (ringTail == ringHead) { portEXIT_CRITICAL(&ringMux); return; }
    s = ring[ringTail]; ringTail = (ringTail + 1) % 64;
    portEXIT_CRITICAL(&ringMux);
    devices.see(s.mac, s.rssi, MIN_RSSI, HASH_SALT, now);   // hashing happens here, outside the Wi-Fi task
    if (learnUntil > now && s.rssi > -45) {                   // staff phone held right next to the board
      uint8_t h[8]; char hex[17]; hashMac(s.mac, HASH_SALT, h); hexHash(h, hex);
      Serial.printf("  員工手機候選：\"%s\"  (%d dBm)\n", hex, s.rssi);
    }
  }
}
void startSniffing() {
  wifi_promiscuous_filter_t f = {.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT};
  esp_wifi_set_promiscuous_filter(&f);
  esp_wifi_set_promiscuous_rx_cb(&onFrame);
  esp_wifi_set_promiscuous(true);
}

/* ---------- MQTT ---------- */
void publishStatus() {
  char j[256]; statusJson(j, sizeof j, WiFi.RSSI(), WiFi.localIP().toString().c_str(), FW_VERSION, millis() / 1000, ESP.getFreeHeap(), resetReason());
  link.publish(T_STATUS, j, sizeof j); lastStatus = millis();
}
void publishWifi(uint32_t now) {
  char j[96]; snprintf(j, sizeof j, "{\"raw\":%u}", (unsigned)devices.count(now, WINDOW_MS));
  link.publish(T_WIFI, j, sizeof j); lastWifiPub = now;
}
#if HAS_RADAR
void publishRadar(uint32_t now) {
  char j[160]; radarJson(j, sizeof j, radar); link.publish(T_RADAR, j, sizeof j);
  lastRadarPub = now; lastPresence = radar.presence; lastMoving = radar.moving;
}
#endif
void onMessage(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;
  const char* action = doc["action"] | "";
  const char* id = doc["id"] | "";
  if (!strcmp(action, "blink")) { blinkUntil = millis() + (uint32_t)(doc["seconds"] | 4) * 1000; link.ack(T_ACK, id, action, true); }
  else if (!strcmp(action, "reboot")) { link.ack(T_ACK, id, action, true); mqtt.loop(); delay(300); ESP.restart(); }
  else link.ack(T_ACK, id, action, false, "unknown action");
}
void ensureMqtt() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED || millis() - lastMqttTry < 3000) return;
  lastMqttTry = millis();
  if (link.connect("esp32-" NODE_ID, T_STATUS)) { mqtt.subscribe(T_CMD, 1); publishStatus(); }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_STATUS_LED, OUTPUT); pinMode(PIN_RADAR_OUT, INPUT);
  devices.setWhitelist(STAFF, sizeof STAFF / sizeof STAFF[0]);
#if HAS_RADAR
  Serial2.begin(256000, SERIAL_8N1, PIN_RADAR_RX, PIN_RADAR_TX);
#endif
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED && millis() < 20000) { digitalWrite(PIN_STATUS_LED, (millis() / 250) % 2); delay(50); }
  startSniffing();   // listens on the AP's channel while staying connected
  mqtt.setServer(MQTT_HOST, MQTT_PORT); mqtt.setBufferSize(512); mqtt.setCallback(onMessage);
  startWatchdog();   // after the Wi-Fi wait above, which may take 20 s
  Serial.printf("StoreGA %s v%s  channel %d  （上次重開：%s）\n", NODE_ID, FW_VERSION, WiFi.channel(), resetReason());
}

void loop() {
  feedWatchdog();
  uint32_t now = millis();
  drainRing(now);
#if HAS_RADAR
  while (Serial2.available()) if (radarParser.feed(Serial2.read(), radar)) lastRadarFrame = now;
  if (now - lastRadarFrame > 3000) { radar.presence = digitalRead(PIN_RADAR_OUT) == HIGH; radar.moving = false; }  // UART quiet: use the OUT pin
#endif
  digitalWrite(PIN_STATUS_LED, blinkUntil > now ? (now / 120) % 2 : mqtt.connected());

  ensureMqtt(); mqtt.loop(); handleOta("storega-" NODE_ID, nullptr);
  if (mqtt.connected()) {
    if (now - lastWifiPub > 5000) publishWifi(now);
    if (now - lastStatus > 5000) publishStatus();
#if HAS_RADAR
    bool changed = radar.presence != lastPresence || radar.moving != lastMoving;
    if ((changed && now - lastRadarPub > 300) || now - lastRadarPub > 2000) publishRadar(now);
#endif
  }
  // 序列埠輸入 l：30 秒內把員工手機貼近板子，印出它的雜湊，貼到 config.h 的 STAFF_HASHES
  if (Serial.available() && Serial.read() == 'l') { learnUntil = now + 30000; Serial.println("學習模式 30 秒：請把員工手機貼近板子並開關一次 Wi-Fi"); }
  if (now - lastDebug > 60000) { lastDebug = now; Serial.printf("[%s] 60 秒內裝置數 %u\n", NODE_ID, (unsigned)devices.count(now, WINDOW_MS)); }
}
