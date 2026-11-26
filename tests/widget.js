globalThis.HTMLElement = class { attachShadow() { return {}; } };
globalThis.customElements = { define(name, cls) { globalThis.PstrykCard = cls; } };
globalThis.window = {};
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en' }, configurable: true });
require('../pstryk-card.js');

const scenario = JSON.parse(process.argv[2]);
Date.now = () => new Date(scenario.now).getTime();
const card = new globalThis.PstrykCard();
card._config = { widget_hours: scenario.widget_hours };
card._hass = { config: { time_zone: scenario.server_zone }, locale: { time_zone: scenario.profile } };
const out = card.generateWidgetData({ attributes: { 'All prices': scenario.prices } });
process.stdout.write(JSON.stringify({ hours: out.hours, data: out.data, dot: Number(out.dotPosition.toFixed(2)) }));
