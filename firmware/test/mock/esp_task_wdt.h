#pragma once
// mock of the ESP-IDF 4.x task watchdog API (Arduino core 2.x); core 3.x uses esp_task_wdt_config_t
inline int esp_task_wdt_init(uint32_t, bool) { return 0; }
inline int esp_task_wdt_add(void*) { return 0; }
inline int esp_task_wdt_delete(void*) { return 0; }
inline int esp_task_wdt_reset() { return 0; }
