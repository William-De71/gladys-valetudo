// The pieces that talk to Valetudo: the HTTP client (paths, bodies, Basic
// authentication, errors), the Server-Sent Events parser, the mDNS answers
// and typed addresses, the map picture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { createSseParser, createValetudoClient, ValetudoError } from '../src/valetudo/client.js';
import {
  normalizeHost,
  parseHosts,
  parseMdnsServices,
  robotId,
} from '../src/valetudo/discovery.js';
import { MAP_MAX_SIZE, mapSegments, renderMap } from '../src/valetudo/map.js';
import { encodePng } from '../src/png.js';
import { FakeRobot, fakeValetudoNetwork, MAP, mdnsAnswer } from './helpers/fake-valetudo.js';

test('client: REST paths and bodies of the commands', async () => {
  const robot = new FakeRobot({ host: '192.168.1.40', systemId: 'A' });
  const network = fakeValetudoNetwork([robot]);
  const client = createValetudoClient({ fetch: network.fetch });
  assert.deepEqual(await client.valetudo('192.168.1.40'), {
    embedded: true,
    systemId: 'A',
    welcomeDialogDismissed: true,
  });
  assert.equal(await client.basicControl('192.168.1.40', 'start'), null, '"OK" is a success');
  await client.cleanSegments('192.168.1.40', ['1', '3'], { iterations: 2 });
  await client.resetConsumable('192.168.1.40', 'brush', 'side_right');
  await assert.rejects(() => client.resetConsumable('192.168.1.40', 'filter', 'none'), /400/);
  assert.deepEqual(network.requests.slice(1), [
    'PUT http://192.168.1.40/api/v2/robot/capabilities/BasicControlCapability',
    'PUT http://192.168.1.40/api/v2/robot/capabilities/MapSegmentationCapability',
    'PUT http://192.168.1.40/api/v2/robot/capabilities/ConsumableMonitoringCapability/brush/side_right',
    'PUT http://192.168.1.40/api/v2/robot/capabilities/ConsumableMonitoringCapability/filter',
  ]);
  assert.deepEqual(robot.commands[1].body, {
    action: 'start_segment_action',
    segment_ids: ['1', '3'],
    iterations: 2,
  });
  network.requests.length = 0;
  await assert.rejects(
    () => client.basicControl('192.168.1.40', 'dance'),
    (error) => error instanceof ValetudoError && error.status === 400,
  );
  await assert.rejects(() => client.robot('192.168.1.99'), /fetch failed/);
});

test('client: Basic authentication on every request when a user name is set', async () => {
  const robot = new FakeRobot({
    host: 'robot.lan:8080',
    systemId: 'A',
    auth: { username: 'u', password: 'p' },
  });
  const client = createValetudoClient({ fetch: fakeValetudoNetwork([robot]).fetch });
  await assert.rejects(
    () => client.capabilities('robot.lan:8080'),
    (error) => error instanceof ValetudoError && error.status === 401,
  );
  client.setCredentials('u', 'p');
  assert.ok((await client.capabilities('robot.lan:8080')).includes('BasicControlCapability'));
  client.setCredentials('', '');
  await assert.rejects(() => client.capabilities('robot.lan:8080'), /401/);
});

test('client: the attribute stream (SSE), split across chunks, keep-alives ignored', async () => {
  const lists = [];
  const parser = createSseParser((event, data) => lists.push([event, data]));
  parser.push(': sse-keep-alive\n');
  parser.push('event: StateAttributesUpdated\ndata: [{"__class":"Bat');
  parser.push('teryStateAttribute","level":50}]\n\n');
  parser.push('event: Other\r\ndata: 1\r\n\r\n');
  assert.deepEqual(lists, [
    ['StateAttributesUpdated', '[{"__class":"BatteryStateAttribute","level":50}]'],
    ['Other', '1'],
  ]);

  const encoder = new TextEncoder();
  const body = (async function* stream() {
    yield encoder.encode(
      'event: StateAttributesUpdated\ndata: [{"__class":"StatusStateAttribute",',
    );
    yield encoder.encode('"value":"cleaning"}]\n\nevent: StateAttributesUpdated\ndata: broken\n\n');
  })();
  const seen = [];
  const client = createValetudoClient({
    fetch: async (url, init) => {
      assert.equal(url, 'http://192.168.1.40/api/v2/robot/state/attributes/sse');
      assert.equal(init.headers.Accept, 'text/event-stream');
      return { ok: true, status: 200, body };
    },
  });
  await client.streamAttributes(
    '192.168.1.40',
    (list) => seen.push(list),
    new AbortController().signal,
  );
  assert.deepEqual(seen, [[{ __class: 'StatusStateAttribute', value: 'cleaning' }]]);
});

test('discovery: typed addresses and mDNS answers', () => {
  assert.equal(normalizeHost('http://192.168.1.40/'), '192.168.1.40');
  assert.equal(normalizeHost('192.168.1.40:80'), '192.168.1.40');
  assert.equal(normalizeHost('Robot.LAN:8080'), 'robot.lan:8080');
  assert.equal(normalizeHost('192.168.1.40:99999'), '');
  assert.equal(normalizeHost('not a host'), '');
  assert.deepEqual(parseHosts('192.168.1.40, robot.lan;192.168.1.40 nope!'), [
    '192.168.1.40',
    'robot.lan',
  ]);
  assert.equal(robotId('SmoothWeakPigeon'), 'smoothweakpigeon');
  const robot = new FakeRobot({
    host: '192.168.1.40',
    systemId: 'SmoothWeakPigeon',
    friendlyName: 'Salon',
  });
  const other = { ...mdnsAnswer(robot, '192.168.1.41'), port: 8080, txt: ['id=Other'] };
  assert.deepEqual(parseMdnsServices([mdnsAnswer(robot), other, { txt: [] }]), [
    {
      host: '192.168.1.40',
      systemId: 'SmoothWeakPigeon',
      name: 'Salon',
      model: 'D9',
      manufacturer: 'Dreame',
    },
    { host: '192.168.1.41:8080', systemId: 'Other', name: '', model: '', manufacturer: '' },
  ]);
});

test('map: rooms, and a valid transparent PNG within the widget limits', () => {
  assert.deepEqual(
    mapSegments(MAP).map((room) => [room.id, room.name, room.active]),
    [
      ['1', '', false],
      ['2', 'Bad', false],
      ['3', 'Flur', false],
      ['4', '', false],
      ['5', '', false],
      ['6', '', true],
    ],
  );
  const picture = renderMap(MAP);
  assert.ok(picture.width <= MAP_MAX_SIZE && picture.height <= MAP_MAX_SIZE);
  assert.deepEqual(validateWidgetImage(picture.png.toString('base64')), []);
  assert.equal(picture.png.readUInt32BE(16), picture.width);
  assert.equal(renderMap({ layers: [], entities: [] }), null);
  // A huge map is shrunk, not cut.
  const huge = renderMap({
    pixelSize: 5,
    layers: [{ type: 'floor', compressedPixels: [0, 0, 2000, 0, 1500, 10] }],
  });
  assert.ok(huge.width <= MAP_MAX_SIZE && huge.height <= MAP_MAX_SIZE);
});

test('png: a 2 x 2 image round-trips through zlib', () => {
  const png = encodePng({
    width: 2,
    height: 2,
    pixels: Uint8Array.from([0, 1, 1, 0]),
    palette: [
      [0, 0, 0],
      [255, 0, 0],
    ],
    transparent: 0,
  });
  const idat = png.indexOf('IDAT');
  const length = png.readUInt32BE(idat - 4);
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + length));
  assert.deepEqual([...raw], [0, 0, 1, 0, 1, 0]);
  assert.ok(png.includes('tRNS'));
});
