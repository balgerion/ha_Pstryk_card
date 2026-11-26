const PSTRYK_FORMATTERS = new Map();
const PSTRYK_LABELS = new Map();
const PSTRYK_DAY_OFFSETS = new Map();

function pstrykFormatter(zone) {
  const key = zone || '';
  if (!PSTRYK_FORMATTERS.has(key)) {
    let formatter = null;
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      formatter = null;
    }
    PSTRYK_FORMATTERS.set(key, formatter);
  }
  return PSTRYK_FORMATTERS.get(key);
}

function pstrykParts(instant, zone) {
  const parts = pstrykFormatter(zone).formatToParts(new Date(instant));
  return Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
}

class PstrykCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._remainingHours = null;
    this._translations = null;
    this._isPolish = false;
    this._timer = null;
    this._slotCache = new WeakMap();
    this._drawnSlots = '';
    this._drawnHtml = null;
    this._drawnWidgets = { buy: null, sell: null };
    this._onVisible = () => {
      if (!document.hidden) this._tick();
    };
  }

  connectedCallback() {
    clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), 60000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisible);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisible);
  }

  _tick() {
    if (!this._hass || !this._showsWidget()) return;
    const sides = this._sides();
    const nodes = sides.map(side => this.shadowRoot.querySelector(`.widget-${side.name}`));
    if (nodes.some(node => !node) || this._slotKey(sides) !== this._drawnSlots) {
      this.render();
      return;
    }
    const widgets = this._widgets(sides);
    sides.forEach((side, index) => {
      if (widgets[side.name] === this._drawnWidgets[side.name]) return;
      nodes[index].innerHTML = widgets[side.name];
      this._drawnWidgets[side.name] = widgets[side.name];
      this._drawnHtml = null;
    });
  }

  _showsWidget() {
    return Boolean(this._config.show_widget) && this._config.show_widget !== 'none' && this._config.card_mode !== 'super_compact';
  }

  _sides() {
    const now = Date.now();
    return [['buy', this._config.buy_entity, 'buy_price'], ['sell', this._config.sell_entity, 'sell_price']].map(([name, entityId, label]) => {
      const entity = this._hass?.states?.[entityId];
      const slots = this._slots(entity);
      const index = this._currentIndex(slots, now);
      const color = entity ? this.getPriceColor(entity, entity.state, slots, index) : 'var(--primary-text-color)';
      return { name, label, entity, slots, index, color, now };
    });
  }

  _slotKey(sides) {
    return sides.map(side => side.index === -1 ? 'none' : String(side.slots[side.index].at)).join('|');
  }

  _escape(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, character => entities[character]);
  }

  _unit(entity) {
    return this._escape(entity?.attributes?.unit_of_measurement || 'PLN/kWh');
  }

  setConfig(config) {
    if (!config.buy_entity || !config.sell_entity) {
      throw new Error('You must define buy_entity and sell_entity');
    }
    
    const validModes = ['full', 'compact', 'super_compact'];
    if (config.card_mode && !validModes.includes(config.card_mode)) {
      throw new Error(`Invalid card_mode: ${config.card_mode}. Use: ${validModes.join(', ')}`);
    }
    
    const validWidgets = ['none', 'bars', 'sparkline'];
    if (config.show_widget && !validWidgets.includes(config.show_widget)) {
      throw new Error(`Invalid show_widget: ${config.show_widget}. Use: ${validWidgets.join(', ')}`);
    }
    
    const validEffects = ['none', 'pulse', 'fill'];
    if (config.widget_effect && !validEffects.includes(config.widget_effect)) {
      throw new Error(`Invalid widget_effect: ${config.widget_effect}. Use: ${validEffects.join(', ')}`);
    }
    
    this._config = this._applyModeDefaults(config);
    this._translations = null;
    if (this._hass) this.render();
  }

  _applyModeDefaults(config) {
    const mode = config.card_mode || 'full';

    const defaults = {
      card_mode: mode,
      title: 'Energy Prices',
      show_title: true,
      show_legend: true,
      attribute_config: 'next_hour',
      buy_attribute_config: null,
      sell_attribute_config: null,
      hover_effect: 'lift',
      show_widget: 'none',
      widget_hours: 24,
      widget_effect: 'none',
      show_price_status: false,
      alert_buy_above: null,
      alert_sell_below: null,
      click_action: 'none'
    };
    
    if (mode === 'compact') {
      defaults.show_legend = false;
      defaults.widget_hours = 12;
    }
    
    if (mode === 'super_compact') {
      defaults.show_title = false;
      defaults.show_legend = false;
      defaults.attribute_config = null;
      defaults.show_widget = 'none';
    }
    
    const merged = { ...defaults, ...config };
    const hours = Math.floor(Number(merged.widget_hours));
    merged.widget_hours = Number.isFinite(hours) && hours >= 1 ? Math.min(hours, 48) : defaults.widget_hours;
    return merged;
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    if (oldHass && this._config.buy_entity && this._config.sell_entity) {
      const oldBuy = oldHass.states[this._config.buy_entity];
      const oldSell = oldHass.states[this._config.sell_entity];
      const newBuy = hass.states[this._config.buy_entity];
      const newSell = hass.states[this._config.sell_entity];
      
      const sameSettings = oldHass.language === hass.language &&
        oldHass.locale?.language === hass.locale?.language &&
        oldHass.locale?.time_zone === hass.locale?.time_zone &&
        oldHass.config?.time_zone === hass.config?.time_zone;

      if (oldBuy === newBuy && oldSell === newSell && sameSettings) {
        return;
      }
      if (!sameSettings) {
        this._translations = null;
        this._slotCache = new WeakMap();
      }
    }

    this.render();
  }

  getCardSize() {
    switch(this._config.card_mode) {
      case 'super_compact':
        return 1;
      case 'compact':
        return this._config.show_widget !== 'none' ? 2 : 1;
      case 'full':
      default:
        return this._config.show_widget !== 'none' ? 3 : 2;
    }
  }

  static getStubConfig() {
    return {
      buy_entity: 'sensor.pstryk_current_buy_price',
      sell_entity: 'sensor.pstryk_current_sell_price',
      card_mode: 'full',
      show_widget: 'sparkline',
      widget_effect: 'pulse'
    };
  }

  _getTranslations() {
    if (!this._translations) {
      const language = this._hass?.locale?.language || this._hass?.language || navigator.language || '';
      const isPolish = String(language).toLowerCase().startsWith('pl');
      this._isPolish = isPolish;

      this._translations = {
        'buy_price': isPolish ? 'Cena Zakupu' : 'Buy Price',
        'sell_price': isPolish ? 'Cena Sprzedaży' : 'Sell Price',
        'best_prices': isPolish ? 'Najlepsze ceny' : 'Best prices',
        'normal_prices': isPolish ? 'Normalne ceny' : 'Normal prices',
        'worst_prices': isPolish ? 'Najgorsze ceny' : 'Worst prices',
        'next_hour': isPolish ? 'Następna godzina' : 'Next hour',
        'average_24': isPolish ? 'Średnia 24h' : 'Average 24h',
        'alert': isPolish ? 'Uwaga!' : 'Alert!',
        'cheap': isPolish ? 'Tanio' : 'Cheap',
        'expensive': isPolish ? 'Drogo' : 'Expensive',
        'cached_data': isPolish ? 'Dane z cache' : 'Cached data',
        'no_data': isPolish ? 'Brak danych' : 'No data',
        'entity_not_found': isPolish ? 'Nie znaleziono encji' : 'Entity not found'
      };
    }
    return this._translations;
  }

  translate(key) {
    return this._getTranslations()[key] || key;
  }

  checkAlert(type, value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return false;
    
    const threshold = type === 'buy' ? this._config.alert_buy_above : this._config.alert_sell_below;
    if (threshold === null || threshold === undefined || threshold === '') return false;
    const limit = Number(threshold);
    if (!isFinite(limit)) return false;
    return type === 'buy' ? numValue > limit : numValue < limit;
  }

  getPriceColor(entity, price, slots = this._slots(entity), index = this._currentIndex(slots, Date.now())) {
    if (!entity?.attributes) return 'var(--primary-text-color)';
    
    const currentPrice = parseFloat(price);
    if (isNaN(currentPrice)) return 'var(--primary-text-color)';
    
    const epsilon = 0.001;
    const zone = this._serverZone();
    const matches = (list) => {
      const entries = Array.isArray(list) ? list : [];
      const timed = entries.length > 0 && entries.every(p => p && typeof p === 'object' && p.start);
      if (timed && index !== -1) {
        return entries.some(p => this._instants(p.start, zone).includes(slots[index].at));
      }
      return entries.some(p => Math.abs((p && typeof p === 'object' ? p.price : p) - currentPrice) < epsilon);
    };

    if (matches(entity.attributes['Best prices'])) return '#4ade80';
    if (matches(entity.attributes['Worst prices'])) return '#f87171';
    return 'var(--primary-text-color)';
  }

  formatPrice(price, unit = 'PLN/kWh') {
    if (price === null || price === undefined || price === '') return '--';
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return '--';
    return `${numPrice.toFixed(2)} ${unit}`;
  }

  formatAttribute(value, unit) {
    if (typeof value === 'number') return this.formatPrice(value, unit);
    if (typeof value === 'string') {
      const text = value.trim();
      return /^-?\d+([.,]\d+)?$/.test(text) ? this.formatPrice(text.replace(',', '.'), unit) : this._escape(text);
    }
    if (typeof value === 'boolean') return String(value);
    return '--';
  }

  getAttributeValue(entity, config) {
    if (!entity?.attributes || !config) return null;
    
    switch(config) {
      case 'next_hour':
        return entity.attributes['Next hour'];
               
      case 'average_remaining':
        for (const [key, value] of Object.entries(entity.attributes)) {
          const match = key.match(/Average price today \/(\d+)/);
          if (match && match[1] !== '24') {
            this._remainingHours = match[1];
            return value;
          }
        }
        return null;
        
      case 'average_24':
        return entity.attributes['Average price today /24'];

      case 'sunset_sunrise':
        return entity.attributes['Average price today s/s'];

      default:
        return entity.attributes[config];
    }
  }

  getAttributeLabel(config) {
    switch(config) {
      case 'next_hour':
        return this.translate('next_hour');
        
      case 'average_remaining':
        this._getTranslations();
        const hours = this._remainingHours || 'X';
        return this._isPolish ? `Średnia ${hours}h` : `Average ${hours}h`;
        
      case 'average_24':
        return this.translate('average_24');

      case 'sunset_sunrise':
        this._getTranslations();
        return this._isPolish ? 'Średnia s/s' : 'Average s/s';

      default:
        return config;
    }
  }

  _serverZone() {
    const zone = this._hass?.config?.time_zone;
    return zone && pstrykFormatter(zone) ? zone : undefined;
  }

  _zoneOffset(instant, zone) {
    const p = pstrykParts(instant, zone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
  }

  _dayOffset(noon, zone) {
    const key = `${zone}|${noon}`;
    if (!PSTRYK_DAY_OFFSETS.has(key)) {
      if (PSTRYK_DAY_OFFSETS.size > 256) PSTRYK_DAY_OFFSETS.clear();
      const before = this._zoneOffset(noon - 86400000, zone);
      const after = this._zoneOffset(noon + 86400000, zone);
      PSTRYK_DAY_OFFSETS.set(key, before === after && Math.abs(before) <= 43200000 ? before : null);
    }
    return PSTRYK_DAY_OFFSETS.get(key);
  }

  _instants(start, zone) {
    const text = String(start);
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) return [new Date(text).getTime()].filter(isFinite);
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return [];
    if (!zone) return [new Date(text).getTime()].filter(isFinite);
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    const steady = this._dayOffset(Date.UTC(+m[1], +m[2] - 1, +m[3], 12), zone);
    if (steady !== null) return [wall - steady];
    const offsets = new Set([this._zoneOffset(wall - 86400000, zone), this._zoneOffset(wall + 86400000, zone)]);
    return [...offsets]
      .map(offset => wall - offset)
      .filter(instant => this._zoneOffset(instant, zone) === wall - instant)
      .sort((a, b) => a - b);
  }

  _hourLabel(instant, zone) {
    const key = `${zone || ''}|${instant}`;
    if (!PSTRYK_LABELS.has(key)) {
      if (PSTRYK_LABELS.size > 512) PSTRYK_LABELS.clear();
      const p = pstrykParts(instant, zone);
      PSTRYK_LABELS.set(key, `${p.hour}:${String(p.minute).padStart(2, '0')}`);
    }
    return PSTRYK_LABELS.get(key);
  }

  _slots(entity) {
    const allPrices = entity?.attributes?.['All prices'];
    if (!Array.isArray(allPrices)) return [];
    const serverZone = this._serverZone();
    const cached = this._slotCache.get(entity);
    if (cached && cached.zone === serverZone) return cached.slots;

    const seen = new Map();
    const slots = allPrices
      .map(item => {
        const key = String(item?.start);
        const instants = item?.start ? this._instants(item.start, serverZone) : [];
        const earlier = seen.get(key) || 0;
        seen.set(key, earlier + 1);
        return { price: parseFloat(item?.price), at: instants[Math.min(earlier, instants.length - 1)] ?? NaN };
      })
      .filter(item => isFinite(item.price) && isFinite(item.at))
      .sort((a, b) => a.at - b.at);
    this._slotCache.set(entity, { zone: serverZone, slots });
    return slots;
  }

  _slotLength(slots, index) {
    return (slots[index + 1]?.at ?? slots[index].at + 3600000) - slots[index].at;
  }

  _currentIndex(slots, now) {
    let currentIndex = -1;
    slots.forEach((slot, index) => {
      if (slot.at <= now) currentIndex = index;
    });
    if (currentIndex === -1) return -1;
    return now - slots[currentIndex].at < this._slotLength(slots, currentIndex) ? currentIndex : -1;
  }

  generateWidgetData(entity, slots = this._slots(entity), now = Date.now(), currentIndex = this._currentIndex(slots, now)) {
    const empty = { data: [], hours: [], dotPosition: 0 };
    if (currentIndex === -1) return empty;

    const displayZone = this._hass?.locale?.time_zone === 'server' ? this._serverZone() : undefined;
    const current = slots[currentIndex];
    const length = this._slotLength(slots, currentIndex);
    const futureData = slots.slice(currentIndex, currentIndex + this._config.widget_hours);

    return {
      data: futureData.map(d => d.price),
      hours: futureData.map(d => this._hourLabel(d.at, displayZone)),
      dotPosition: (now - current.at) / length
    };
  }

  _widgets(sides = this._sides()) {
    const widgets = { buy: '', sell: '' };
    if (!this._showsWidget()) return widgets;
    const draw = this._config.show_widget === 'sparkline' ? this.createSparkline : this.createBars;
    const height = this._getModeStyles().widget.height;
    for (const side of sides) {
      if (!side.entity) continue;
      const data = this.generateWidgetData(side.entity, side.slots, side.now, side.index);
      widgets[side.name] = data.data.length > 0 ?
        draw.call(this, data.data, data.hours, height, side.color, data.dotPosition, this._unit(side.entity)) :
        `
        <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 8px; text-align: center;">
          ${this.translate('no_data')} (${this.translate(side.label)})
        </div>
      `;
    }
    return widgets;
  }

  createSparkline(data, hours, height, color, dotPosition, unit = 'PLN/kWh') {
    if (!data || data.length < 1) return '';
    if (data.length === 1) {
      data = [data[0], data[0]];
      hours = [hours[0], hours[0]];
    }

    const displayMin = Math.min(...data, 0);
    const displayMax = Math.max(...data, 0);
    const range = displayMax - displayMin || 1;
    
    const viewBoxWidth = 200;
    const viewBoxHeight = 50;
    const paddingX = 5;
    const paddingY = 5;
    const chartWidth = viewBoxWidth - (paddingX * 2);
    const chartHeight = viewBoxHeight - (paddingY * 2);
    
    const zeroY = paddingY + chartHeight - ((0 - displayMin) / range) * chartHeight;
    
    const points = data.map((value, index) => {
      const x = paddingX + (index / (data.length - 1)) * chartWidth;
      const y = paddingY + chartHeight - ((value - displayMin) / range) * chartHeight;
      return `${x},${y}`;
    }).join(' ');
    
    const x1 = paddingX;
    const x2 = paddingX + (1 / (data.length - 1)) * chartWidth;
    const currentX = x1 + (x2 - x1) * dotPosition;

    const y1 = paddingY + chartHeight - ((data[0] - displayMin) / range) * chartHeight;
    const y2 = paddingY + chartHeight - ((data[1] - displayMin) / range) * chartHeight;
    const currentY = y1 + (y2 - y1) * dotPosition;

    let pulseEffect = '';
    if (this._config.widget_effect === 'pulse') {
      pulseEffect = `
        <circle cx="${currentX}" cy="${currentY}" r="8" fill="${color}" opacity="0.3">
          <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite"/>
        </circle>
      `;
    }

    const currentDot = `
      ${pulseEffect}
      <circle cx="${currentX}" cy="${currentY}" r="4" fill="${color}" opacity="1"/>
    `;
    
    const zeroLine = `
      <line
        x1="${paddingX}"
        y1="${zeroY}"
        x2="${paddingX + chartWidth}"
        y2="${zeroY}"
        stroke="#888888"
        stroke-width="1.5"
        stroke-dasharray="4,2"
        opacity="0.9"
      />
    `;

    const dataMin = Math.min(...data);
    const dataMax = Math.max(...data);
    const yFor = (v) => paddingY + chartHeight - ((v - displayMin) / range) * chartHeight;
    const maxLabelY = Math.max(yFor(dataMax) - 3, 8);
    const minLabelY = Math.min(yFor(dataMin) + 10, viewBoxHeight - 1);
    const minMaxLabels = `
      <text x="${paddingX}" y="${maxLabelY}" font-size="8" fill="#888888" opacity="0.9">${dataMax.toFixed(2)}</text>
      <text x="${paddingX}" y="${minLabelY}" font-size="8" fill="#888888" opacity="0.9">${dataMin.toFixed(2)}</text>
    `;

    const step = chartWidth / (data.length - 1);
    const hoverStrips = data.map((price, index) => {
      const left = Math.max(paddingX, paddingX + (index - 0.5) * step);
      const right = Math.min(paddingX + chartWidth, paddingX + (index + 0.5) * step);
      return `<rect x="${left}" y="0" width="${right - left}" height="${viewBoxHeight}" fill="transparent"><title>${hours[index]} - ${price.toFixed(2)} ${unit}</title></rect>`;
    }).join('');

    return `
      <svg viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet"
           style="width: 100%; height: ${height}px; display: block; margin-top: 8px;">
        ${zeroLine}
        ${minMaxLabels}
        <polyline
          points="${points}"
          fill="none"
          stroke="${color}"
          stroke-width="2"
          opacity="0.7"
          vector-effect="non-scaling-stroke"
        />
        ${currentDot}
        ${hoverStrips}
      </svg>
    `;
  }

  createBars(data, hours, height, color, dotPosition, unit = 'PLN/kWh') {
    if (!data || data.length < 1) return '';
    
    const viewBoxWidth = 200;
    const viewBoxHeight = 60;
    const paddingX = 5;
    const paddingY = 10;
    const chartWidth = viewBoxWidth - (paddingX * 2);
    const chartHeight = viewBoxHeight - (paddingY * 2);
    
    const min = Math.min(...data, 0);
    const max = Math.max(...data, 0);
    const range = max - min || 0.01;

    const zeroY = paddingY + chartHeight - ((0 - min) / range) * chartHeight;

    const columns = Math.max(data.length, 4);
    const barWidth = Math.max(chartWidth / columns * 0.8, 2);
    const barGap = chartWidth / columns * 0.2;
    const offset = Math.max((chartWidth - data.length * (barWidth + barGap) + barGap) / 2, 0);

    const bars = data.map((price, index) => {
      const x = paddingX + offset + index * (barWidth + barGap);
      let barHeight, y;
      
      if (price >= 0) {
        barHeight = (price / range) * chartHeight;
        y = zeroY - barHeight;
      } else {
        barHeight = ((0 - price) / range) * chartHeight;
        y = zeroY;
      }

      barHeight = Math.max(barHeight, 1);

      const tooltip = `<title>${hours[index]} - ${price.toFixed(2)} ${unit}</title>`;

      if (index === 0 && this._config.widget_effect === 'fill') {
        const filledHeight = barHeight * dotPosition;
        const filledY = price >= 0 ? y + (barHeight - filledHeight) : y;

        return `
          <g>
            ${tooltip}
            <rect
              class="bar"
              x="${x}"
              y="${y}"
              width="${barWidth}"
              height="${barHeight}"
              fill="${color}"
              opacity="0.3"
              rx="1"
            />
            <rect
              x="${x}"
              y="${filledY}"
              width="${barWidth}"
              height="${filledHeight}"
              fill="${color}"
              opacity="1"
              rx="1"
            />
            <text
              x="${x + barWidth / 2}"
              y="${price >= 0 ? y - 3 : Math.min(y + barHeight + 12, viewBoxHeight - 2)}"
              text-anchor="middle"
              font-size="9"
              fill="${color}"
              font-weight="bold"
            >
              ${hours[index]}
            </text>
          </g>
        `;
      }

      return `
        <rect
          class="bar"
          x="${x}"
          y="${y}"
          width="${barWidth}"
          height="${barHeight}"
          fill="${color}"
          opacity="0.3"
          rx="1"
        >${tooltip}</rect>
      `;
    }).join('');
    
    return `
      <svg viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" 
           style="width: 100%; height: ${height}px; display: block; margin-top: 8px;">
        ${bars}
      </svg>
    `;
  }

  handleClick(entityId) {
    if (this._config.click_action === 'more-info') {
      const event = new CustomEvent('hass-more-info', {
        detail: { entityId },
        bubbles: true,
        composed: true
      });
      this.dispatchEvent(event);
    }
  }

  getHoverEffect() {
    if (!this._config.hover_effect || this._config.hover_effect === 'none') return '';
    
    const effects = {
      'lift': `
        .price-box:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
      `,
      'glow': `
        .price-box:hover {
          box-shadow: 0 0 15px rgba(var(--rgb-primary-color), 0.5);
        }
      `,
      'shake': `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        .price-box:hover {
          animation: shake 0.3s ease-in-out;
        }
      `,
      'pulse': `
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .price-box:hover {
          animation: pulse 0.5s ease-in-out;
        }
      `
    };
    
    return effects[this._config.hover_effect] || '';
  }

  _getModeStyles() {
    const mode = this._config.card_mode;
    const isCompact = mode === 'compact';
    const isSuperCompact = mode === 'super_compact';
    
    return {
      card: {
        padding: isSuperCompact ? '8px' : (isCompact ? '12px' : '16px')
      },
      header: {
        fontSize: isCompact ? '18px' : '20px',
        marginBottom: isCompact ? '12px' : '16px'
      },
      container: {
        gap: isCompact ? '16px' : '24px'
      },
      priceBox: {
        padding: isCompact ? '12px' : '16px'
      },
      priceLabel: {
        fontSize: isCompact ? '12px' : '14px',
        marginBottom: isCompact ? '4px' : '8px'
      },
      priceValue: {
        fontSize: isCompact ? '20px' : '24px'
      },
      priceIcon: {
        width: isCompact ? '20px' : '24px',
        height: isCompact ? '20px' : '24px',
        marginBottom: isCompact ? '4px' : '8px'
      },
      attribute: {
        fontSize: isCompact ? '11px' : '12px',
        marginTop: isCompact ? '4px' : '8px',
        paddingTop: isCompact ? '4px' : '8px'
      },
      legend: {
        gap: isCompact ? '16px' : '24px',
        marginTop: isCompact ? '12px' : '16px',
        paddingTop: isCompact ? '12px' : '16px',
        fontSize: isCompact ? '11px' : '12px'
      },
      legendDot: {
        width: isCompact ? '10px' : '12px',
        height: isCompact ? '10px' : '12px'
      },
      widget: {
        height: isCompact ? 40 : 50
      }
    };
  }

  render() {
    if (!this._hass || !this._config) return;

    const buyEntity = this._hass.states[this._config.buy_entity];
    const sellEntity = this._hass.states[this._config.sell_entity];

    if (!buyEntity || !sellEntity) {
      this._drawnHtml = null;
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding: 16px;">
            <div style="color: var(--error-color);">
              ${this.translate('entity_not_found')}: ${this._escape(this._config.buy_entity)} / ${this._escape(this._config.sell_entity)}
            </div>
          </div>
        </ha-card>
      `;
      return;
    }

    const mode = this._config.card_mode;
    const isSuperCompact = mode === 'super_compact';
    const styles = this._getModeStyles();
    
    const buyPrice = buyEntity.state;
    const sellPrice = sellEntity.state;
    const buyUnit = this._unit(buyEntity);
    const sellUnit = this._unit(sellEntity);
    const buyAlert = this.checkAlert('buy', buyPrice);
    const sellAlert = this.checkAlert('sell', sellPrice);
    const sides = this._sides();
    const buyColor = sides[0].color;
    const sellColor = sides[1].color;
    
    this._remainingHours = null;

    const buyAttrConfig = this._config.buy_attribute_config || this._config.attribute_config;
    const sellAttrConfig = this._config.sell_attribute_config || this._config.attribute_config;
    const buyAttribute = buyAttrConfig ? this.getAttributeValue(buyEntity, buyAttrConfig) : null;
    const buyAttributeLabel = this.getAttributeLabel(buyAttrConfig);
    const sellAttribute = sellAttrConfig ? this.getAttributeValue(sellEntity, sellAttrConfig) : null;
    const sellAttributeLabel = this.getAttributeLabel(sellAttrConfig);

    const widgets = this._widgets(sides);
    const widgetHtml = (side) => this._showsWidget() ? `<div class="widget-${side}">${widgets[side]}</div>` : '';

    const statusBadge = (entity) => {
      if (!this._config.show_price_status || isSuperCompact) return '';
      if (entity.attributes['Is cheap'] === true) return `<div class="status-badge cheap">${this.translate('cheap')}</div>`;
      if (entity.attributes['Is expensive'] === true) return `<div class="status-badge expensive">${this.translate('expensive')}</div>`;
      return '';
    };

    const cachedBadge = (entity) => {
      if (isSuperCompact || entity.attributes['Using cached data'] !== true) return '';
      return `<div class="cached-badge" title="${this.translate('cached_data')}"><ha-icon icon="mdi:cloud-off-outline"></ha-icon></div>`;
    };

    const titleHtml = this._config.show_title && !isSuperCompact ?
      `<div class="header">${this._escape(this._config.title)}</div>` : '';
    
    const attributeHtml = (value, label, attrConfig, unit) => {
      if (isSuperCompact || !attrConfig || value === null || value === undefined) return '';
      return `
        <div class="attribute-info">
          ${this._escape(label)}: <span class="attribute-value">${this.formatAttribute(value, unit)}</span>
        </div>
      `;
    };
    
    const legendHtml = this._config.show_legend && mode === 'full' ? `
      <div class="legend">
        <div class="legend-item">
          <div class="legend-dot" style="background-color: #4ade80;"></div>
          <span>${this.translate('best_prices')}</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background-color: var(--primary-text-color);"></div>
          <span>${this.translate('normal_prices')}</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background-color: #f87171;"></div>
          <span>${this.translate('worst_prices')}</span>
        </div>
      </div>
    ` : '';

    const superCompactStyles = isSuperCompact ? `
      .prices-container {
        grid-template-columns: 1fr 1fr;
        gap: 8px !important;
      }
      .price-box {
        padding: 8px !important;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .price-content {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }
      .price-icon {
        margin: 0 !important;
        width: 16px !important;
        height: 16px !important;
      }
      .price-label {
        display: none;
      }
      .price-value {
        font-size: 16px !important;
        margin: 0 !important;
      }
    ` : '';

    const html = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          padding: ${styles.card.padding};
        }
        .header {
          font-size: ${styles.header.fontSize};
          font-weight: 500;
          margin-bottom: ${styles.header.marginBottom};
          color: var(--primary-text-color);
        }
        .prices-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: ${styles.container.gap};
        }
        .price-box {
          background-color: var(--card-background-color);
          border-radius: 8px;
          padding: ${styles.priceBox.padding};
          border: 1px solid var(--divider-color);
          text-align: center;
          transition: all 0.3s ease;
          cursor: ${this._config.click_action !== 'none' ? 'pointer' : 'default'};
          position: relative;
          overflow: hidden;
        }
        .price-label {
          font-size: ${styles.priceLabel.fontSize};
          color: var(--secondary-text-color);
          margin-bottom: ${styles.priceLabel.marginBottom};
        }
        .price-value {
          font-size: ${styles.priceValue.fontSize};
          font-weight: 500;
          margin-bottom: 4px;
          transition: color 0.3s ease;
        }
        .price-icon {
          width: ${styles.priceIcon.width};
          height: ${styles.priceIcon.height};
          margin: 0 auto ${styles.priceIcon.marginBottom};
          opacity: 0.8;
        }
        .attribute-info {
          font-size: ${styles.attribute.fontSize};
          color: var(--secondary-text-color);
          margin-top: ${styles.attribute.marginTop};
          padding-top: ${styles.attribute.paddingTop};
          border-top: 1px solid var(--divider-color);
        }
        .attribute-value {
          font-weight: 500;
        }
        .legend {
          display: flex;
          justify-content: center;
          gap: ${styles.legend.gap};
          margin-top: ${styles.legend.marginTop};
          padding-top: ${styles.legend.paddingTop};
          border-top: 1px solid var(--divider-color);
          font-size: ${styles.legend.fontSize};
          color: var(--secondary-text-color);
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legend-dot {
          width: ${styles.legendDot.width};
          height: ${styles.legendDot.height};
          border-radius: 50%;
        }
        .alert-badge {
          position: absolute;
          top: 4px;
          right: 4px;
          background-color: #ef4444;
          color: white;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 500;
        }
        .status-badge {
          position: absolute;
          top: 4px;
          left: 4px;
          color: white;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 500;
        }
        .status-badge.cheap {
          background-color: #22c55e;
        }
        .status-badge.expensive {
          background-color: #f97316;
        }
        .cached-badge {
          position: absolute;
          bottom: 4px;
          right: 4px;
          color: var(--secondary-text-color);
          opacity: 0.6;
          --mdc-icon-size: 14px;
        }
        .bar {
          transition: opacity 0.15s ease;
        }
        .bar:hover, g:hover .bar {
          opacity: 0.85;
        }
        @keyframes alertPulseBorder {
          0%, 100% { 
            border-color: var(--divider-color);
            box-shadow: none;
          }
          50% { 
            border-color: #ef4444;
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
          }
        }
        .alert {
          animation: alertPulseBorder 2s infinite;
        }
        ${this.getHoverEffect()}
        ${superCompactStyles}
      </style>
      
      <ha-card>
        ${titleHtml}
        
        <div class="prices-container">
          <div class="price-box ${buyAlert ? 'alert' : ''}">
            ${buyAlert && !isSuperCompact ? `<div class="alert-badge">${this.translate('alert')}</div>` : ''}
            ${statusBadge(buyEntity)}
            ${cachedBadge(buyEntity)}
            ${isSuperCompact ? `
              <div class="price-content">
                <div class="price-icon">
                  <ha-icon icon="mdi:transmission-tower-import" style="color: ${buyColor};"></ha-icon>
                </div>
                <div class="price-value" style="color: ${buyColor};">
                  ${this.formatPrice(buyPrice, buyUnit)}
                </div>
              </div>
            ` : `
              <div class="price-icon">
                <ha-icon icon="mdi:transmission-tower-import" style="color: ${buyColor};"></ha-icon>
              </div>
              <div class="price-label">${this.translate('buy_price')}</div>
              <div class="price-value" style="color: ${buyColor};">
                ${this.formatPrice(buyPrice, buyUnit)}
              </div>
              ${attributeHtml(buyAttribute, buyAttributeLabel, buyAttrConfig, buyUnit)}
              ${widgetHtml('buy')}
            `}
          </div>
          
          <div class="price-box ${sellAlert ? 'alert' : ''}">
            ${sellAlert && !isSuperCompact ? `<div class="alert-badge">${this.translate('alert')}</div>` : ''}
            ${statusBadge(sellEntity)}
            ${cachedBadge(sellEntity)}
            ${isSuperCompact ? `
              <div class="price-content">
                <div class="price-icon">
                  <ha-icon icon="mdi:transmission-tower-export" style="color: ${sellColor};"></ha-icon>
                </div>
                <div class="price-value" style="color: ${sellColor};">
                  ${this.formatPrice(sellPrice, sellUnit)}
                </div>
              </div>
            ` : `
              <div class="price-icon">
                <ha-icon icon="mdi:transmission-tower-export" style="color: ${sellColor};"></ha-icon>
              </div>
              <div class="price-label">${this.translate('sell_price')}</div>
              <div class="price-value" style="color: ${sellColor};">
                ${this.formatPrice(sellPrice, sellUnit)}
              </div>
              ${attributeHtml(sellAttribute, sellAttributeLabel, sellAttrConfig, sellUnit)}
              ${widgetHtml('sell')}
            `}
          </div>
        </div>
        
        ${legendHtml}
      </ha-card>
    `;

    this._drawnSlots = this._slotKey(sides);
    if (html === this._drawnHtml) return;
    this.shadowRoot.innerHTML = html;
    this._drawnHtml = html;
    this._drawnWidgets = { ...widgets };

    if (this._config.click_action !== 'none') {
      this.shadowRoot.querySelectorAll('.price-box').forEach((box, index) => {
        const entityId = index === 0 ? this._config.buy_entity : this._config.sell_entity;
        box.addEventListener('click', () => this.handleClick(entityId));
      });
    }
  }
}

customElements.define('pstryk-card', PstrykCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'pstryk-card',
  name: 'Pstryk Energy Card',
  description: 'Display energy prices with color coding, widgets (sparkline/bars), and alerts',
  preview: true,
  version: '4.3.1'
});
