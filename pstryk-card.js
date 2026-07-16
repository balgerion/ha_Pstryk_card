class PstrykCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._remainingHours = null;
    this._translations = null;
    this._avgPriceRegex = null;
    this._refreshInterval = null;
  }

  connectedCallback() {
    this._startRefreshTimer();
  }

  disconnectedCallback() {
    this._stopRefreshTimer();
  }

  _startRefreshTimer() {
    this._stopRefreshTimer();
    
    if (this._config.show_widget !== 'none') {
      const now = new Date();
      const msToNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
      
      setTimeout(() => {
        this.render();
        this._refreshInterval = setInterval(() => {
          this.render();
        }, 3600000);
      }, msToNextHour);
    }
  }

  _stopRefreshTimer() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
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
    
    const cardMode = config.card_mode || 'full';
    
    this._config = this._applyModeDefaults({
      ...config,
      card_mode: cardMode
    });
  }

  _applyModeDefaults(config) {
    const mode = config.card_mode || 'full';
    
    const defaults = {
      title: 'Energy Prices',
      show_title: true,
      show_legend: true,
      attribute_config: 'next_hour',
      hover_effect: 'lift',
      show_widget: 'none',
      widget_hours: 24,
      widget_effect: 'none',
      alert_buy_above: null,
      alert_sell_below: null,
      click_action: 'none',
      debug: false
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
    
    return { ...defaults, ...config };
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    if (oldHass && this._config.buy_entity && this._config.sell_entity) {
      const oldBuy = oldHass.states[this._config.buy_entity];
      const oldSell = oldHass.states[this._config.sell_entity];
      const newBuy = hass.states[this._config.buy_entity];
      const newSell = hass.states[this._config.sell_entity];
      
      if (oldBuy === newBuy && oldSell === newSell) {
        return;
      }
    }
    
    if (oldHass && oldHass.language !== hass.language) {
      this._translations = null;
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
      const isPolish = this._hass?.language === 'pl' || 
                      (this._hass?.locale?.language === 'pl') ||
                      (navigator.language?.startsWith('pl'));
      
      this._translations = {
        'buy_price': isPolish ? 'Cena Zakupu' : 'Buy Price',
        'sell_price': isPolish ? 'Cena Sprzedaży' : 'Sell Price',
        'best_prices': isPolish ? 'Najlepsze ceny' : 'Best prices',
        'normal_prices': isPolish ? 'Normalne ceny' : 'Normal prices',
        'worst_prices': isPolish ? 'Najgorsze ceny' : 'Worst prices',
        'next_hour': isPolish ? 'Następna godzina' : 'Next hour',
        'average_24': isPolish ? 'Średnia 24h' : 'Average 24h',
        'alert': isPolish ? 'Uwaga!' : 'Alert!',
        'high_price': isPolish ? 'Wysoka cena' : 'High price',
        'low_price': isPolish ? 'Niska cena' : 'Low price',
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
    
    if (type === 'buy' && this._config.alert_buy_above) {
      return numValue > this._config.alert_buy_above;
    }
    if (type === 'sell' && this._config.alert_sell_below) {
      return numValue < this._config.alert_sell_below;
    }
    return false;
  }

  getPriceColor(entity, price, type) {
    if (!entity?.attributes) return 'var(--primary-text-color)';
    
    const currentPrice = parseFloat(price);
    if (isNaN(currentPrice)) return 'var(--primary-text-color)';
    
    const bestPrices = entity.attributes['Najlepsze ceny'] || 
                      entity.attributes['Best prices'] || 
                      entity.attributes['best_prices'] || [];
    const worstPrices = entity.attributes['Najgorsze ceny'] || 
                       entity.attributes['Worst prices'] || 
                       entity.attributes['worst_prices'] || [];
    
    const epsilon = 0.001;
    
    for (const priceData of bestPrices) {
      const checkPrice = typeof priceData === 'object' ? priceData.price : priceData;
      if (Math.abs(checkPrice - currentPrice) < epsilon) {
        return '#4ade80';
      }
    }
    
    for (const priceData of worstPrices) {
      const checkPrice = typeof priceData === 'object' ? priceData.price : priceData;
      if (Math.abs(checkPrice - currentPrice) < epsilon) {
        return '#f87171';
      }
    }
    
    return 'var(--primary-text-color)';
  }

  formatPrice(price) {
    if (price === null || price === undefined || price === '') return '--';
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return '--';
    return `${numPrice.toFixed(2)} PLN/kWh`;
  }

  getAttributeValue(entity, config) {
    if (!entity?.attributes || !config) return null;
    
    switch(config) {
      case 'next_hour':
        return entity.attributes['Next hour'];
               
      case 'average_remaining':
        if (!this._avgPriceRegex) {
          this._avgPriceRegex = /Average price today \/(\d+)/;
        }
        
        for (const [key, value] of Object.entries(entity.attributes)) {
          const match = key.match(this._avgPriceRegex);
          if (match && match[1] !== '24') {
            this._remainingHours = match[1];
            return value;
          }
        }
        return null;
        
      case 'average_24':
        return entity.attributes['Average price today /24'];
               
      default:
        return entity.attributes[config];
    }
  }

  getAttributeLabel(config) {
    switch(config) {
      case 'next_hour':
        return this.translate('next_hour');
        
      case 'average_remaining':
        const hours = this._remainingHours || 'X';
        const translations = this._getTranslations();
        const isPolish = translations['buy_price'] === 'Cena Zakupu';
        return isPolish ? `Średnia ${hours}h` : `Average ${hours}h`;
        
      case 'average_24':
        return this.translate('average_24');
        
      default:
        return config;
    }
  }

  generateWidgetData(entity, entityType) {
    if (!entity?.attributes) return { data: [], currentIndex: 0 };
    
    if (this._config.debug) {
      console.log(`[PstrykCard] ${entityType} generateWidgetData - attributes:`, entity.attributes);
    }
    
    let allPrices = entity.attributes['All prices'] || 
                   entity.attributes['all_prices'] || 
                   entity.attributes['prices'] ||
                   entity.attributes['hourly_prices'] ||
                   [];
    
    if (this._config.debug) {
      console.log(`[PstrykCard] ${entityType} raw prices data:`, allPrices);
      console.log(`[PstrykCard] ${entityType} raw data sample:`, allPrices.slice(0, 10).map((item, idx) => `${idx}: ${JSON.stringify(item)}`));
      if (entityType === 'sell') {
        console.log(`[PstrykCard] ${entityType} items 9-16:`, allPrices.slice(9, 17).map((item, idx) => `${idx+9}: ${JSON.stringify(item)}`));
      }
    }
    
    if (!Array.isArray(allPrices) || allPrices.length === 0) {
      if (this._config.debug) {
        console.warn(`[PstrykCard] No price data found for ${entityType}`);
      }
      return { data: [], currentIndex: 0 };
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentPrice = parseFloat(entity.state);
    
    if (this._config.debug) {
      console.log(`[PstrykCard] ${entityType} current: hour=${currentHour}, minutes=${currentMinutes}, price=${currentPrice}`);
    }
    
    const pricesWithTime = allPrices.map((item, index) => {
      let price, hour, startTime, rawValue;
      
      if (typeof item === 'object') {
        rawValue = item.price || item.value || item.val || item;
        if (typeof rawValue === 'object' && rawValue !== null) {
          rawValue = rawValue.price || rawValue.value || rawValue.val || 0;
        }
        price = parseFloat(rawValue);
        if (item.start_time) {
          startTime = new Date(item.start_time);
          hour = startTime.getHours();
        } else if (item.time) {
          startTime = new Date(item.time);
          hour = startTime.getHours();
        } else if (item.hour !== undefined) {
          hour = parseInt(item.hour);
        } else {
          hour = index % 24;
        }
      } else {
        rawValue = item;
        price = parseFloat(item);
        hour = index % 24;
      }
      
      return { price, hour, index, originalIndex: index, rawValue };
    }).filter(item => {
      const isValid = !isNaN(item.price) && isFinite(item.price) && item.rawValue !== null && item.rawValue !== undefined && item.rawValue !== '';
      
      if (this._config.debug && !isValid) {
        console.log(`[PstrykCard] ${entityType} filtered out:`, JSON.stringify(item.rawValue), 'at index', item.originalIndex, 'parsed as:', item.price);
      }
      
      return isValid;
    });
    
    if (this._config.debug) {
      console.log(`[PstrykCard] ${entityType} processed prices:`, pricesWithTime.map(p => `${p.hour}:00 = ${p.price}`));
    }
    
    if (this._config.debug && pricesWithTime.length > 1) {
      const hourSequence = pricesWithTime.slice(0, 5).map(p => p.hour);
      console.log(`[PstrykCard] ${entityType} first 5 hours sequence:`, hourSequence);
    }
    
    let currentIndex = -1;
    
    currentIndex = pricesWithTime.findIndex(item => item.hour === currentHour);
    
    if (currentIndex !== -1 && this._config.debug) {
      console.log(`[PstrykCard] ${entityType} found current hour ${currentHour} at index ${currentIndex}`);
    }
    
    if (currentIndex === -1) {
      const epsilon = 0.01;
      currentIndex = pricesWithTime.findIndex(item => Math.abs(item.price - currentPrice) < epsilon);
      
      if (currentIndex !== -1 && this._config.debug) {
        console.log(`[PstrykCard] ${entityType} found current by price match at index ${currentIndex}, hour: ${pricesWithTime[currentIndex].hour}`);
      }
    }
    
    if (currentIndex === -1 && pricesWithTime.length >= 24) {
      let minDiff = 24;
      pricesWithTime.forEach((item, idx) => {
        const diff = Math.abs(item.hour - currentHour);
        if (diff < minDiff) {
          minDiff = diff;
          currentIndex = idx;
        }
      });
      
      if (currentIndex !== -1 && this._config.debug) {
        console.log(`[PstrykCard] ${entityType} using closest hour at index ${currentIndex}, hour: ${pricesWithTime[currentIndex].hour}`);
      }
    }
    
    if (currentIndex === -1) {
      currentIndex = Math.floor(pricesWithTime.length / 2);
      if (this._config.debug) {
        console.warn(`[PstrykCard] ${entityType} could not find current hour, using middle at index ${currentIndex}`);
      }
    }
    
    const hoursToShow = Math.min(this._config.widget_hours || 24, pricesWithTime.length - currentIndex);
    const futureData = pricesWithTime.slice(currentIndex, currentIndex + hoursToShow);
    
    const dotPosition = currentMinutes / 60;
    
    if (this._config.debug) {
      console.log(`[PstrykCard] ${entityType} showing hours:`, futureData.map(d => `${d.hour}:00 = ${d.price}`).join(', '));
    }
    
    return { 
      data: futureData.map(d => d.price),
      hours: futureData.map(d => d.hour),
      currentIndex: 0,
      dotPosition: dotPosition
    };
  }

  createSparkline(data, hours, height, color, currentIndex, dotPosition, uniqueId) {
    if (!data || data.length < 2) return '';
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    
    const displayMin = Math.min(min, 0);
    const displayMax = Math.max(max, 0);
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
    
    let currentDot = '';
    let pulseEffect = '';
    
    if (currentIndex === 0 && data.length > 0) {
      const x1 = paddingX;
      const x2 = data.length > 1 ? paddingX + (1 / (data.length - 1)) * chartWidth : x1;
      const currentX = x1 + (x2 - x1) * dotPosition;
      
      const y1 = paddingY + chartHeight - ((data[0] - displayMin) / range) * chartHeight;
      const y2 = data.length > 1 ? paddingY + chartHeight - ((data[1] - displayMin) / range) * chartHeight : y1;
      const currentY = y1 + (y2 - y1) * dotPosition;
      
      if (this._config.widget_effect === 'pulse') {
        pulseEffect = `
          <circle cx="${currentX}" cy="${currentY}" r="8" fill="${color}" opacity="0.3">
            <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite"/>
          </circle>
        `;
      }
      
      currentDot = `
        ${pulseEffect}
        <circle cx="${currentX}" cy="${currentY}" r="4" fill="${color}" opacity="1"/>
      `;
    }
    
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
    
    if (this._config.debug) {
      console.log(`[PstrykCard] Sparkline ${uniqueId}: data=[${data.join(', ')}]`);
      console.log(`[PstrykCard] Sparkline ${uniqueId}: min=${min}, max=${max}, displayMin=${displayMin}, displayMax=${displayMax}, zeroY=${zeroY}`);
    }
    
    return `
      <svg viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" 
           style="width: 100%; height: ${height}px; display: block; margin-top: 8px;">
        ${zeroLine}
        <polyline
          points="${points}"
          fill="none"
          stroke="${color}"
          stroke-width="2"
          opacity="0.7"
          vector-effect="non-scaling-stroke"
        />
        ${currentDot}
      </svg>
    `;
  }

  createBars(data, hours, height, color, currentIndex, dotPosition, type) {
    if (!data || data.length < 1) return '';
    
    const viewBoxWidth = 200;
    const viewBoxHeight = 60;
    const paddingX = 5;
    const paddingY = 10;
    const chartWidth = viewBoxWidth - (paddingX * 2);
    const chartHeight = viewBoxHeight - (paddingY * 2);
    
    const prices = data;
    const min = Math.min(...prices, 0);
    const max = Math.max(...prices, 0);
    const range = max - min || 0.01;
    
    const zeroY = paddingY + chartHeight - ((0 - min) / range) * chartHeight;
    
    const barWidth = Math.max(chartWidth / data.length * 0.8, 2);
    const barGap = chartWidth / data.length * 0.2;
    
    if (this._config.debug) {
      console.log(`[PstrykCard] Bars ${type}: data=[${data.join(', ')}], min=${min}, max=${max}, zeroY=${zeroY}, chartHeight=${chartHeight}`);
    }
    
    const bars = data.map((price, index) => {
      const x = paddingX + index * (barWidth + barGap);
      let barHeight, y;
      
      if (price >= 0) {
        barHeight = ((price - 0) / range) * chartHeight;
        y = zeroY - barHeight;
      } else {
        barHeight = ((0 - price) / range) * chartHeight;
        y = zeroY;
      }
      
      barHeight = Math.max(Math.abs(barHeight), 1);
      
      let opacity = '0.3';
      
      if (index === 0 && this._config.widget_effect === 'fill') {
        opacity = '1';
        const filledHeight = barHeight * dotPosition;
        const unfilledHeight = barHeight - filledHeight;
        
        let filledY, filledBarHeight;
        if (price >= 0) {
          filledY = y + unfilledHeight;
          filledBarHeight = filledHeight;
        } else {
          filledY = y;
          filledBarHeight = filledHeight;
        }
        
        return `
          <rect
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
            height="${filledBarHeight}"
            fill="${color}"
            opacity="1"
            rx="1"
          />
          <text
            x="${x + barWidth / 2}"
            y="${price >= 0 ? y - 3 : y + barHeight + 12}"
            text-anchor="middle"
            font-size="9"
            fill="${color}"
            font-weight="bold"
          >
            ${hours[index]}:00
          </text>
        `;
      }
      
      if (index === 0 && this._config.widget_effect === 'fill') {
        return `
          <rect
            x="${x}"
            y="${y}"
            width="${barWidth}"
            height="${barHeight}"
            fill="${color}"
            opacity="${opacity}"
            rx="1"
          />
          <text
            x="${x + barWidth / 2}"
            y="${price >= 0 ? y - 3 : y + barHeight + 12}"
            text-anchor="middle"
            font-size="9"
            fill="${color}"
            font-weight="bold"
          >
            ${hours[index]}:00
          </text>
        `;
      }
      
      return `
        <rect
          x="${x}"
          y="${y}"
          width="${barWidth}"
          height="${barHeight}"
          fill="${color}"
          opacity="${opacity}"
          rx="1"
        />
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
    if (!this._config.click_action || this._config.click_action === 'none') return;
    
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
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding: 16px;">
            <div style="color: var(--error-color);">
              ${this.translate('entity_not_found')}: ${this._config.buy_entity} or ${this._config.sell_entity}
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
    const buyAlert = this.checkAlert('buy', buyPrice);
    const sellAlert = this.checkAlert('sell', sellPrice);
    const buyColor = this.getPriceColor(buyEntity, buyPrice, 'buy');
    const sellColor = this.getPriceColor(sellEntity, sellPrice, 'sell');
    
    this._remainingHours = null;
    
    const buyAttribute = this._config.attribute_config ? 
      this.getAttributeValue(buyEntity, this._config.attribute_config) : null;
    const sellAttribute = this._config.attribute_config ? 
      this.getAttributeValue(sellEntity, this._config.attribute_config) : null;
    const attributeLabel = this.getAttributeLabel(this._config.attribute_config);

    let buyWidgetHtml = '';
    let sellWidgetHtml = '';
    if (this._config.show_widget !== 'none' && !isSuperCompact) {
      const buyData = this.generateWidgetData(buyEntity, 'buy');
      const sellData = this.generateWidgetData(sellEntity, 'sell');
      
      if (this._config.debug) {
        console.log('[PstrykCard] Buy widget data:', buyData);
        console.log('[PstrykCard] Sell widget data:', sellData);
      }
      
      if (this._config.show_widget === 'sparkline') {
        if (buyData.data.length > 1) {
          buyWidgetHtml = this.createSparkline(
            buyData.data,
            buyData.hours,
            styles.widget.height,
            buyColor,
            buyData.currentIndex,
            buyData.dotPosition,
            'buy-sparkline'
          );
        }
        if (sellData.data.length > 1) {
          sellWidgetHtml = this.createSparkline(
            sellData.data,
            sellData.hours,
            styles.widget.height,
            sellColor,
            sellData.currentIndex,
            sellData.dotPosition,
            'sell-sparkline'
          );
        }
      } else if (this._config.show_widget === 'bars') {
        if (buyData.data.length > 0) {
          buyWidgetHtml = this.createBars(
            buyData.data,
            buyData.hours,
            styles.widget.height,
            buyColor,
            buyData.currentIndex,
            buyData.dotPosition,
            'buy'
          );
        } else {
          buyWidgetHtml = `
            <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 8px; text-align: center;">
              ${this.translate('no_data')} (Buy)
            </div>
          `;
        }
        
        if (sellData.data.length > 0) {
          sellWidgetHtml = this.createBars(
            sellData.data,
            sellData.hours,
            styles.widget.height,
            sellColor,
            sellData.currentIndex,
            sellData.dotPosition,
            'sell'
          );
        } else {
          sellWidgetHtml = `
            <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 8px; text-align: center;">
              ${this.translate('no_data')} (Sell)
            </div>
          `;
        }
      }
    }

    this._startRefreshTimer();

    const titleHtml = this._config.show_title && !isSuperCompact ? 
      `<div class="header">${this._config.title}</div>` : '';
    
    const attributeHtml = (value) => {
      if (isSuperCompact || !this._config.attribute_config || value === null) return '';
      return `
        <div class="attribute-info">
          ${attributeLabel}: <span class="attribute-value">${this.formatPrice(value)}</span>
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

    this.shadowRoot.innerHTML = `
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
            ${isSuperCompact ? `
              <div class="price-content">
                <div class="price-icon">
                  <ha-icon icon="mdi:transmission-tower-import" style="color: ${buyColor};"></ha-icon>
                </div>
                <div class="price-value" style="color: ${buyColor};">
                  ${this.formatPrice(buyPrice)}
                </div>
              </div>
            ` : `
              <div class="price-icon">
                <ha-icon icon="mdi:transmission-tower-import" style="color: ${buyColor};"></ha-icon>
              </div>
              <div class="price-label">${this.translate('buy_price')}</div>
              <div class="price-value" style="color: ${buyColor};">
                ${this.formatPrice(buyPrice)}
              </div>
              ${attributeHtml(buyAttribute)}
              ${buyWidgetHtml}
            `}
          </div>
          
          <div class="price-box ${sellAlert ? 'alert' : ''}">
            ${sellAlert && !isSuperCompact ? `<div class="alert-badge">${this.translate('alert')}</div>` : ''}
            ${isSuperCompact ? `
              <div class="price-content">
                <div class="price-icon">
                  <ha-icon icon="mdi:transmission-tower-export" style="color: ${sellColor};"></ha-icon>
                </div>
                <div class="price-value" style="color: ${sellColor};">
                  ${this.formatPrice(sellPrice)}
                </div>
              </div>
            ` : `
              <div class="price-icon">
                <ha-icon icon="mdi:transmission-tower-export" style="color: ${sellColor};"></ha-icon>
              </div>
              <div class="price-label">${this.translate('sell_price')}</div>
              <div class="price-value" style="color: ${sellColor};">
                ${this.formatPrice(sellPrice)}
              </div>
              ${attributeHtml(sellAttribute)}
              ${sellWidgetHtml}
            `}
          </div>
        </div>
        
        ${legendHtml}
      </ha-card>
    `;

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
  version: '4.1.0'
});
