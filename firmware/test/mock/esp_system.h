#pragma once
// mock: reset reason as in ESP-IDF (1 = power on)
typedef int esp_reset_reason_t;
inline esp_reset_reason_t esp_reset_reason() { return 1; }
#define ESP_OK 0
