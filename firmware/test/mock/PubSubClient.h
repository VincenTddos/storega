#pragma once
#include "WiFi.h"
#include <functional>
struct PubSubClient { explicit PubSubClient(WiFiClient&) {}
  void setServer(const char*, uint16_t) {} bool setBufferSize(uint16_t) { return true; } void setCallback(std::function<void(char*, uint8_t*, unsigned int)>) {}
  bool connect(const char*) { return true; } bool connect(const char*, const char*, uint8_t, bool, const char*) { return true; }
  bool connect(const char*, const char*, const char*, const char*, uint8_t, bool, const char*) { return true; }
  bool connected() { return true; } bool loop() { return true; } bool publish(const char*, const char*) { return true; } bool subscribe(const char*, uint8_t = 0) { return true; } };
