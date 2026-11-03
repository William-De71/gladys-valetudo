// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and the fake Valetudo robot of the tests, on a map from the Valetudo
// test suite (test/fixtures/map.json). One made-up robot cleaning a room.
// Never real data.
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { createValetudoClient } = await load('src/valetudo/client.js');
const { memoryStorage } = await load('src/storage.js');
const { LANGUAGES } = await load('src/i18n.js');
const { FakeRobot, fakeValetudoNetwork, mdnsAnswer, silentLogger } = await load(
  'test/helpers/fake-valetudo.js',
);
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));

const robot = new FakeRobot({
  host: '192.168.1.40',
  systemId: 'SmoothWeakPigeon',
  friendlyName: 'Robot',
});
robot.segments = ['Kitchen', 'Bathroom', 'Hall', 'Bedroom', 'Office', 'Living room'].map(
  (name, index) => ({ __class: 'ValetudoMapSegment', id: String(index + 1), name }),
);
robot.status = { value: 'cleaning', flag: 'segment' };
robot.battery = { level: 64, flag: 'discharging' };
robot.presets = { fan_speed: 'high', water_grade: 'low' };
const network = fakeValetudoNetwork([robot]);
const gladys = createFakeGladys({
  config: { language: 'en' },
  scanResults: { mdns: [mdnsAnswer(robot)] },
});
const app = createApp(gladys, {
  client: createValetudoClient({ fetch: network.fetch }),
  storage: memoryStorage(),
  logger: silentLogger,
  streams: false,
});
await gladys.connect();
await app.start();
for (const device of gladys.fake.discoveredDevices) {
  await gladys.fake.deviceCreated(structuredClone(device));
}
await app.check();

const device = gladys.fake.discoveredDevices[0].external_id;
const CARDS = ['robot', 'map', 'maintenance'];
const contents = {};
const images = {};
for (const language of LANGUAGES) {
  contents[language] = {};
  for (const key of CARDS) {
    const ack = await gladys.fake.widgetGet(key, { settings: { device }, language });
    const content = ack.data.content;
    contents[language][key] = content;
    for (const component of content.components) {
      if (component.type === 'image' && !images[component.key]) {
        const picture = await gladys.fake.widgetGetImage(component.key);
        images[component.key] = `data:image/png;base64,${picture.data.image}`;
      }
    }
  }
}
await app.stop();

writeFileSync(
  out,
  JSON.stringify({
    contents,
    images,
    cards: Object.fromEntries(
      CARDS.map((key) => {
        const widget = manifest.widgets.find((item) => item.key === key);
        return [key, { icon: widget.icon, label: widget.label }];
      }),
    ),
  }),
);
