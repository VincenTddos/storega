#pragma once
#include "Arduino.h"
#define WIFI_STA 1
#define WL_CONNECTED 3
struct IPAddress { String toString() const { return String("0.0.0.0"); } };
struct WiFiClass { void mode(int) {} void setAutoReconnect(bool) {} void begin(const char*, const char*) {} int status() { return WL_CONNECTED; }
  int RSSI() { return -50; } IPAddress localIP() { return {}; } int channel() { return 1; } };
extern WiFiClass WiFi;
struct WiFiClient {};
