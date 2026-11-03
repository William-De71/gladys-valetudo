// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`) and fake Valetudo robots
// (test/helpers/fake-valetudo.js): discovery, states, commands, scene
// actions and triggers, widgets, map image, authentication, address changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { createValetudoClient } from '../src/valetudo/client.js';
import { memoryStorage } from '../src/storage.js';
import {
  FakeRobot,
  fakeValetudoNetwork,
  mdnsAnswer,
  silentLogger,
} from './helpers/fake-valetudo.js';

const CONFIG = { language: 'fr', hosts: '10.0.0.7:8080', mdns_discovery: true };
const id = (key) => `ext:test-integration:device:${key}`;
const SALON = id('smoothweakpigeon');
const ETAGE = id('happyredfox');

const robots = () => [
  new FakeRobot({
    host: '192.168.1.40',
    systemId: 'SmoothWeakPigeon',
    friendlyName: 'Robot Salon',
  }),
  // Typed in the configuration, on another port, not announced by mDNS.
  new FakeRobot({
    host: '10.0.0.7:8080',
    systemId: 'HappyRedFox',
    manufacturer: 'Roborock',
    modelName: 'S5',
    capabilities: ['BasicControlCapability', 'FanSpeedControlCapability'],
  }),
];

async function setup({
  config = CONFIG,
  create = true,
  network = fakeValetudoNetwork(robots()),
  storage = memoryStorage(),
  scanResults,
} = {}) {
  const gladys = createFakeGladys({
    config: structuredClone(config),
    scanResults: scanResults ?? { mdns: [mdnsAnswer(network.robots.get('192.168.1.40'))] },
  });
  const app = createApp(gladys, {
    client: createValetudoClient({ fetch: network.fetch }),
    storage,
    logger: silentLogger,
    streams: false,
  });
  await gladys.connect();
  await app.start();
  if (create) {
    for (const device of gladys.fake.discoveredDevices) {
      await gladys.fake.deviceCreated(structuredClone(device));
    }
    await app.check();
    await app.flushStates();
  }
  // The timers are unref'd: the tests drive checks and searches themselves.
  return { gladys, fake: gladys.fake, app, network, storage };
}

const ok = (ack) => {
  assert.equal(ack.success, true, ack.error);
  return ack.data;
};
const deviceOf = (fake, externalId) =>
  structuredClone(fake.discoveredDevices.find((device) => device.external_id === externalId));
const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`));
const last = (fake, externalId, key) => fake.lastState(`${externalId}:${key}`);
const setValue = (fake, externalId, key, value) => {
  const device = deviceOf(fake, externalId);
  return fake.setValue(device, featureOf(device, key), value);
};
const robotAt = (network, host) => network.robots.get(host);
const events = (fake, key) => fake.sceneEvents.filter((event) => event.key === key);

test('discovery: robots from mDNS and typed addresses, features from their capabilities', async () => {
  const { fake, storage } = await setup({ create: false });
  const ids = fake.discoveredDevices.map((device) => device.external_id).sort();
  assert.deepEqual(ids, [ETAGE, SALON].sort());
  const salon = deviceOf(fake, SALON);
  assert.equal(salon.name, 'Robot Salon');
  assert.equal(salon.should_poll, false);
  assert.equal(salon.poll_frequency, undefined);
  assert.equal(featureOf(salon, 'state').name, 'Robot Salon - État');
  assert.deepEqual(
    salon.features.map((feature) => feature.external_id.split(':').pop()),
    [
      'state',
      'run_mode',
      'dock',
      'battery',
      'fan_speed',
      'water_usage',
      'consumable_brush_main',
      'consumable_brush_side_right',
      'consumable_filter_main',
    ],
    'the sensor cleaning reports minutes without a maximum: no percentage, no feature',
  );
  assert.deepEqual(
    featureOf(salon, 'run_mode').supported_options.map((option) => [option.value, option.label]),
    [
      [0, 'Arrêt'],
      [1, 'Nettoyer'],
      [2, 'Cartographier'],
    ],
  );
  assert.deepEqual(
    featureOf(salon, 'fan_speed').supported_options.map((option) => option.label),
    ['Faible', 'Moyen', 'Fort', 'Maximum'],
  );
  assert.equal(
    featureOf(salon, 'consumable_brush_side_right').name,
    'Robot Salon - Brosse latérale',
  );
  const etage = deviceOf(fake, ETAGE);
  assert.equal(etage.name, 'Roborock S5');
  assert.deepEqual(
    etage.features.map((feature) => feature.external_id.split(':').pop()),
    ['state', 'run_mode', 'dock', 'battery', 'fan_speed'],
  );
  assert.equal(featureOf(etage, 'run_mode').supported_options.length, 2, 'no mapping pass');
  assert.deepEqual(Object.keys(storage.files['robots.json']).sort(), [
    'happyredfox',
    'smoothweakpigeon',
  ]);
  assert.equal(storage.files['robots.json'].happyredfox.host, '10.0.0.7:8080');
  for (const device of fake.discoveredDevices) {
    for (const feature of device.features) {
      for (const field of ['min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
      }
    }
  }
});

test('states of the created robots: state, run mode, battery, presets, consumables', async () => {
  const { fake } = await setup();
  assert.equal(last(fake, SALON, 'state'), 6, 'docked and charged');
  assert.equal(last(fake, SALON, 'run_mode'), 0);
  assert.equal(last(fake, SALON, 'battery'), 100);
  assert.equal(last(fake, SALON, 'fan_speed'), 'medium');
  assert.equal(last(fake, SALON, 'water_usage'), 'low');
  assert.equal(last(fake, SALON, 'consumable_brush_main'), 67, '12000 of 18000 minutes');
  assert.equal(last(fake, SALON, 'consumable_brush_side_right'), 8);
  assert.ok(
    fake.transports.some(
      (entry) => entry.device_external_id === SALON && entry.transport === 'local',
    ),
  );
  assert.equal(fake.connectionStatus.connected, true);
  assert.match(fake.connectionStatus.message.fr, /2 robot\(s\) Valetudo sur 2/);
});

test('scene triggers: started, finished with the statistics, error — once per transition', async () => {
  const { fake, app, network } = await setup();
  const robot = robotAt(network, '192.168.1.40');
  robot.battery = { level: 95, flag: 'discharging' };
  robot.status = { value: 'cleaning', flag: 'segment' };
  app.applyAttributes('smoothweakpigeon', robot.attributes());
  app.applyAttributes('smoothweakpigeon', robot.attributes());
  robot.status = { value: 'paused', flag: 'segment' };
  app.applyAttributes('smoothweakpigeon', robot.attributes());
  robot.status = { value: 'cleaning', flag: 'segment' };
  app.applyAttributes('smoothweakpigeon', robot.attributes());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(events(fake, 'cleaning_started').length, 1, 'a resume is not a start');
  assert.deepEqual(events(fake, 'cleaning_started')[0].data, {
    device: SALON,
    name: 'Robot Salon',
    mode: 'cleaning',
    task: 'segment',
  });
  robot.status = { value: 'returning', flag: 'none' };
  app.applyAttributes('smoothweakpigeon', robot.attributes());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events(fake, 'cleaning_finished')[0].data, {
    device: SALON,
    name: 'Robot Salon',
    status: 'returning',
    area_m2: 21.4,
    duration_min: 25,
  });
  robot.status = { value: 'error', flag: 'none', error: { message: 'Roue soulevée' } };
  app.applyAttributes('smoothweakpigeon', robot.attributes());
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(events(fake, 'error')[0].data.message, 'Roue soulevée');
  await app.flushStates();
  assert.equal(last(fake, SALON, 'state'), 3);
  assert.equal(events(fake, 'cleaning_finished').length, 1, 'an error is not an end');
});

test('commands: run mode, dock and presets go to the robot', async () => {
  const { fake, network } = await setup();
  const robot = robotAt(network, '192.168.1.40');
  ok(await setValue(fake, SALON, 'run_mode', 1));
  ok(await setValue(fake, SALON, 'run_mode', 0));
  ok(await setValue(fake, SALON, 'run_mode', 2));
  ok(await setValue(fake, SALON, 'dock', 1));
  ok(await setValue(fake, SALON, 'fan_speed', 'max'));
  assert.deepEqual(
    robot.commands.map((command) => [command.capability, command.body.action ?? command.body.name]),
    [
      ['BasicControlCapability', 'start'],
      ['BasicControlCapability', 'stop'],
      ['MappingPassCapability', 'start_mapping'],
      ['BasicControlCapability', 'home'],
      ['FanSpeedControlCapability', 'max'],
    ],
  );
  const refused = await setValue(fake, SALON, 'fan_speed', 'turbo');
  assert.equal(refused.success, false);
  assert.match(refused.error, /n’a pas le réglage « turbo »/);
  const etage = await setValue(fake, ETAGE, 'run_mode', 2);
  assert.equal(etage.success, false, 'no MappingPassCapability');
});

test('clean_rooms: rooms by name or number, passes within bounds, presets first', async () => {
  const { fake, network } = await setup();
  const robot = robotAt(network, '192.168.1.40');
  const result = ok(
    await fake.sceneAction('clean_rooms', {
      device: SALON,
      rooms: 'sejour, 2',
      iterations: 5,
      fan_speed: 'high',
    }),
  );
  assert.deepEqual(result.outputs, { rooms: 'Séjour, Bad' });
  assert.deepEqual(robot.commands.at(-2), {
    capability: 'FanSpeedControlCapability',
    path: '/preset',
    body: { name: 'high' },
  });
  assert.deepEqual(robot.commands.at(-1).body, {
    action: 'start_segment_action',
    segment_ids: ['3', '2'],
    iterations: 2,
    customOrder: true,
  });
  const unknown = await fake.sceneAction('clean_rooms', { device: SALON, rooms: 'Garage' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Pas de pièce « Garage ».*Cuisine, Bad, Séjour/);
  const none = await fake.sceneAction('clean_rooms', { device: ETAGE, rooms: 'Cuisine' });
  assert.equal(none.success, false, 'no MapSegmentationCapability');
});

test('control: locate, dock functions, and a clear error for a missing capability', async () => {
  const { fake, network } = await setup();
  const robot = robotAt(network, '192.168.1.40');
  ok(await fake.sceneAction('control', { device: SALON, command: 'locate' }));
  ok(await fake.sceneAction('control', { device: SALON, command: 'auto_empty' }));
  assert.deepEqual(
    robot.commands.map((command) => command.capability),
    ['LocateCapability', 'AutoEmptyDockManualTriggerCapability'],
  );
  const missing = await fake.sceneAction('control', { device: SALON, command: 'mop_dock_dry' });
  assert.equal(missing.success, false);
  assert.match(missing.error, /MopDockDryManualTriggerCapability/);
});

test('attention_needed: only the Valetudo events raised after the start', async () => {
  const { fake, app, network } = await setup();
  const robot = robotAt(network, '192.168.1.40');
  robot.events.push({
    __class: 'DustBinFullValetudoEvent',
    id: 'old',
    timestamp: '2026-11-01T08:00:00Z',
    processed: false,
  });
  // The first check after the start ran before this event existed: it is new.
  await app.check();
  robot.events.push(
    {
      __class: 'ConsumableDepletedValetudoEvent',
      id: 'e2',
      timestamp: '2026-11-03T08:00:00Z',
      processed: false,
      type: 'filter',
      subType: 'main',
    },
    { __class: 'ErrorStateValetudoEvent', id: 'e3', processed: false, message: 'x' },
  );
  await app.check();
  await app.check();
  const attention = events(fake, 'attention_needed').map((event) => event.data);
  assert.deepEqual(
    attention.map((data) => data.reason),
    ['dustbin_full', 'consumable_depleted'],
  );
  assert.equal(attention[1].consumable, 'Filtre');
  assert.equal(attention[1].message, 'Consommable usé : Filtre.');
});

test('a robot that stops answering: unreachable after two checks, then reachable again', async () => {
  const { fake, app, network } = await setup();
  const robot = robotAt(network, '192.168.1.40');
  robot.unplugged = true;
  await app.check();
  assert.equal(events(fake, 'unreachable').length, 0);
  await app.check();
  assert.deepEqual(events(fake, 'unreachable')[0].data, {
    device: SALON,
    name: 'Robot Salon',
    host: '192.168.1.40',
  });
  assert.ok(
    fake.transports.some(
      (entry) => entry.device_external_id === SALON && entry.transport === 'unreachable',
    ),
  );
  robot.unplugged = false;
  await app.check();
  assert.equal(events(fake, 'reachable_again').length, 1);
});

test('authentication: refused credentials show in the status, the right ones work', async () => {
  const network = fakeValetudoNetwork([
    new FakeRobot({
      host: '192.168.1.40',
      systemId: 'SmoothWeakPigeon',
      auth: { username: 'admin', password: 'secret' },
    }),
  ]);
  const { fake, gladys } = await setup({ network, create: false });
  assert.equal(fake.discoveredDevices.length, 0);
  assert.equal(fake.connectionStatus.connected, false);
  assert.match(fake.connectionStatus.message.en, /refuses the user name or password/);
  const message = ok(await fake.action('test_connection'));
  assert.match(message.message?.fr ?? message.fr, /identifiants refusés/);
  await fake.configUpdated({ ...CONFIG, hosts: '', username: 'admin', password: 'secret' });
  assert.deepEqual(
    fake.discoveredDevices.map((device) => device.external_id),
    [SALON],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a robot that moved (DHCP) is followed by its system id', async () => {
  const network = fakeValetudoNetwork(robots());
  const { fake, app, storage } = await setup({ network });
  const robot = robotAt(network, '192.168.1.40');
  network.robots.delete('192.168.1.40');
  robot.host = '192.168.1.41';
  network.add(robot);
  fake.scanResults = { mdns: [mdnsAnswer(robot, '192.168.1.41')] };
  await app.scan();
  assert.equal(storage.files['robots.json'].smoothweakpigeon.host, '192.168.1.41');
  assert.equal(
    deviceOf(fake, SALON).params.find((param) => param.name === 'VALETUDO_HOST').value,
    '192.168.1.41',
  );
  ok(await setValue(fake, SALON, 'dock', 1));
  assert.equal(robot.commands.at(-1).body.action, 'home');
});

test('widgets: robot, map (with its picture) and maintenance, valid in every language', async () => {
  const { fake } = await setup();
  const settings = { device: SALON };
  const robot = ok(await fake.widgetGet('robot', { settings, language: 'fr' }));
  assert.deepEqual(validateWidgetContent(robot.content ?? robot), []);
  const map = ok(await fake.widgetGet('map', { settings, language: 'fr' }));
  const content = map.content ?? map;
  assert.deepEqual(validateWidgetContent(content), []);
  const image = content.components.find((component) => component.type === 'image');
  assert.match(image.key, /^map-[0-9a-f]{8}-[0-9a-f]{16}$/);
  const picture = ok(await fake.widgetGetImage(image.key));
  const base64 = picture.image ?? picture;
  assert.deepEqual(validateWidgetImage(base64), []);
  assert.equal(Buffer.from(base64, 'base64').subarray(1, 4).toString(), 'PNG');
  const maintenance = ok(await fake.widgetGet('maintenance', { settings, language: 'fr' }));
  const list = (maintenance.content ?? maintenance).components.find((c) => c.type === 'card-list');
  assert.equal(list.items[0].badge.text.fr, 'À changer', 'the side brush at 8 % comes first');
});

test('widget buttons: start, a room, a consumable reset', async () => {
  const { fake, network } = await setup();
  const robot = robotAt(network, '192.168.1.40');
  const settings = { device: SALON };
  const started = ok(await fake.widgetAction('robot', 'start', { device: SALON }, { settings }));
  assert.match(started.message?.fr ?? started.fr, /démarre le nettoyage/);
  const room = ok(
    await fake.widgetAction(
      'robot',
      'clean_room',
      { device: SALON },
      { settings, values: { room: '1', iterations: 1 } },
    ),
  );
  assert.match(room.message?.fr ?? room.fr, /part nettoyer Cuisine/);
  assert.deepEqual(robot.commands.at(-1).body.segment_ids, ['1']);
  const reset = ok(
    await fake.widgetAction(
      'maintenance',
      'reset_consumable',
      { device: SALON },
      { settings, values: { consumable: 'consumable_brush_side_right' } },
    ),
  );
  assert.match(reset.message?.fr ?? reset.fr, /Brosse latérale : compteur remis à zéro/);
  assert.equal(robot.commands.at(-1).path, '/brush/side_right');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(last(fake, SALON, 'consumable_brush_side_right'), 100);
});

test('the configuration button lists the robots, with their battery', async () => {
  const { fake } = await setup();
  const data = ok(await fake.action('test_connection'));
  const message = data.message ?? data;
  assert.match(message.fr, /2 robot\(s\) trouvé\(s\)/);
  assert.match(message.fr, /Robot Salon \(192\.168\.1\.40, batterie 100 %\)/);
  assert.match(message.fr, /10\.0\.0\.7:8080, saisie/);
});
