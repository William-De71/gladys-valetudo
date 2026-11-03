// The widget contents, built by the same code Gladys gets: valid for the SDK
// in every language, within the budget, the right buttons for each state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  buildMaintenanceWidget,
  buildMapWidget,
  buildRobotWidget,
  WIDGET_ACTIONS,
} from '../src/widgets.js';

const ROBOT = {
  deviceId: 'ext:test-integration:device:smoothweakpigeon',
  name: 'Robot Salon',
  reachable: true,
  status: 'docked',
  flag: 'none',
  error: null,
  battery: 100,
  batteryFlag: 'charged',
  presets: { fan_speed: 'medium', water_grade: 'low' },
  current: { area: null, time: null },
  rooms: [
    { id: '1', name: 'Cuisine' },
    { id: '2', name: '' },
  ],
  canControl: true,
  canLocate: true,
  canCleanRooms: true,
  maxIterations: 2,
};
const buttons = (content) =>
  content.components.filter((c) => c.type === 'button').map((c) => c.action.key);

test('robot on its dock: start, clean a room, locate (no dock button)', () => {
  const content = buildRobotWidget(ROBOT);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(buttons(content), [
    WIDGET_ACTIONS.START,
    WIDGET_ACTIONS.CLEAN_ROOM,
    WIDGET_ACTIONS.LOCATE,
  ]);
  const room = content.components.find((c) => c.action?.key === WIDGET_ACTIONS.CLEAN_ROOM);
  assert.deepEqual(
    room.action.fields[0].options.map((option) => option.label.fr),
    ['Cuisine', 'Pièce 2'],
  );
  assert.equal(room.action.fields[1].max, 2);
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.value.fr),
    ['Sur la base', 'Moyen', 'Faible'],
  );
});

test('robot cleaning: pause, dock, the current run in tiles; paused: resume', () => {
  const cleaning = buildRobotWidget({
    ...ROBOT,
    status: 'cleaning',
    flag: 'segment',
    battery: 15,
    batteryFlag: 'discharging',
    current: { area: 21.4, time: 25 },
  });
  assert.deepEqual(validateWidgetContent(cleaning), []);
  assert.deepEqual(buttons(cleaning), [
    WIDGET_ACTIONS.PAUSE,
    WIDGET_ACTIONS.HOME,
    WIDGET_ACTIONS.LOCATE,
  ]);
  const tiles = cleaning.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => [tile.value, tile.unit, tile.color]),
    [
      [15, '%', 'danger'],
      [21.4, 'm²', 'primary'],
      [25, 'min', 'primary'],
    ],
  );
  const paused = buildRobotWidget({ ...ROBOT, status: 'paused' });
  assert.equal(paused.components.find((c) => c.type === 'button').label.fr, 'Reprendre');
});

test('robot in error: the message; offline or no device: no button', () => {
  const error = buildRobotWidget({ ...ROBOT, status: 'error', error: 'Roue soulevée' });
  assert.deepEqual(validateWidgetContent(error), []);
  const status = error.components.find((c) => c.type === 'status');
  assert.equal(status.items.at(-1).value.fr, 'Roue soulevée');
  const offline = buildRobotWidget({ ...ROBOT, reachable: false });
  assert.deepEqual(validateWidgetContent(offline), []);
  assert.deepEqual(buttons(offline), []);
  assert.deepEqual(validateWidgetContent(buildRobotWidget(null)), []);
  const watcher = buildRobotWidget({ ...ROBOT, canControl: false });
  assert.deepEqual(buttons(watcher), []);
});

test('map: the picture and a caption; without a map, a hint', () => {
  const content = buildMapWidget({
    name: 'Robot Salon',
    reachable: true,
    imageKey: 'map-0123abcd-0123456789abcdef',
    rooms: 6,
    area: 43,
    activeRoom: null,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components.at(-1).text.fr, '6 pièces · 43 m² cartographiés');
  const cleaning = buildMapWidget({
    name: 'R',
    reachable: true,
    imageKey: 'map-a',
    rooms: 6,
    area: 43,
    activeRoom: 'Cuisine',
  });
  assert.equal(cleaning.components.at(-1).text.de, 'Reinigung: Cuisine');
  const none = buildMapWidget({ name: 'R', reachable: true, imageKey: null, rooms: 0, area: null });
  assert.deepEqual(validateWidgetContent(none), []);
  assert.equal(
    none.components.some((c) => c.type === 'image'),
    false,
  );
  assert.deepEqual(validateWidgetContent(buildMapWidget(null)), []);
});

test('maintenance: the most worn first, badges, totals and the reset form', () => {
  const content = buildMaintenanceWidget({
    deviceId: ROBOT.deviceId,
    name: 'Robot Salon',
    reachable: true,
    consumables: [
      { type: 'brush', subType: 'main', remaining: { value: 12000, unit: 'minutes' } },
      { type: 'brush', subType: 'side_right', remaining: { value: 8, unit: 'percent' } },
      { type: 'filter', subType: 'main', remaining: { value: 2000, unit: 'minutes' } },
      { type: 'cleaning', subType: 'sensor', remaining: { value: 1200, unit: 'minutes' } },
    ],
    meta: [
      { type: 'brush', subType: 'main', maxValue: 18000 },
      { type: 'filter', subType: 'main', maxValue: 9000 },
    ],
    total: { area: 4120, time: 200, count: 187 },
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title.en, item.subtitle.en, item.badge?.text.en ?? null]),
    [
      ['Side brush', '8 % left', 'Replace'],
      ['Filter', '22 % left', 'Soon'],
      ['Main brush', '67 % left', 'OK'],
      ['Sensor cleaning', '20 h left', null],
    ],
  );
  const reset = content.components.find((c) => c.type === 'button');
  assert.equal(reset.action.confirm, true);
  assert.equal(reset.action.fields[0].options.length, 4);
  assert.equal(content.components.filter((c) => c.type === 'value').length, 3);
  const empty = buildMaintenanceWidget({ ...ROBOT, consumables: [], meta: [], total: {} });
  assert.deepEqual(validateWidgetContent(empty), []);
});
