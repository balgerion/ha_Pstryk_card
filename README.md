# 🏠 Pstryk Energy Card dla Home Assistant

![Version](https://img.shields.io/badge/version-4.1.0-blue.svg) ![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## ✨ Co potrafi?

* 🎨 Trzy tryby wyświetlania: **pełny**, **kompaktowy**, **super kompaktowy**
* 📊 Widgety: słupki lub linia z animacją
* 🚨 Alerty: ostrzeżenia, gdy cena przekracza ustalone progi
* Zmiana koloru na czerwony/zielony w zależności od ustawień cen w integracji
* 🌍 Obsługa PL i EN – karta sama wykryje język
* 🎯 Efekty i zbędne bajery

## 📦 Jak zainstalować?

**1. HACS (najprościej)**

1. Otwórz HACS → **Frontend** → **+**
2. Wybierz **Custom repositories**
3. Wklej URL: `https://github.com/balgerion/ha_Pstryk_card`
4. W kategorii zaznacz **Lovelace** i kliknij **Add**
5. Zainstaluj **Pstryk Energy Card**
6. Zrestartuj Home Assistant

**2. Ręcznie**

1. Ściągnij plik `pstryk-card.js` i wrzuć do `/config/www/`
2. W Home Assistant: **Settings → Dashboards → Resources → Add Resource**

   * URL: `/local/pstryk-card.js`
   * Typ: **JavaScript Module**
3. Zrestartuj

---

## 🚀 Szybki start

Dodaj taką konfigurację do dashboardu:

```yaml
type: custom:pstryk-card
buy_entity: sensor.pstryk_current_buy_price
sell_entity: sensor.pstryk_current_sell_price
card_mode: full              # full | compact | super_compact
show_title: true             # true | false
show_widget: sparkline       # none | bars | sparkline
widget_hours: 24             # 1-48
hover_effect: lift           # none | lift | glow | shake | pulse
alert_buy_above: 1.15        # jeśli cena zakupu > 1.15
alert_sell_below: 0.25       # jeśli cena sprzedaży < 0.25
```

---

## ⚙️ Wszystkie opcje

* **buy\_entity** (`string`) – encja z ceną zakupu (np. `sensor.pstryk_current_buy_price`)
* **sell\_entity** (`string`) – encja z ceną sprzedaży
* **card\_mode** (`full`/`compact`/`super_compact`) – wybierz wygląd karty
* **title** (`string`) – tekst nagłówka (domyślnie "Energy Prices")
* **show\_title** (`true`/`false`) – wyświetl tytuł
* **show\_legend** (`true`/`false`) – legenda kolorów (tylko w `full`)
* **attribute\_config** (`next_hour`/`average_remaining`/`average_24`/`null`/`custom`) – dodatkowy atrybut
* **show\_widget** (`none`/`bars`/`sparkline`) – typ wykresu
* **widget\_effect** (`none`/`pulse`/`fill`) – animacja wykresu (pulse (sparkline), fill (bars))
