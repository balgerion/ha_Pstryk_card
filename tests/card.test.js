const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = { innerHTML: '', querySelectorAll: () => [] };
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
