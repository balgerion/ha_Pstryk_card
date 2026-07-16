# Pstryk Energy Card dla Home Assistant

![Version](https://img.shields.io/badge/version-4.2.0-blue.svg) ![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## Co potrafi?

* Trzy tryby wyświetlania: **pełny**, **kompaktowy**, **super kompaktowy**
* Widgety: słupki lub linia z cenami do końca doby
* Znacznik aktualnej godziny: pulsująca kropka (sparkline) lub wypełniający się słupek (bars)
* Obsługa cen ujemnych na wykresach (słupki w dół, linia zera)
* Alerty: pulsująca ramka i badge, gdy cena przekroczy ustalone progi
* Znacznik Tanio/Drogo prosto z API Pstryka (opcjonalny)
* Cena i godzina po najechaniu na wykres (słupki i linia)
* Etykiety min/max na wykresie liniowym
* Ikonka w rogu kafelka, gdy karta pokazuje dane z cache (awaria API)
* Zmiana koloru na czerwony/zielony w zależności od ustawień cen w integracji
* Dodatkowy wiersz z atrybutem: cena następnej godziny, średnia do końca doby lub średnia 24h
* Klik w kafelek otwiera okno more-info encji (opcjonalnie)
* Obsługa PL i EN – karta sama wykryje język
* Efekty i zbędne bajery

![{8ADD4FD9-6CE4-4984-B94C-3022E159F392}](https://github.com/user-attachments/assets/d27dab7a-0055-4e85-9b22-12e0a8c3f8cf)
![{55E1D715-4207-4254-A312-30519EF5FC50}](https://github.com/user-attachments/assets/9ca7fef7-1693-4b67-ba07-32cb5d36f38b)
![{4FC17EE9-74AA-4445-BF92-BE63CAB8F9BD}](https://github.com/user-attachments/assets/e65754ac-1a92-49d7-bd03-0af2f87a8117)

## Jak zainstalować?

**1. HACS (najprościej)**

1. Otwórz HACS → **+**
2. Wybierz **Custom repositories**
3. Wklej URL: `https://github.com/balgerion/ha_Pstryk_card`
4. W kategorii zaznacz **Dashboard** i kliknij **Add**
5. Zainstaluj **Pstryk Energy Card**
6. Zrestartuj Home Assistant

**2. Ręcznie**

1. Ściągnij plik `pstryk-card.js` i wrzuć do `/www/community/pstryk-card`
2. W Home Assistant: **Settings → Dashboards → Resources → Add Resource**

   * URL: `/local/community/pstryk-card/pstryk-card.js`
   * Typ: **JavaScript Module**
3. Zrestartuj

---

## Szybki start - przykłady

### Pełny

```yaml
type: custom:pstryk-card
buy_entity: sensor.pstryk_current_buy_price
sell_entity: sensor.pstryk_current_sell_price
card_mode: full                   # full | compact | super_compact
show_title: true                  # true | false
show_legend: true                 # true | false
show_widget: sparkline            # none | bars | sparkline
widget_effect: pulse              # none | pulse (sparkline) | fill (bars)
widget_hours: 24                  # 1-24
alert_buy_above: 1.15             # liczba lub null
alert_sell_below: 0.25            # liczba lub null
hover_effect: lift                # none | lift | glow | shake | pulse
click_action: none                # none | more-info
```
### Kompaktowy ze słupkami

```yaml
type: custom:pstryk-card
buy_entity: sensor.pstryk_current_buy_price
sell_entity: sensor.pstryk_current_sell_price
card_mode: compact                # full | compact | super_compact
show_widget: bars                 # none | bars | sparkline
widget_effect: fill               # none | fill (bars) | pulse (sparkline) 
widget_hours: 12                  # 1-24
hover_effect: glow                # none | lift | glow | shake | pulse
attribute_config: average_24      # next_hour | average_remaining | average_24 | null | custom_attribute
```

### Super kompaktowy (minimalny)

```yaml
type: custom:pstryk-card
buy_entity: sensor.pstryk_current_buy_price
sell_entity: sensor.pstryk_current_sell_price
card_mode: super_compact          # full | compact | super_compact
alert_buy_above: 1.0              # liczba lub null
alert_sell_below: 0.1             # liczba lub null
```

## Wszystkie opcje

* **buy\_entity** (`string`, wymagane) – encja z ceną zakupu (np. `sensor.pstryk_current_buy_price`)
* **sell\_entity** (`string`, wymagane) – encja z ceną sprzedaży
* **card\_mode** (`full`/`compact`/`super_compact`, domyślnie `full`) – wygląd karty
* **title** (`string`, domyślnie `Energy Prices`) – tekst nagłówka
* **show\_title** (`true`/`false`, domyślnie `true`) – wyświetl tytuł (w `super_compact` zawsze ukryty)
* **show\_legend** (`true`/`false`, domyślnie `true` w `full`) – legenda kolorów (tylko w `full`)
* **attribute\_config** (`next_hour`/`average_remaining`/`average_24`/nazwa atrybutu/`null`, domyślnie `next_hour`) – dodatkowy wiersz pod ceną: następna godzina, średnia do końca doby, średnia 24h albo dowolny atrybut encji; `null` wyłącza (w `super_compact` zawsze wyłączony)
* **show\_widget** (`none`/`bars`/`sparkline`, domyślnie `none`) – wykres cen do końca doby (w `super_compact` niedostępny)
* **widget\_hours** (`1-24`, domyślnie `24`, w `compact` `12`) – ile godzin pokazać na wykresie, licząc od bieżącej (maksymalnie do końca doby)
* **widget\_effect** (`none`/`pulse`/`fill`, domyślnie `none`) – znacznik aktualnej godziny: `pulse` = pulsująca kropka (sparkline), `fill` = wypełniający się słupek z etykietą godziny (bars)
* **show\_price\_status** (`true`/`false`, domyślnie `false`) – badge Tanio/Drogo w lewym górnym rogu kafelka wg flag `Is cheap`/`Is expensive` z API (w `super_compact` niedostępny)
* **alert\_buy\_above** (liczba lub `null`, domyślnie `null`) – alert (pulsująca ramka + badge), gdy cena zakupu przekroczy próg
* **alert\_sell\_below** (liczba lub `null`, domyślnie `null`) – alert, gdy cena sprzedaży spadnie poniżej progu
* **hover\_effect** (`none`/`lift`/`glow`/`shake`/`pulse`, domyślnie `lift`) – animacja kafelka po najechaniu myszką
* **click\_action** (`none`/`more-info`, domyślnie `none`) – kliknięcie kafelka otwiera okno more-info encji
