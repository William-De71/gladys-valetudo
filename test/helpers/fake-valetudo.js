// Test helpers: fake Valetudo robots behind a fake `fetch` (no socket is ever
// opened) and a silent logger.
//
// A FakeRobot answers the REST API of Valetudo 2026.x like the robot does
// (backend/lib/webserver/*Router.js): JSON for the reads, "OK" for the
// commands, 400 for a bad body, 401 without the right Basic credentials, and
// it records every command. Nothing starts on import (`node --test` runs this
// folder).

import { readFileSync } from 'node:fs';

export const MAP = JSON.parse(
  readFileSync(new URL('../fixtures/map.json', import.meta.url), 'utf8'),
);

const ALL_CAPABILITIES = [
  'BasicControlCapability',
  'FanSpeedControlCapability',
  'WaterUsageControlCapability',
  'MapSegmentationCapability',
  'LocateCapability',
  'ConsumableMonitoringCapability',
  'CurrentStatisticsCapability',
  'TotalStatisticsCapability',
  'MappingPassCapability',
  'AutoEmptyDockManualTriggerCapability',
];

export class FakeRobot {
  /**
   * @param {object} options - Options.
   * @param {string} options.host - Address (host or host:port).
   * @param {string} options.systemId - Valetudo system id.
   * @param {string} [options.friendlyName] - Name set in Valetudo.
   * @param {string[]} [options.capabilities] - Capabilities.
   * @param {object} [options.auth] - `{ username, password }` required.
   */
  constructor({
    host,
    systemId,
    friendlyName = '',
    capabilities = ALL_CAPABILITIES,
    auth = null,
    manufacturer = 'Dreame',
    modelName = 'D9',
  }) {
    Object.assign(this, {
      host,
      systemId,
      friendlyName,
      capabilities,
      auth,
      manufacturer,
      modelName,
    });
    this.status = { value: 'docked', flag: 'none' };
    this.battery = { level: 100, flag: 'charged' };
    this.presets = { fan_speed: 'medium', water_grade: 'low' };
    this.consumables = [
      {
        __class: 'ValetudoConsumable',
        type: 'brush',
        subType: 'main',
        remaining: { value: 12000, unit: 'minutes' },
      },
      {
        __class: 'ValetudoConsumable',
        type: 'brush',
        subType: 'side_right',
        remaining: { value: 8, unit: 'percent' },
      },
      {
        __class: 'ValetudoConsumable',
        type: 'filter',
        subType: 'main',
        remaining: { value: 600, unit: 'minutes' },
      },
      {
        __class: 'ValetudoConsumable',
        type: 'cleaning',
        subType: 'sensor',
        remaining: { value: 1200, unit: 'minutes' },
      },
    ];
    this.segments = [
      { __class: 'ValetudoMapSegment', id: '1', name: 'Cuisine' },
      { __class: 'ValetudoMapSegment', id: '2', name: 'Bad' },
      { __class: 'ValetudoMapSegment', id: '3', name: 'Séjour' },
    ];
    this.events = [];
    this.commands = [];
    this.unplugged = false;
  }

  attributes() {
    return [
      { __class: 'StatusStateAttribute', metaData: {}, ...this.status },
      { __class: 'BatteryStateAttribute', metaData: {}, ...this.battery },
      {
        __class: 'PresetSelectionStateAttribute',
        metaData: {},
        type: 'fan_speed',
        value: this.presets.fan_speed,
      },
      {
        __class: 'PresetSelectionStateAttribute',
        metaData: {},
        type: 'water_grade',
        value: this.presets.water_grade,
      },
      { __class: 'AttachmentStateAttribute', metaData: {}, type: 'dustbin', attached: true },
    ];
  }

  handle(method, path, body) {
    const has = (name) => this.capabilities.includes(name);
    const cap = /^\/api\/v2\/robot\/capabilities\/(\w+)(\/.*)?$/.exec(path);
    if (method === 'GET') {
      switch (path) {
        case '/api/v2/valetudo':
          return [200, { embedded: true, systemId: this.systemId, welcomeDialogDismissed: true }];
        case '/api/v2/valetudo/version':
          return [200, { release: '2026.10.0', commit: 'abc' }];
        case '/api/v2/valetudo/config/customizations':
          return [200, { friendlyName: this.friendlyName }];
        case '/api/v2/robot':
          return [
            200,
            { manufacturer: this.manufacturer, modelName: this.modelName, implementation: 'X' },
          ];
        case '/api/v2/robot/capabilities':
          return [200, this.capabilities];
        case '/api/v2/robot/state/attributes':
          return [200, this.attributes()];
        case '/api/v2/robot/state/map':
          return [200, MAP];
        case '/api/v2/events':
          return [200, this.events];
        default:
          break;
      }
      if (cap && has(cap[1])) {
        const [, name, rest = ''] = cap;
        if (name === 'FanSpeedControlCapability' && rest === '/presets') {
          return [200, ['low', 'medium', 'high', 'max']];
        }
        if (name === 'WaterUsageControlCapability' && rest === '/presets') {
          return [200, ['low', 'medium', 'high']];
        }
        if (name === 'ConsumableMonitoringCapability' && rest === '') {
          return [200, this.consumables];
        }
        if (name === 'ConsumableMonitoringCapability' && rest === '/properties') {
          return [
            200,
            {
              availableConsumables: [
                { type: 'brush', subType: 'main', unit: 'minutes', maxValue: 18000 },
                { type: 'filter', subType: 'main', unit: 'minutes', maxValue: 9000 },
                { type: 'cleaning', subType: 'sensor', unit: 'minutes' },
              ],
            },
          ];
        }
        if (name === 'MapSegmentationCapability' && rest === '') {
          return [200, this.segments];
        }
        if (name === 'MapSegmentationCapability' && rest === '/properties') {
          return [200, { iterationCount: { min: 1, max: 2 }, customOrderSupport: true }];
        }
        if (name === 'CurrentStatisticsCapability') {
          return [
            200,
            [
              { type: 'time', value: 1500 },
              { type: 'area', value: 214000 },
            ],
          ];
        }
        if (name === 'TotalStatisticsCapability') {
          return [
            200,
            [
              { type: 'time', value: 720000 },
              { type: 'area', value: 41200000 },
              { type: 'count', value: 187 },
            ],
          ];
        }
      }
      return [404, 'Not Found'];
    }
    if (method === 'PUT' && cap && has(cap[1])) {
      this.commands.push({ capability: cap[1], path: cap[2] ?? '', body });
      const [, name, rest = ''] = cap;
      if (name === 'BasicControlCapability') {
        if (!['start', 'stop', 'pause', 'home'].includes(body?.action)) {
          return [400, 'Bad Request'];
        }
        const next = { start: 'cleaning', stop: 'idle', pause: 'paused', home: 'returning' };
        this.status = { value: next[body.action], flag: 'none' };
        return [200, 'OK'];
      }
      if (rest === '/preset') {
        const type = name === 'FanSpeedControlCapability' ? 'fan_speed' : 'water_grade';
        this.presets[type] = body.name;
        return [200, 'OK'];
      }
      if (name === 'MapSegmentationCapability' && body?.action === 'start_segment_action') {
        this.status = { value: 'cleaning', flag: 'segment' };
        return [200, 'OK'];
      }
      if (name === 'ConsumableMonitoringCapability' && body?.action === 'reset') {
        const [, type, subType = 'none'] = rest.split('/');
        const item = this.consumables.find((c) => c.type === type && c.subType === subType);
        if (!item) {
          return [400, 'Bad Request'];
        }
        item.remaining =
          item.remaining.unit === 'percent'
            ? { value: 100, unit: 'percent' }
            : { value: 18000, unit: 'minutes' };
        return [200, 'OK'];
      }
      if (
        [
          'LocateCapability',
          'MappingPassCapability',
          'AutoEmptyDockManualTriggerCapability',
        ].includes(name)
      ) {
        return [200, 'OK'];
      }
      return [400, 'Bad Request'];
    }
    return [404, 'Not Found'];
  }
}

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  body: null,
  async text() {
    return typeof body === 'string' ? body : JSON.stringify(body);
  },
});

const refused = () =>
  Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });

/**
 * @description A network of fake robots.
 * @param {FakeRobot[]} robots - The robots.
 * @returns {object} `{ robots, fetch, requests, add }`.
 */
export function fakeValetudoNetwork(robots = []) {
  const network = {
    robots: new Map(robots.map((robot) => [robot.host, robot])),
    requests: [],
    add(robot) {
      network.robots.set(robot.host, robot);
    },
    async fetch(href, init = {}) {
      const url = new URL(href);
      network.requests.push(`${init.method ?? 'GET'} ${href}`);
      const robot = network.robots.get(url.host);
      if (!robot || robot.unplugged) {
        throw refused();
      }
      if (robot.auth) {
        const expected = `Basic ${Buffer.from(`${robot.auth.username}:${robot.auth.password}`).toString('base64')}`;
        if (init.headers?.Authorization !== expected) {
          return response(401, 'No credentials provided');
        }
      }
      const [status, body] = robot.handle(
        init.method ?? 'GET',
        url.pathname,
        init.body ? JSON.parse(init.body) : undefined,
      );
      return response(status, body);
    },
  };
  return network;
}

/**
 * @description The mDNS answer Gladys relays for a robot (scanNetwork).
 * @param {FakeRobot} robot - The robot.
 * @param {string} [ip] - Its IPv4 address.
 * @returns {object} `{ name, host, addresses, port, txt }`.
 */
export const mdnsAnswer = (robot, ip = robot.host) => ({
  name: `Valetudo ${robot.systemId}`,
  host: `valetudo-${robot.systemId.toLowerCase()}.local`,
  addresses: [ip, 'fe80::1'],
  port: 80,
  txt: [
    `id=${robot.systemId}`,
    `model=${robot.modelName}`,
    `manufacturer=${robot.manufacturer}`,
    'version=2026.10.0',
    ...(robot.friendlyName ? [`name=${robot.friendlyName}`] : []),
  ],
});

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
