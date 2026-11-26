const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.HTMLElement = class {
  attachShadow() {
    this.nodes = {};
    this.writes = 0;
    const element = this;
    let html = '';
    this.shadowRoot = {
      get innerHTML() { return html; },
      set innerHTML(value) { html = value; element.writes += 1; },
      querySelectorAll: () => [],
      querySelector: (selector) => this.nodes[selector] || null
    };
    return this.shadowRoot;
  }
};
globalThis.customElements = { define(name, cls) { globalThis.PstrykCard = cls; } };
globalThis.window = {};
Object.defineProperty(globalThis, 'navigator', { value: { language: 'pl-PL' }, configurable: true });
require('../pstryk-card.js');

const NOW = new Date('2026-11-25T14:49:00Z').getTime();
const realNow = Date.now;
test.beforeEach(() => { Date.now = () => NOW; });
test.afterEach(() => { Date.now = realNow; });

function day(date) {
  return Array.from({ length: 24 }, (_, hour) => ({ start: `${date}T${String(hour).padStart(2, '0')}:00:00`, price: hour / 10 }));
}

function entity(state, attributes = {}) {
  return { state: String(state), attributes: { 'All prices': day('2026-11-25'), unit_of_measurement: 'PLN/kWh', ...attributes } };
}

function card(config = {}, states = {}, hass = {}) {
  const made = new globalThis.PstrykCard();
  made.setConfig({ buy_entity: 'sensor.buy', sell_entity: 'sensor.sell', ...config });
  made.hass = {
    language: 'en',
    locale: { language: 'en', time_zone: 'server' },
    config: { time_zone: 'Europe/Warsaw' },
    states: { 'sensor.buy': entity(1.5), 'sensor.sell': entity(1.5), ...states },
    ...hass
  };
  return made;
}

test('a threshold of zero is a threshold', () => {
  const made = card({ alert_buy_above: 0, alert_sell_below: 0 });
  assert.equal(made.checkAlert('sell', '-0.05'), true);
  assert.equal(made.checkAlert('sell', '0.05'), false);
  assert.equal(made.checkAlert('buy', '0.01'), true);
  assert.equal(card({}).checkAlert('sell', '-1'), false);
  assert.equal(card({ alert_sell_below: null }).checkAlert('sell', '-1'), false);
  assert.equal(card({ alert_sell_below: 'abc' }).checkAlert('sell', '-1'), false);
  assert.equal(card({ alert_buy_above: '1.2' }).checkAlert('buy', '1.3'), true);
});

test('the language of Home Assistant comes before the language of the browser', () => {
  assert.equal(card().translate('buy_price'), 'Buy Price');
  assert.equal(card({}, {}, { language: 'pl', locale: { language: 'pl', time_zone: 'server' } }).translate('buy_price'), 'Cena Zakupu');
  assert.equal(card({}, {}, { language: undefined, locale: { time_zone: 'server' } }).translate('buy_price'), 'Cena Zakupu');
});

test('the colour follows the hour of the best and worst lists, not a price that happens to be equal', () => {
  const at = (hour) => ({ start: `2026-11-25T${hour}:00:00`, price: 1.5 });
  const green = card({}, { 'sensor.buy': entity(1.5, { 'Best prices': [at('15')], 'Worst prices': [at('03')] }) });
  assert.equal(green.getPriceColor(green._hass.states['sensor.buy'], '1.5'), '#4ade80');
  const plain = card({}, { 'sensor.buy': entity(1.5, { 'Best prices': [at('03')], 'Worst prices': [at('04')] }) });
  assert.equal(plain.getPriceColor(plain._hass.states['sensor.buy'], '1.5'), 'var(--primary-text-color)');
  const red = card({}, { 'sensor.buy': entity(1.5, { 'Best prices': [at('03')], 'Worst prices': [at('15')] }) });
  assert.equal(red.getPriceColor(red._hass.states['sensor.buy'], '1.5'), '#f87171');
  const legacy = card({}, { 'sensor.buy': entity(1.5, { 'Best prices': [1.5], 'Worst prices': [9] }) });
  assert.equal(legacy.getPriceColor(legacy._hass.states['sensor.buy'], '1.5'), '#4ade80');
  const stale = card({}, { 'sensor.buy': entity(1.5, { 'All prices': day('2026-11-20'), 'Best prices': [{ start: '2026-11-20T03:00:00', price: 1.5 }] }) });
  assert.equal(stale.getPriceColor(stale._hass.states['sensor.buy'], '1.5'), '#4ade80');
});

test('text from the configuration and the unit of the entity are written safely', () => {
  const made = card(
    { title: '<b>Ceny</b> & "reszta"', attribute_config: '<i>x</i>', show_widget: 'bars', widget_hours: 4 },
    { 'sensor.buy': entity(1.5, { unit_of_measurement: 'EUR/MWh', '<i>x</i>': 2 }) }
  );
  const html = made.shadowRoot.innerHTML;
  assert.ok(html.includes('&lt;b&gt;Ceny&lt;/b&gt; &amp; &quot;reszta&quot;'));
  assert.ok(!html.includes('<b>Ceny</b>'));
  assert.ok(html.includes('&lt;i&gt;x&lt;/i&gt;: <span class="attribute-value">2.00 EUR/MWh</span>'));
  assert.ok(html.includes('1.50 EUR/MWh'));
  assert.ok(html.includes('<title>15:00 - 1.50 EUR/MWh</title>'));
  assert.ok(html.includes('1.50 PLN/kWh'));
  const missing = new globalThis.PstrykCard();
  missing.setConfig({ buy_entity: 'sensor.<x>', sell_entity: 'sensor.sell' });
  missing.hass = { language: 'en', states: {} };
  assert.ok(missing.shadowRoot.innerHTML.includes('sensor.&lt;x&gt; / sensor.sell'));
});

test('a widget without the current hour says so in the language of the card, for bars and for the line', () => {
  for (const widget of ['bars', 'sparkline']) {
    const made = card({ show_widget: widget }, { 'sensor.buy': entity(1.5, { 'All prices': day('2026-11-20') }) });
    assert.ok(made.shadowRoot.innerHTML.includes('No data (Buy Price)'), widget);
    assert.ok(!made.shadowRoot.innerHTML.includes('No data (Sell Price)'), widget);
  }
});

test('the last hour of the day still draws a line and a bar of a sensible width', () => {
  Date.now = () => new Date('2026-11-25T22:30:00Z').getTime();
  const made = card({ show_widget: 'sparkline' });
  assert.ok(made.shadowRoot.innerHTML.includes('<polyline'));
  assert.ok(made.shadowRoot.innerHTML.includes('<title>23:00 - 2.30 PLN/kWh</title>'));
  const bars = card({ show_widget: 'bars', widget_effect: 'none' });
  const width = Number(bars.shadowRoot.innerHTML.match(/class="bar"[^>]*?width="([0-9.]+)"/s)[1]);
  assert.ok(width > 0 && width <= 38.01, String(width));
});

test('four bars and more keep filling the width', () => {
  const made = card({ show_widget: 'bars', widget_hours: 4, widget_effect: 'none' });
  const widths = [...made.shadowRoot.innerHTML.matchAll(/class="bar"[^>]*?width="([0-9.]+)"/gs)].map(match => Number(match[1]));
  assert.deepEqual(widths, [38, 38, 38, 38, 38, 38, 38, 38]);
});

test('an open dashboard redraws the widget every minute and stops when the card is removed', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const made = card({ show_widget: 'bars', widget_effect: 'fill', widget_hours: 4 });
  let draws = 0;
  made.render = () => { draws += 1; };
  made.connectedCallback();
  t.mock.timers.tick(60000);
  t.mock.timers.tick(60000);
  assert.equal(draws, 2);
  made.disconnectedCallback();
  t.mock.timers.tick(180000);
  assert.equal(draws, 2);
  const quiet = card({ show_widget: 'none' });
  let quietDraws = 0;
  quiet.render = () => { quietDraws += 1; };
  quiet.connectedCallback();
  t.mock.timers.tick(120000);
  assert.equal(quietDraws, 0);
  quiet.disconnectedCallback();
});

test('the fill of the current bar follows the minute of the server', () => {
  const made = card({ show_widget: 'bars', widget_effect: 'fill', widget_hours: 4 });
  assert.equal(made.generateWidgetData(made._hass.states['sensor.buy']).dotPosition.toFixed(2), '0.82');
  Date.now = () => NOW + 6 * 60000;
  assert.equal(made.generateWidgetData(made._hass.states['sensor.buy']).dotPosition.toFixed(2), '0.92');
  Date.now = () => NOW + 11 * 60000;
  assert.deepEqual(made.generateWidgetData(made._hass.states['sensor.buy']).hours, ['16:00', '17:00', '18:00', '19:00']);
});

test('a changed configuration is drawn at once', () => {
  const made = card({ title: 'First' });
  assert.ok(made.shadowRoot.innerHTML.includes('First'));
  made.setConfig({ buy_entity: 'sensor.buy', sell_entity: 'sensor.sell', title: 'Second' });
  assert.ok(made.shadowRoot.innerHTML.includes('Second'));
});

test('a minute later only the widgets are replaced, and a new hour redraws the card', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const made = card({ show_widget: 'bars', widget_effect: 'fill', widget_hours: 4 });
  made.nodes = { '.widget-buy': { innerHTML: '' }, '.widget-sell': { innerHTML: '' } };
  const whole = made.shadowRoot.innerHTML;
  let draws = 0;
  const render = made.render.bind(made);
  made.render = () => { draws += 1; render(); };
  made.connectedCallback();
  Date.now = () => NOW + 60000;
  t.mock.timers.tick(60000);
  assert.equal(draws, 0);
  assert.equal(made.shadowRoot.innerHTML, whole);
  assert.ok(made.nodes['.widget-buy'].innerHTML.includes('<title>15:00 - 1.50 PLN/kWh</title>'));
  assert.ok(made.nodes['.widget-sell'].innerHTML.includes('<svg'));
  Date.now = () => NOW + 11 * 60000;
  t.mock.timers.tick(60000);
  assert.equal(draws, 1);
  assert.ok(made.shadowRoot.innerHTML.includes('<title>16:00 - 1.60 PLN/kWh</title>'));
  made.disconnectedCallback();
});

test('a change of language or of the time zone in the profile is drawn without a new price', () => {
  const made = card({ show_widget: 'bars', widget_hours: 4 });
  const first = made._hass;
  assert.ok(made.shadowRoot.innerHTML.includes('Buy Price'));
  made.hass = { ...first, language: 'pl', locale: { language: 'pl', time_zone: 'server' } };
  assert.ok(made.shadowRoot.innerHTML.includes('Cena Zakupu'));
  made.hass = { ...first, locale: { language: 'en', time_zone: 'local' } };
  const expected = new Intl.DateTimeFormat('en-GB', { hourCycle: 'h23', hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(NOW - 49 * 60000));
  const label = `${Number(expected.find(part => part.type === 'hour').value)}:${expected.find(part => part.type === 'minute').value}`;
  assert.ok(made.shadowRoot.innerHTML.includes(`<title>${label} - 1.50 PLN/kWh</title>`), label);
  let draws = 0;
  made.render = () => { draws += 1; };
  made.hass = { ...made._hass, states: { ...made._hass.states, 'sensor.other': {} } };
  assert.equal(draws, 0);
});

test('the day the clocks go back: the repeated hour is two slots, or one price for both', () => {
  const d24 = day('2026-10-25');
  const d25 = [...d24.slice(0, 3), { start: '2026-10-25T02:00:00', price: 9.9 }, ...d24.slice(3)];
  const at = (iso, list) => {
    Date.now = () => new Date(iso).getTime();
    const made = card({ show_widget: 'bars', widget_hours: 4 }, { 'sensor.buy': entity(1.5, { 'All prices': list }) });
    const out = made.generateWidgetData(made._hass.states['sensor.buy']);
    return [out.hours, out.data, Number(out.dotPosition.toFixed(2))];
  };
  assert.deepEqual(at('2026-10-25T00:30:00Z', d25), [['2:00', '2:00', '3:00', '4:00'], [0.2, 9.9, 0.3, 0.4], 0.5]);
  assert.deepEqual(at('2026-10-25T01:30:00Z', d25), [['2:00', '3:00', '4:00', '5:00'], [9.9, 0.3, 0.4, 0.5], 0.5]);
  assert.deepEqual(at('2026-10-25T00:30:00Z', d24), [['2:00', '3:00', '4:00', '5:00'], [0.2, 0.3, 0.4, 0.5], 0.25]);
  assert.deepEqual(at('2026-10-25T01:30:00Z', d24), [['2:00', '3:00', '4:00', '5:00'], [0.2, 0.3, 0.4, 0.5], 0.75]);
  assert.deepEqual(at('2026-10-24T23:30:00Z', d24), [['1:00', '2:00', '3:00', '4:00'], [0.1, 0.2, 0.3, 0.4], 0.5]);
});

test('the day the clocks go forward: the hour that does not exist is left out', () => {
  Date.now = () => new Date('2026-03-29T00:30:00Z').getTime();
  const made = card({ show_widget: 'bars', widget_hours: 4 }, { 'sensor.buy': entity(1.5, { 'All prices': day('2026-03-29') }) });
  const out = made.generateWidgetData(made._hass.states['sensor.buy']);
  assert.deepEqual([out.hours, out.data], [['1:00', '3:00', '4:00', '5:00'], [0.1, 0.3, 0.4, 0.5]]);
});

test('drawing again builds no new formatter and does not convert the list twice', () => {
  const two = [...day('2026-11-25'), ...day('2026-11-26')];
  const made = card({ show_widget: 'bars', widget_hours: 24 }, { 'sensor.buy': entity(1.5, { 'All prices': two }), 'sensor.sell': entity(1.5, { 'All prices': two }) });
  const Real = Intl.DateTimeFormat;
  let built = 0;
  let converted = 0;
  const instants = made._instants.bind(made);
  made._instants = (...args) => { converted += 1; return instants(...args); };
  Intl.DateTimeFormat = function (...args) {
    built += 1;
    return new Real(...args);
  };
  try {
    for (let i = 0; i < 10; i += 1) made.render();
  } finally {
    Intl.DateTimeFormat = Real;
  }
  assert.equal(built, 0);
  assert.equal(converted, 0);
});

test('an attribute that is not a price is written as it is', () => {
  const made = card();
  assert.equal(made.formatAttribute(1.234, 'PLN/kWh'), '1.23 PLN/kWh');
  assert.equal(made.formatAttribute('1,5', 'PLN/kWh'), '1.50 PLN/kWh');
  assert.equal(made.formatAttribute('2026-11-26 02:00:05', 'PLN/kWh'), '2026-11-26 02:00:05');
  assert.equal(made.formatAttribute('<b>', 'PLN/kWh'), '&lt;b&gt;');
  assert.equal(made.formatAttribute(true, 'PLN/kWh'), 'true');
  assert.equal(made.formatAttribute([1, 2], 'PLN/kWh'), '--');
  const shown = card({ attribute_config: 'Last updated' }, { 'sensor.buy': entity(1.5, { 'Last updated': '2026-11-26 02:00:05' }) });
  assert.ok(shown.shadowRoot.innerHTML.includes('Last updated: <span class="attribute-value">2026-11-26 02:00:05</span>'));
});

test('widget_hours outside 1 to 48 falls back to the default of the mode', () => {
  const hours = (config) => card(config)._config.widget_hours;
  assert.equal(hours({ widget_hours: 'abc' }), 24);
  assert.equal(hours({ widget_hours: -3 }), 24);
  assert.equal(hours({ widget_hours: 0.4 }), 24);
  assert.equal(hours({ widget_hours: 'abc', card_mode: 'compact' }), 12);
  assert.equal(hours({ widget_hours: '6' }), 6);
  assert.equal(hours({ widget_hours: 6.9 }), 6);
  assert.equal(hours({ widget_hours: 100 }), 48);
});

test('the page is written only when what it shows has changed', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const made = card({ show_widget: 'bars', widget_effect: 'none', widget_hours: 4 });
  assert.equal(made.writes, 1);
  made.render();
  made.render();
  assert.equal(made.writes, 1);
  const buy = { writes: 0, set innerHTML(value) { this.writes += 1; } };
  const sell = { writes: 0, set innerHTML(value) { this.writes += 1; } };
  made.nodes = { '.widget-buy': buy, '.widget-sell': sell };
  made.connectedCallback();
  Date.now = () => NOW + 60000;
  t.mock.timers.tick(60000);
  assert.deepEqual([made.writes, buy.writes, sell.writes], [1, 0, 0]);
  made.disconnectedCallback();
  Date.now = () => NOW;
  const filling = card({ show_widget: 'bars', widget_effect: 'fill', widget_hours: 4 });
  const filled = { writes: 0, set innerHTML(value) { this.writes += 1; } };
  filling.nodes = { '.widget-buy': filled, '.widget-sell': { set innerHTML(value) {} } };
  filling.connectedCallback();
  Date.now = () => NOW + 60000;
  t.mock.timers.tick(60000);
  assert.deepEqual([filling.writes, filled.writes], [1, 1]);
  filling.render();
  assert.equal(filling.writes, 2);
  filling.disconnectedCallback();
});

test('a dashboard that comes back into view is brought up to date at once', () => {
  const listeners = {};
  globalThis.document = {
    hidden: false,
    addEventListener: (type, handler) => { listeners[type] = handler; },
    removeEventListener: (type, handler) => { if (listeners[type] === handler) delete listeners[type]; }
  };
  try {
    const made = card({ show_widget: 'bars', widget_effect: 'fill', widget_hours: 4 });
    made.connectedCallback();
    let ticks = 0;
    made._tick = () => { ticks += 1; };
    globalThis.document.hidden = true;
    listeners.visibilitychange();
    assert.equal(ticks, 0);
    globalThis.document.hidden = false;
    listeners.visibilitychange();
    assert.equal(ticks, 1);
    made.disconnectedCallback();
    assert.equal(listeners.visibilitychange, undefined);
  } finally {
    delete globalThis.document;
  }
});
