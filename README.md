# Pstryk Energy Card dla Home Assistant

![Version](https://img.shields.io/badge/version-4.3.1-blue.svg) ![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

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
* Obsługa PL i EN – karta bierze język z ustawień Home Assistanta, a dopiero gdy go brak, z przeglądarki
* Godziny na wykresie liczone w strefie czasowej serwera Home Assistanta, więc wykres pokazuje właściwą godzinę także wtedy, gdy oglądasz go z innej strefy; etykiety godzin idą za ustawieniem profilu użytkownika (strefa serwera albo lokalna)
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
widget_hours: 24                  # 1-48
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
widget_hours: 12                  # 1-48
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
* **attribute\_config** (`next_hour`/`average_remaining`/`average_24`/`sunset_sunrise`/nazwa atrybutu/`null`, domyślnie `next_hour`) – dodatkowy wiersz pod ceną: następna godzina, średnia do końca doby, średnia 24h, średnia wschód–zachód albo dowolny atrybut encji (liczba jest wypisywana jak cena, tekst bez zmian); `null` wyłącza (w `super_compact` zawsze wyłączony)
* **buy\_attribute\_config** / **sell\_attribute\_config** (te same wartości co `attribute_config`, domyślnie `null`) – osobny atrybut dla kafelka kupna/sprzedaży; nadpisuje wspólne `attribute_config`
* **show\_widget** (`none`/`bars`/`sparkline`, domyślnie `none`) – wykres cen do końca doby (w `super_compact` niedostępny)
* **widget\_hours** (`1-48`, domyślnie `24`, w `compact` `12`) – ile godzin pokazać na wykresie, licząc od bieżącej (tyle, ile jest na liście cen: do końca doby, a gdy integracja zna już ceny na jutro, także za północ); wartość spoza zakresu albo nieliczbowa daje wartość domyślną
* **widget\_effect** (`none`/`pulse`/`fill`, domyślnie `none`) – znacznik aktualnej godziny: `pulse` = pulsująca kropka (sparkline), `fill` = wypełniający się słupek z etykietą godziny (bars)
* **show\_price\_status** (`true`/`false`, domyślnie `false`) – badge Tanio/Drogo w lewym górnym rogu kafelka wg flag `Is cheap`/`Is expensive` z API (w `super_compact` niedostępny)
* **alert\_buy\_above** (liczba lub `null`, domyślnie `null`) – alert (pulsująca ramka + badge), gdy cena zakupu przekroczy próg; `0` jest zwykłym progiem
* **alert\_sell\_below** (liczba lub `null`, domyślnie `null`) – alert, gdy cena sprzedaży spadnie poniżej progu; `0` daje alert przy cenie ujemnej
* **hover\_effect** (`none`/`lift`/`glow`/`shake`/`pulse`, domyślnie `lift`) – animacja kafelka po najechaniu myszką
* **click\_action** (`none`/`more-info`, domyślnie `none`) – kliknięcie kafelka otwiera okno more-info encji

## Strefa czasowa

Integracja podaje godziny cen w czasie serwera Home Assistanta (`start` bez strefy, np. `2026-11-26T15:00:00`). Karta zamienia je na chwile w strefie serwera (`hass.config.time_zone`) i dopiero wtedy szuka bieżącej godziny, więc z przeglądarki w innej strefie widać te same słupki co w domu. Czas ze strefą (`+01:00`, `Z`) też jest obsługiwany. Etykiety godzin pokazują czas serwera, gdy w profilu użytkownika HA ustawiona jest strefa serwera, a czas przeglądarki, gdy lokalna. Gdy lista cen nie zawiera bieżącej godziny, widget pokazuje brak danych zamiast cen od północy.

Do wersji 4.3.0 bieżąca godzina była brana z zegara przeglądarki: o 15:49 czasu polskiego karta otwarta w Tokio pokazywała ceny od 23:00.

## Jak karta liczy

* Znacznik bieżącej godziny (wypełnienie słupka, kropka na linii) odświeża się co minutę, także gdy pulpit jest stale otwarty, a o pełnej godzinie wykres sam przechodzi na następną. Co minutę podmieniany jest tylko wykres; reszta karty zostaje, więc animacja alertu nie zaczyna się od nowa. Pulpit, który wraca z tła, odświeża wykres od razu.
* Karta zapisuje do strony tylko wtedy, gdy zmieniło się to, co pokazuje. Przeliczenie godzin na strefę serwera jest wykonywane raz na zmianę encji, a nie przy każdym rysowaniu.
* Zmiana języka albo strefy czasowej w profilu użytkownika jest widoczna od razu, bez czekania na zmianę ceny.
* W dniu zmiany czasu na zimowy powtórzona godzina 02:00 to dwa słupki, gdy lista cen ma 25 pozycji, a jedna cena dla obu godzin, gdy ma 24. Wiosną godzina, której nie ma, jest pomijana.
* Kolor ceny (zielony/czerwony) zależy od tego, czy **bieżąca godzina** jest na liście `Best prices` albo `Worst prices` encji, a nie od tego, czy cena jest równa którejś z tych list. Gdy listy zawierają same liczby (starsze wersje integracji), karta porównuje ceny jak dawniej.
* Jednostka przy cenie pochodzi z encji (`unit_of_measurement`); gdy encja jej nie podaje, karta pisze `PLN/kWh`.
* Jeden albo dwa ostatnie słupki doby zachowują szerokość słupka z czterech, a linia przy ostatniej godzinie doby jest pozioma, zamiast znikać.
* Tytuł i nazwy atrybutów z konfiguracji są wypisywane jako tekst, więc znaki `<` i `&` niczego nie psują.

## Testy

`node --test tests/` – logika widgetu w strefach Warszawa, Tokio, UTC i Nowy Jork oraz testy pozostałych funkcji karty. Wymaga tylko Node, bez instalowania pakietów.

## Zmiany w 4.3.1

* wykres pokazywał złe godziny w przeglądarce z inną strefą czasową niż serwer; lista cen bez bieżącej godziny dawała ceny od północy
* próg alertu równy `0` był ignorowany
* znacznik bieżącej godziny stał w miejscu na otwartym pulpicie
* kolor ceny wynikał z równej wartości, a nie z godziny
* język przeglądarki przebijał język ustawiony w Home Assistancie
* tytuł i nazwy atrybutów trafiały do HTML bez zabezpieczenia
* jednostka `PLN/kWh` była wpisana na stałe
* przy ostatniej godzinie doby linia znikała, a pojedynczy słupek zajmował całą szerokość
* zmiana konfiguracji, języka i strefy profilu była widoczna dopiero po zmianie ceny; „Buy”/„Sell” w komunikacie o braku danych nie były tłumaczone
* atrybut tekstowy w dodatkowym wierszu był wypisywany jak cena (`Last updated` jako `2026.00 PLN/kWh`); `widget_hours` spoza zakresu dawał „brak danych”
