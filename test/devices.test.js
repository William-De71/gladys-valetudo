// The device of the Discover tab: the fields the "Update" button compares
// are pinned (test/fixtures/discovery.baseline.json), every feature carries
// min / max / read_only / has_feedback, and the category / type pairs are
// ones the Gladys dashboard knows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  buildDevice,
  consumableKey,
  consumableName,
  consumablePercent,
  deviceName,
  featureValues,
} from '../src/devices.js';
import {
  readAttributes,
  VACUUM_STATE,
  vacuumMode,
  vacuumState,
} from '../src/valetudo/attributes.js';

const gladys = createFakeGladys();
const ENTRY = {
  id: 'smoothweakpigeon',
  host: '192.168.1.40',
  systemId: 'SmoothWeakPigeon',
  friendlyName: 'Robot Salon',
  manufacturer: 'Dreame',
  model: 'D9',
  capabilities: new Set([
    'BasicControlCapability',
    'FanSpeedControlCapability',
    'WaterUsageControlCapability',
    'OperationModeControlCapability',
    'MappingPassCapability',
    'ConsumableMonitoringCapability',
  ]),
  presets: {
    fan_speed: ['low', 'medium', 'high', 'max'],
    water_grade: ['low', 'medium', 'high'],
    operation_mode: ['vacuum', 'mop', 'vacuum_and_mop'],
  },
  consumables: [
    { type: 'brush', subType: 'main', remaining: { value: 12000, unit: 'minutes' } },
    { type: 'brush', subType: 'side_right', remaining: { value: 8, unit: 'percent' } },
    { type: 'filter', subType: 'main', remaining: { value: 600, unit: 'minutes' } },
    { type: 'cleaning', subType: 'sensor', remaining: { value: 1200, unit: 'minutes' } },
  ],
  consumableMeta: [
    { type: 'brush', subType: 'main', unit: 'minutes', maxValue: 18000 },
    { type: 'filter', subType: 'main', unit: 'minutes', maxValue: 9000 },
  ],
};
const COMPARED = ['category', 'type', 'unit', 'min', 'max', 'step'];

const pinned = (device) =>
  device.features.map((feature) => ({
    external_id: feature.external_id,
    ...Object.fromEntries(COMPARED.map((key) => [key, feature[key] ?? null])),
  }));

const BASELINE = new URL('./fixtures/discovery.baseline.json', import.meta.url);
if (process.env.UPDATE_BASELINE === '1') {
  writeFileSync(BASELINE, `${JSON.stringify(pinned(buildDevice(gladys, ENTRY, 'en')), null, 2)}\n`);
}

test('the compared fields of the features never change', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.deepEqual(pinned(buildDevice(gladys, ENTRY, language)), baseline, language);
  }
});

test('every feature is complete, with a known category / type pair', () => {
  const device = buildDevice(gladys, ENTRY, 'fr');
  assert.equal(device.should_poll, false);
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    const category = Object.entries(DEVICE_FEATURE_CATEGORIES).find(
      ([, v]) => v === feature.category,
    );
    assert.ok(category, feature.category);
    assert.ok(
      Object.values(DEVICE_FEATURE_TYPES[category[0]]).includes(feature.type),
      feature.type,
    );
  }
  assert.deepEqual(
    device.params.map((param) => param.name),
    ['VALETUDO_HOST', 'VALETUDO_SYSTEM_ID'],
  );
  // A robot without BasicControlCapability is a sensor only.
  const watcher = buildDevice(gladys, { ...ENTRY, capabilities: new Set() }, 'en');
  assert.deepEqual(
    watcher.features.map((feature) => feature.external_id.split(':').pop()),
    ['state', 'battery'],
  );
});

test('names: friendly name, else model; consumables with their part', () => {
  assert.equal(deviceName(ENTRY), 'Robot Salon');
  assert.equal(deviceName({ ...ENTRY, friendlyName: '' }), 'Dreame D9');
  assert.equal(deviceName({ systemId: 'X' }), 'Valetudo X');
  assert.equal(
    consumableKey({ type: 'brush', subType: 'side_right' }),
    'consumable_brush_side_right',
  );
  assert.equal(consumableKey({ type: 'filter', subType: 'none' }), 'consumable_filter');
  assert.equal(consumableName({ type: 'brush', subType: 'main' }, 'de'), 'Hauptbürste');
  assert.equal(consumableName({ type: 'filter' }, 'es'), 'Filtro');
  assert.equal(consumableName({ type: 'brush', subType: 'dock' }, 'fr'), 'Brosse (station)');
  assert.equal(consumableName({ type: 'laser', subType: 'top' }, 'fr'), 'laser (top)');
  assert.equal(consumablePercent(ENTRY.consumables[0], ENTRY.consumableMeta), 67);
  assert.equal(consumablePercent(ENTRY.consumables[3], ENTRY.consumableMeta), null);
});

test('Valetudo states map onto the Gladys vacuum states', () => {
  const cases = [
    [{ value: 'docked' }, { flag: 'charging' }, VACUUM_STATE.CHARGING, 0],
    [{ value: 'docked' }, { flag: 'charged' }, VACUUM_STATE.DOCKED, 0],
    [{ value: 'cleaning', flag: 'segment' }, {}, VACUUM_STATE.RUNNING, 1],
    [{ value: 'cleaning', flag: 'mapping' }, {}, VACUUM_STATE.RUNNING, 2],
    [{ value: 'paused', flag: 'resumable' }, {}, VACUUM_STATE.PAUSED, 1],
    [{ value: 'returning' }, {}, VACUUM_STATE.RETURNING_TO_DOCK, 0],
    [{ value: 'error', error: { message: 'Stuck' } }, {}, VACUUM_STATE.ERROR, 0],
    [{ value: 'idle' }, {}, VACUUM_STATE.STOPPED, 0],
    [{ value: 'manual_control' }, {}, VACUUM_STATE.RUNNING, 1],
  ];
  for (const [status, battery, state, mode] of cases) {
    const snapshot = readAttributes([
      { __class: 'StatusStateAttribute', ...status },
      { __class: 'BatteryStateAttribute', level: 50.4, ...battery },
    ]);
    assert.equal(vacuumState(snapshot), state, status.value);
    assert.equal(vacuumMode(snapshot), mode, status.value);
  }
  assert.equal(
    readAttributes([
      { __class: 'StatusStateAttribute', value: 'error', error: { message: 'Stuck' } },
    ]).error,
    'Stuck',
  );
  assert.equal(vacuumState(readAttributes([])), null);
  assert.equal(
    vacuumState(readAttributes([{ __class: 'StatusStateAttribute', value: 'warp' }])),
    null,
  );
});

test('values: states, presets known to the robot only, consumable percentages', () => {
  const entry = {
    ...ENTRY,
    snapshot: readAttributes([
      { __class: 'StatusStateAttribute', value: 'cleaning', flag: 'none' },
      { __class: 'BatteryStateAttribute', level: 77, flag: 'discharging' },
      { __class: 'PresetSelectionStateAttribute', type: 'fan_speed', value: 'max' },
      { __class: 'PresetSelectionStateAttribute', type: 'water_grade', value: 'turbo' },
      { __class: 'PresetSelectionStateAttribute', type: 'operation_mode', value: 'vacuum_and_mop' },
    ]),
  };
  assert.deepEqual(featureValues(entry), [
    ['state', 1],
    ['run_mode', 1],
    ['battery', 77],
    ['fan_speed', { text: 'max' }],
    ['operation_mode', { text: 'vacuum_and_mop' }],
    ['consumable_brush_main', 67],
    ['consumable_brush_side_right', 8],
    ['consumable_filter_main', 7],
  ]);
});
