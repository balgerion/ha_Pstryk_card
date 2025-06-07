# ha_Pstryk_card

Przykładowe konfiguracje ze wszystkimi opcjami:

Tryb FULL
```
type: custom:pstryk-card
buy_entity: sensor.pstryk_current_buy_price
sell_entity: sensor.pstryk_current_sell_price
card_mode: full
title: "Ceny Energii"
show_title: true
show_legend: true
attribute_config: average_remaining
hover_effect: lift     # none | lift | glow | shake | pulse
show_sparkline: true
sparkline_hours: 24
alert_buy_above: 0.90
alert_sell_below: 0.20
click_action: more-info
```
Tryb COMPACT
```
type: custom:pstryk-card
buy_entity: sensor.pstryk_current_buy_price
sell_entity: sensor.pstryk_current_sell_price
card_mode: compact
title: "Energy Prices"
show_title: true
show_legend: false
attribute_config: next_hour
hover_effect: glow     # none | lift | glow | shake | pulse
show_sparkline: true
sparkline_hours: 24
alert_buy_above: 0.85
alert_sell_below: 0.25
click_action: more-info
```
Tryb SUPER_COMPACT
```
type: custom:pstryk-card
buy_entity: sensor.pstryk_current_buy_price
sell_entity: sensor.pstryk_current_sell_price
card_mode: super_compact
hover_effect: none     # none | lift | glow | shake | pulse
alert_buy_above: 1.00
alert_sell_below: 0.10
click_action: more-info
```
