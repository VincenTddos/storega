#pragma once
#include <stdint.h>
typedef enum { WIFI_PKT_MGMT, WIFI_PKT_CTRL, WIFI_PKT_DATA, WIFI_PKT_MISC } wifi_promiscuous_pkt_type_t;
typedef struct { signed rssi : 8; unsigned sig_len : 12; } wifi_pkt_rx_ctrl_t;
typedef struct { wifi_pkt_rx_ctrl_t rx_ctrl; uint8_t payload[0]; } wifi_promiscuous_pkt_t;
typedef struct { uint32_t filter_mask; } wifi_promiscuous_filter_t;
#define WIFI_PROMIS_FILTER_MASK_MGMT 1
typedef void (*wifi_promiscuous_cb_t)(void* buf, wifi_promiscuous_pkt_type_t type);
inline int esp_wifi_set_promiscuous_filter(const wifi_promiscuous_filter_t*) { return 0; }
inline int esp_wifi_set_promiscuous_rx_cb(wifi_promiscuous_cb_t) { return 0; }
inline int esp_wifi_set_promiscuous(bool) { return 0; }
