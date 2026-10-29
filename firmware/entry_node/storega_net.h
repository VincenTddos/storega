// StoreGA · the network side both sketches share: MQTT login, stamped publishing, command acks, watchdog, OTA.
// Uses Arduino/ESP32 APIs, so it is only syntax-checked against firmware/test/mock; the pure logic stays in storega_core.h.
#pragma once
#include <WiFi.h>
#include <PubSubClient.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <sys/time.h>
#ifdef OTA_PASSWORD
#include <ArduinoOTA.h>
#endif
#include "storega_core.h"

#ifndef MQTT_USER
#define MQTT_USER ""
#endif
#ifndef MQTT_PASS
#define MQTT_PASS ""
#endif
#ifndef WDT_SEC
#define WDT_SEC 15
#endif

namespace sga {

class Link {
 public:
  explicit Link(PubSubClient& m) : mqtt_(m) {}
  /* ms since 1970 once NTP has set the clock, else 0 (the receiver then skips the latency sample) */
  static uint64_t nowMs() {
    struct timeval tv; gettimeofday(&tv, nullptr);
    return tv.tv_sec > 1600000000 ? (uint64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000 : 0;
  }
  /* every message gets seq + ts, so the receiver can count losses and measure latency */
  bool publish(const char* topic, char* json, size_t cap) {
    if (stampJson(json, cap, ++seq_, nowMs()) < 0) return false;
    return mqtt_.publish(topic, json);
  }
  /* log in when MQTT_USER is set; the last will lets the broker announce us when power or Wi-Fi drops */
  bool connect(const char* clientId, const char* willTopic) {
    if (*MQTT_USER) return mqtt_.connect(clientId, MQTT_USER, MQTT_PASS, willTopic, 1, false, "{\"online\":false}");
    return mqtt_.connect(clientId, willTopic, 1, false, "{\"online\":false}");
  }
  /* commands that carry an "id" get an answer on sga/<node>/ack: arrived, applied or refused (and why) */
  void ack(const char* topic, const char* id, const char* action, bool ok, const char* reason = "") {
    if (!id || !*id) return;
    char j[200]; ackJson(j, sizeof j, id, action, ok, reason); publish(topic, j, sizeof j);
  }
 private:
  PubSubClient& mqtt_;
  uint32_t seq_ = 0;
};

/* task watchdog: if loop() stops running for WDT_SEC (a stuck sensor read, a deadlock), the chip restarts itself
   and the next status message says "reset":"watchdog" */
inline void startWatchdog() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t c = {}; c.timeout_ms = WDT_SEC * 1000; c.idle_core_mask = 0; c.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&c) != ESP_OK) esp_task_wdt_init(&c);
#else
  esp_task_wdt_init(WDT_SEC, true);
#endif
  esp_task_wdt_add(NULL);
}
inline void feedWatchdog() { esp_task_wdt_reset(); }
inline const char* resetReason() { return resetReasonName((int)esp_reset_reason()); }

/* over-the-air updates once Wi-Fi is up: Arduino IDE → 工具 → 連接埠 → storega-<node>（needs OTA_PASSWORD in config.h） */
inline void handleOta(const char* host, void (*beforeUpdate)()) {
#ifdef OTA_PASSWORD
  static bool started = false;
  if (!started && WiFi.status() == WL_CONNECTED) {
    ArduinoOTA.setHostname(host); ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([beforeUpdate]() { if (beforeUpdate) beforeUpdate(); esp_task_wdt_delete(NULL); });  // an upload takes longer than the watchdog
    ArduinoOTA.begin(); started = true;
  }
  if (started) ArduinoOTA.handle();
#else
  (void)host; (void)beforeUpdate;
#endif
}

}  // namespace sga
