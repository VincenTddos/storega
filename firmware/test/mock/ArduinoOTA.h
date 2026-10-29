#pragma once
#include <functional>
struct ArduinoOTAClass { void setHostname(const char*) {} void setPassword(const char*) {} void onStart(std::function<void()>) {} void begin() {} void handle() {} };
extern ArduinoOTAClass ArduinoOTA;
