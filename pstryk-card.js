class PstrykCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._remainingHours = null;
    this._translations = null;
    this._isPolish = false;
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
  }

  _applyModeDefaults(config) {
    const mode = config.card_mode || 'full';

    const defaults = {
      card_mode: mode,
      title: 'Energy Prices',
      show_title: true,
      show_legend: true,
      attribute_config: 'next_hour',
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
    
    if (type === 'buy' && this._config.alert_buy_above) {
      return numValue > this._config.alert_buy_above;
    }
    if (type === 'sell' && this._config.alert_sell_below) {
      return numValue < this._config.alert_sell_below;
    }
    return false;
  }

  getPriceColor(entity, price) {
    if (!entity?.attributes) return 'var(--primary-text-color)';
    
    const currentPrice = parseFloat(price);
    if (isNaN(currentPrice)) return 'var(--primary-text-color)';
    
    const epsilon = 0.001;
    const matches = (list) => (list || []).some(p => Math.abs((typeof p === 'object' ? p.price : p) - currentPrice) < epsilon);

    if (matches(entity.attributes['Best prices'])) return '#4ade80';
    if (matches(entity.attributes['Worst prices'])) return '#f87171';
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
        
      default:
        return config;
    }
  }

  generateWidgetData(entity) {
    const allPrices = entity?.attributes?.['All prices'];
    if (!Array.isArray(allPrices) || allPrices.length === 0) {
      return { data: [], hours: [], dotPosition: 0 };
    }

    const now = new Date();
    const pricesWithTime = allPrices
      .map(item => ({
        price: parseFloat(item?.price),
        hour: item?.start ? new Date(item.start).getHours() : NaN
      }))
      .filter(item => isFinite(item.price) && isFinite(item.hour));

    let currentIndex = pricesWithTime.findIndex(item => item.hour === now.getHours());
    if (currentIndex === -1) currentIndex = 0;

    const hoursToShow = Math.min(this._config.widget_hours || 24, pricesWithTime.length - currentIndex);
    const futureData = pricesWithTime.slice(currentIndex, currentIndex + hoursToShow);

    return {
      data: futureData.map(d => d.price),
      hours: futureData.map(d => d.hour),
      dotPosition: now.getMinutes() / 60
    };
  }

  createSparkline(data, hours, height, color, dotPosition) {
    if (!data || data.length < 2) return '';
    
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
    const maxLabelY = Math.max(yFor(dataMax) - 2, 6);
    const minLabelY = Math.min(yFor(dataMin) + 7, viewBoxHeight - 1);
    const minMaxLabels = `
      <text x="${paddingX}" y="${maxLabelY}" font-size="6" fill="#888888" opacity="0.9">${dataMax.toFixed(2)}</text>
      <text x="${paddingX}" y="${minLabelY}" font-size="6" fill="#888888" opacity="0.9">${dataMin.toFixed(2)}</text>
    `;

    const step = chartWidth / (data.length - 1);
    const hoverStrips = data.map((price, index) => {
      const left = Math.max(paddingX, paddingX + (index - 0.5) * step);
      const right = Math.min(paddingX + chartWidth, paddingX + (index + 0.5) * step);
      return `<rect x="${left}" y="0" width="${right - left}" height="${viewBoxHeight}" fill="transparent"><title>${hours[index]}:00 - ${price.toFixed(2)} PLN/kWh</title></rect>`;
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

  createBars(data, hours, height, color, dotPosition) {
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

    const barWidth = Math.max(chartWidth / data.length * 0.8, 2);
    const barGap = chartWidth / data.length * 0.2;

    const bars = data.map((price, index) => {
      const x = paddingX + index * (barWidth + barGap);
      let barHeight, y;
      
      if (price >= 0) {
        barHeight = (price / range) * chartHeight;
        y = zeroY - barHeight;
      } else {
        barHeight = ((0 - price) / range) * chartHeight;
        y = zeroY;
      }

      barHeight = Math.max(barHeight, 1);

      const tooltip = `<title>${hours[index]}:00 - ${price.toFixed(2)} PLN/kWh</title>`;

      if (index === 0 && this._config.widget_effect === 'fill') {
        const filledHeight = barHeight * dotPosition;
        const filledY = price >= 0 ? y + (barHeight - filledHeight) : y;

        return `
          <g>
            ${tooltip}
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
              ${hours[index]}:00
            </text>
          </g>
        `;
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
    const buyColor = this.getPriceColor(buyEntity, buyPrice);
    const sellColor = this.getPriceColor(sellEntity, sellPrice);
    
    this._remainingHours = null;
    
    const buyAttribute = this._config.attribute_config ? 
      this.getAttributeValue(buyEntity, this._config.attribute_config) : null;
    const sellAttribute = this._config.attribute_config ? 
      this.getAttributeValue(sellEntity, this._config.attribute_config) : null;
    const attributeLabel = this.getAttributeLabel(this._config.attribute_config);

    let buyWidgetHtml = '';
    let sellWidgetHtml = '';
    if (this._config.show_widget !== 'none' && !isSuperCompact) {
      const buyData = this.generateWidgetData(buyEntity);
      const sellData = this.generateWidgetData(sellEntity);

      const noData = (label) => `
        <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 8px; text-align: center;">
          ${this.translate('no_data')} (${label})
        </div>
      `;

      if (this._config.show_widget === 'sparkline') {
        if (buyData.data.length > 1) {
          buyWidgetHtml = this.createSparkline(buyData.data, buyData.hours, styles.widget.height, buyColor, buyData.dotPosition);
        }
        if (sellData.data.length > 1) {
          sellWidgetHtml = this.createSparkline(sellData.data, sellData.hours, styles.widget.height, sellColor, sellData.dotPosition);
        }
      } else if (this._config.show_widget === 'bars') {
        buyWidgetHtml = buyData.data.length > 0 ?
          this.createBars(buyData.data, buyData.hours, styles.widget.height, buyColor, buyData.dotPosition) :
          noData('Buy');
        sellWidgetHtml = sellData.data.length > 0 ?
          this.createBars(sellData.data, sellData.hours, styles.widget.height, sellColor, sellData.dotPosition) :
          noData('Sell');
      }
    }

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
            ${statusBadge(sellEntity)}
            ${cachedBadge(sellEntity)}
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
  version: '4.2.0'
});
