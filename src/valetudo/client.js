// -----------------------------------------------------------------------------
// Local HTTP client of a Valetudo robot.
//
// Valetudo (valetudo.cloud) replaces the cloud firmware of the robot:
// its REST API, documented by the robot itself (Swagger UI at
// `http://<robot>/swagger/`), is `http://<robot>/api/v2/...`, JSON in and
// out. Commands are `PUT` with a body like `{ "action": "start" }` and answer
// `200 OK` with no body. HTTP Basic authentication is optional (Settings →
// Connectivity → Auth settings in the Valetudo UI): the same user name and
// password are sent to every robot when they are set.
//
// Live changes come from Server-Sent Events
// (`GET /api/v2/robot/state/attributes/sse`, event `StateAttributesUpdated`,
// the data being the whole attribute list). Valetudo serves at most 5 SSE
// clients per stream: the integration opens one per robot.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 8000;
const MAP_TIMEOUT_MS = 15000;
const MAX_BODY = 8 * 1024 * 1024;

/** The robot answered, but refused (400 bad command, 401 credentials, 500 error). */
export class ValetudoError extends Error {
  constructor(path, status, detail = '') {
    super(`${path}: HTTP ${status}${detail ? ` ${detail}` : ''}`);
    this.name = 'ValetudoError';
    this.status = status;
  }
}

export const CAPABILITIES = {
  BASIC_CONTROL: 'BasicControlCapability',
  FAN_SPEED: 'FanSpeedControlCapability',
  WATER_USAGE: 'WaterUsageControlCapability',
  OPERATION_MODE: 'OperationModeControlCapability',
  SEGMENTS: 'MapSegmentationCapability',
  LOCATE: 'LocateCapability',
  CONSUMABLES: 'ConsumableMonitoringCapability',
  CURRENT_STATISTICS: 'CurrentStatisticsCapability',
  TOTAL_STATISTICS: 'TotalStatisticsCapability',
  MAPPING_PASS: 'MappingPassCapability',
  AUTO_EMPTY: 'AutoEmptyDockManualTriggerCapability',
  MOP_DOCK_CLEAN: 'MopDockCleanManualTriggerCapability',
  MOP_DOCK_DRY: 'MopDockDryManualTriggerCapability',
};

// Capability -> the `type` of its PresetSelectionStateAttribute.
export const PRESET_CAPABILITIES = {
  fan_speed: CAPABILITIES.FAN_SPEED,
  water_grade: CAPABILITIES.WATER_USAGE,
  operation_mode: CAPABILITIES.OPERATION_MODE,
};

/**
 * @description `host` or `host:port` as an URL base.
 * @param {string} host - `192.168.1.40`, `robot.lan:8080`, `[fd00::1]:80`.
 * @returns {string} `http://192.168.1.40`.
 */
export const baseUrl = (host) => `http://${host}`;

/**
 * @description Create the client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - fetch (tests: a fake network).
 * @param {number} [options.timeoutMs] - Timeout of one request.
 * @returns {object} The client.
 */
export function createValetudoClient({
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let auth = null;

  const headers = (extra = {}) => (auth ? { ...extra, Authorization: auth } : extra);

  const request = async (host, path, { method = 'GET', body, timeout = timeoutMs } = {}) => {
    const response = await fetch(`${baseUrl(host)}/api/v2${path}`, {
      method,
      headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new ValetudoError(path, response.status, raw.slice(0, 120).replace(/\s+/g, ' '));
    }
    if (raw.length > MAX_BODY) {
      throw new Error(`${path}: answer too large`);
    }
    if (raw.trim() === '' || raw.trim() === 'OK') {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`${path}: the answer is not JSON`);
    }
  };

  const get = (host, path, options) => request(host, path, options);
  const put = (host, path, body) => request(host, path, { method: 'PUT', body });
  const capability = (name) => `/robot/capabilities/${name}`;

  return {
    /**
     * @description Credentials for every robot (empty user name: none).
     * @param {string} username - User name.
     * @param {string} password - Password.
     */
    setCredentials(username, password) {
      auth = username
        ? `Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}`
        : null;
    },

    /** @returns {Promise<{ manufacturer, modelName, implementation }>} The robot. */
    robot: (host) => get(host, '/robot'),
    /** @returns {Promise<{ systemId, embedded }>} The Valetudo instance. */
    valetudo: (host) => get(host, '/valetudo'),
    /** @returns {Promise<{ release, commit }>} The Valetudo version. */
    version: (host) => get(host, '/valetudo/version'),
    /** @returns {Promise<{ friendlyName }>} The customizations (robot name). */
    customizations: (host) => get(host, '/valetudo/config/customizations'),
    /** @returns {Promise<string[]>} The capability names. */
    capabilities: (host) => get(host, '/robot/capabilities'),
    /** @returns {Promise<object[]>} The state attributes. */
    attributes: (host) => get(host, '/robot/state/attributes'),
    /** @returns {Promise<object>} The map (ValetudoMap v2). */
    map: (host) => get(host, '/robot/state/map', { timeout: MAP_TIMEOUT_MS }),
    /** @returns {Promise<object[]>} The stored Valetudo events. */
    events: (host) => get(host, '/events'),
    presets: (host, name) => get(host, `${capability(name)}/presets`),
    setPreset: (host, name, preset) => put(host, `${capability(name)}/preset`, { name: preset }),
    basicControl: (host, action) => put(host, capability(CAPABILITIES.BASIC_CONTROL), { action }),
    locate: (host) => put(host, capability(CAPABILITIES.LOCATE), { action: 'locate' }),
    segments: (host) => get(host, capability(CAPABILITIES.SEGMENTS)),
    segmentProperties: (host) => get(host, `${capability(CAPABILITIES.SEGMENTS)}/properties`),
    cleanSegments: (host, ids, { iterations = 1, customOrder = false } = {}) =>
      put(host, capability(CAPABILITIES.SEGMENTS), {
        action: 'start_segment_action',
        segment_ids: ids,
        iterations,
        ...(customOrder ? { customOrder: true } : {}),
      }),
    consumables: (host) => get(host, capability(CAPABILITIES.CONSUMABLES)),
    consumableProperties: (host) => get(host, `${capability(CAPABILITIES.CONSUMABLES)}/properties`),
    resetConsumable: (host, type, subType) =>
      put(
        host,
        `${capability(CAPABILITIES.CONSUMABLES)}/${encodeURIComponent(type)}${
          subType && subType !== 'none' ? `/${encodeURIComponent(subType)}` : ''
        }`,
        { action: 'reset' },
      ),
    currentStatistics: (host) => get(host, capability(CAPABILITIES.CURRENT_STATISTICS)),
    totalStatistics: (host) => get(host, capability(CAPABILITIES.TOTAL_STATISTICS)),
    startMapping: (host) =>
      put(host, capability(CAPABILITIES.MAPPING_PASS), { action: 'start_mapping' }),
    autoEmpty: (host) => put(host, capability(CAPABILITIES.AUTO_EMPTY), { action: 'trigger' }),
    mopDock: (host, which, action) =>
      put(
        host,
        capability(which === 'dry' ? CAPABILITIES.MOP_DOCK_DRY : CAPABILITIES.MOP_DOCK_CLEAN),
        { action },
      ),

    /**
     * @description Follow the attribute changes (Server-Sent Events) until
     * the stream ends or `signal` aborts.
     * @param {string} host - Robot address.
     * @param {Function} onAttributes - Called with each attribute list.
     * @param {AbortSignal} signal - Stops the stream.
     * @returns {Promise<void>} Resolves when the stream ends.
     */
    async streamAttributes(host, onAttributes, signal) {
      const response = await fetch(`${baseUrl(host)}/api/v2/robot/state/attributes/sse`, {
        headers: headers({ Accept: 'text/event-stream' }),
        signal,
      });
      if (!response.ok || !response.body) {
        throw new ValetudoError('/robot/state/attributes/sse', response.status);
      }
      const parser = createSseParser((event, data) => {
        if (event === 'StateAttributesUpdated') {
          try {
            onAttributes(JSON.parse(data));
          } catch {
            // A broken event is skipped; the next one carries the whole list.
          }
        }
      });
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        parser.push(decoder.decode(chunk, { stream: true }));
      }
    },
  };
}

/**
 * @description A Server-Sent Events parser (text/event-stream).
 * @param {Function} onEvent - `(event, data) => void`.
 * @returns {{ push: Function }} Feed it text chunks.
 */
export function createSseParser(onEvent) {
  let buffer = '';
  let event = 'message';
  let data = [];
  return {
    push(chunk) {
      buffer += chunk;
      if (buffer.length > MAX_BODY) {
        buffer = '';
        data = [];
        return;
      }
      let index;
      while ((index = buffer.search(/\r?\n/)) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + (buffer[index] === '\r' ? 2 : 1));
        if (line === '') {
          if (data.length > 0) {
            onEvent(event, data.join('\n'));
          }
          event = 'message';
          data = [];
        } else if (line.startsWith(':')) {
          // Comment (keep-alive).
        } else {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') {
            event = value;
          } else if (field === 'data') {
            data.push(value);
          }
        }
      }
    },
  };
}
