const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const BROWSER_ZONES = ['Europe/Warsaw', 'Asia/Tokyo', 'UTC', 'America/New_York'];

function day(date, suffix = '') {
  return Array.from({ length: 24 }, (_, hour) => ({
    start: `${date}T${String(hour).padStart(2, '0')}:00:00${suffix}`,
    price: hour / 10
  }));
}

function widget(browserZone, scenario) {
  const filled = { server_zone: 'Europe/Warsaw', profile: 'server', widget_hours: 4, ...scenario };
  const out = execFileSync(process.execPath, [path.join(__dirname, 'widget.js'), JSON.stringify(filled)], {
    env: { ...process.env, TZ: browserZone }
  });
  return JSON.parse(out.toString());
}

const AFTERNOON = { now: '2026-11-25T14:49:00Z', prices: day('2026-11-25') };
const HOME = { hours: ['15:00', '16:00', '17:00', '18:00'], data: [1.5, 1.6, 1.7, 1.8], dot: 0.82 };

test('the current hour is the hour of the server in every browser zone', () => {
  for (const zone of BROWSER_ZONES) {
    assert.deepEqual(widget(zone, AFTERNOON), HOME, zone);
  }
});

test('a start with an offset gives the same bars', () => {
  for (const zone of BROWSER_ZONES) {
    assert.deepEqual(widget(zone, { ...AFTERNOON, prices: day('2026-11-25', '+01:00') }), HOME, zone);
  }
});

test('the profile set to the local zone labels the same bars in the time of the browser', () => {
  const labels = {
    'Europe/Warsaw': ['15:00', '16:00', '17:00', '18:00'],
    'Asia/Tokyo': ['23:00', '0:00', '1:00', '2:00'],
    'UTC': ['14:00', '15:00', '16:00', '17:00'],
    'America/New_York': ['9:00', '10:00', '11:00', '12:00']
  };
  for (const zone of BROWSER_ZONES) {
    assert.deepEqual(widget(zone, { ...AFTERNOON, profile: 'local' }), { ...HOME, hours: labels[zone] }, zone);
  }
});

test('a list of two days runs on past midnight', () => {
  const two = { ...AFTERNOON, prices: [...day('2026-11-25'), ...day('2026-11-26')], widget_hours: 12 };
  for (const zone of BROWSER_ZONES) {
    const out = widget(zone, two);
    assert.deepEqual(out.hours, ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '0:00', '1:00', '2:00'], zone);
    assert.deepEqual(out.data.slice(8), [2.3, 0, 0.1, 0.2], zone);
  }
});

test('the last hour of the day is one bar and a list without the current hour is no data', () => {
  for (const zone of BROWSER_ZONES) {
    assert.deepEqual(widget(zone, { ...AFTERNOON, now: '2026-11-25T22:30:00Z' }), { hours: ['23:00'], data: [2.3], dot: 0.5 }, zone);
    assert.deepEqual(widget(zone, { ...AFTERNOON, prices: day('2026-11-24') }), { hours: [], data: [], dot: 0 }, zone);
    assert.deepEqual(widget(zone, { ...AFTERNOON, prices: day('2026-11-26') }), { hours: [], data: [], dot: 0 }, zone);
  }
});

test('summer time and the day the clocks go back use the offset of that hour', () => {
  for (const zone of BROWSER_ZONES) {
    assert.deepEqual(widget(zone, { now: '2026-07-01T10:15:00Z', prices: day('2026-07-01') }).hours, ['12:00', '13:00', '14:00', '15:00'], zone);
    assert.deepEqual(widget(zone, { now: '2026-10-25T11:30:00Z', prices: day('2026-10-25') }).hours, ['12:00', '13:00', '14:00', '15:00'], zone);
  }
});

test('another server zone and a server without a zone', () => {
  const tokyo = { now: '2026-11-25T14:49:00Z', prices: day('2026-11-25'), server_zone: 'Asia/Tokyo' };
  for (const zone of BROWSER_ZONES) {
    assert.deepEqual(widget(zone, tokyo), { hours: ['23:00'], data: [2.3], dot: 0.82 }, zone);
  }
  assert.deepEqual(widget('Europe/Warsaw', { ...AFTERNOON, server_zone: 'Not/AZone', profile: 'local' }), HOME);
});
