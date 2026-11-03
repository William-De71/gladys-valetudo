// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
//   discovery   mDNS (`_valetudo._tcp`, relayed by Gladys) + the addresses of
//               the configuration; only what answers the Valetudo API is
//               listed, identified by its Valetudo system id
//   live state  one Server-Sent Events stream per created robot (attribute
//               changes pushed by Valetudo), plus a check every minute that
//               also reads the Valetudo events (dust bin full…), the
//               consumables and the statistics
//   commands    Gladys features, scene actions, widget buttons -> local REST
//               requests (src/valetudo/client.js)
//   map         drawn as a PNG on demand for the map widget, kept a while
//
// The robots seen are kept in /data so a restart follows them at once,
// without waiting for a search.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { DEVICE_TRANSPORTS, logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  buildDevice,
  consumableKey,
  consumableName,
  deviceName,
  FEATURE_KEYS,
  featureValues,
  PRESET_FEATURES,
} from './devices.js';
import { LANGUAGES, t, text, truncate, truncateAll } from './i18n.js';
import { ATTENTION_REASONS, CONTROL_COMMANDS, SCENE_ACTIONS, SCENE_TRIGGERS } from './scenes.js';
import { createStatePublisher } from './states.js';
import { createStorage } from './storage.js';
import { isWorking, readAttributes, VACUUM_MODE } from './valetudo/attributes.js';
import {
  CAPABILITIES,
  createValetudoClient,
  PRESET_CAPABILITIES,
  ValetudoError,
} from './valetudo/client.js';
import { normalizeHost, parseMdnsServices, robotId } from './valetudo/discovery.js';
import { mapSegments, renderMap } from './valetudo/map.js';
import {
  buildMaintenanceWidget,
  buildMapWidget,
  buildRobotWidget,
  WIDGET_ACTIONS,
  WIDGETS,
} from './widgets.js';

export const ACTIONS = { TEST: 'test_connection' };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const FAILURES_BEFORE_UNREACHABLE = 2;
const CHECK_EVERY_MS = MINUTE;
const RESCAN_SPACING_MS = 5 * MINUTE;
const RESCAN_EVERY_MS = 60 * MINUTE;
const STREAM_RETRY_MS = 15 * SECOND;
const STREAM_RETRY_MAX_MS = 5 * MINUTE;
const CONSUMABLES_EVERY_MS = 10 * MINUTE;
const TOTALS_EVERY_MS = 30 * MINUTE;
const MAP_REFRESH_MS = 30 * SECOND;
const MAP_CACHE = 12;
const COMMAND_REFRESH_MS = 2 * SECOND;
const WIDGET_REFRESH_SPACING_MS = 11 * SECOND;
const MDNS_SECONDS = 5;
const SEEN_EVENTS_LIMIT = 200;
const MAX_MESSAGE = 1800;

const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * @description The statistics of a capability as `{ area (m²), time (s), count }`.
 * @param {Array<{ type, value }>} points - ValetudoDataPoint list.
 * @returns {{ area: number|null, time: number|null, count: number|null }} The values.
 */
export function readStatistics(points) {
  const result = { area: null, time: null, count: null };
  for (const point of Array.isArray(points) ? points : []) {
    const value = Number(point?.value);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (point.type === 'area') {
      result.area = Math.round(value / 1000) / 10; // cm² -> m², one decimal
    } else if (point.type === 'time') {
      result.time = value;
    } else if (point.type === 'count') {
      result.count = value;
    }
  }
  return result;
}

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies.
 * @param {object} [deps.client] - src/valetudo/client.js client (tests: fake robots).
 * @param {object} [deps.storage] - src/storage.js storage.
 * @param {object} [deps.logger] - Logger.
 * @param {Function} [deps.now] - Clock (ms).
 * @param {boolean} [deps.streams] - Open the SSE streams (off in most tests).
 * @returns {object} `{ start, stop, check, scan, … }`.
 */
export function createApp(
  gladys,
  {
    client = createValetudoClient(),
    storage = createStorage(),
    logger = sdkLogger,
    now = Date.now,
    streams = true,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  let checkTimer = null;
  let rescanTimer = null;
  let stopped = false;
  let checking = null;
  let scanning = null;
  let lastScanAt = 0;
  let mdnsError = null;
  let statusKey = '';
  const entries = new Map(); // robot id -> entry
  const created = new Set(); // device external ids
  const transports = new Map();
  const widgetRefresh = new Map();
  const mapImages = new Map(); // image key -> base64 PNG

  const states = createStatePublisher(gladys, {
    logger,
    now,
    isCreated: (externalId) => created.has(externalId),
  });

  const safely = (task, what) =>
    Promise.resolve()
      .then(task)
      .catch((error) => logger.warn(`Valetudo: ${what} failed: ${error?.message ?? error}`));

  const errorText = (error) => truncate(error?.message ?? error, 120);
  const isAuthError = (error) =>
    error instanceof ValetudoError && [401, 403].includes(error.status);

  // --- Widgets, transports, status ---------------------------------------------------

  const refreshWidget = (key) => {
    const slot = widgetRefresh.get(key) ?? { at: 0, timer: null };
    widgetRefresh.set(key, slot);
    const wait = slot.at + WIDGET_REFRESH_SPACING_MS - now();
    if (wait <= 0) {
      slot.at = now();
      safely(() => gladys.requestWidgetRefresh(key), 'widget refresh');
    } else if (!slot.timer) {
      slot.timer = setTimeout(() => {
        slot.timer = null;
        refreshWidget(key);
      }, wait);
      slot.timer.unref?.();
    }
  };
  const refreshWidgets = (keys = Object.values(WIDGETS)) => keys.forEach(refreshWidget);

  const publishTransport = (entry, force = false) => {
    if (!created.has(entry.deviceId)) {
      return;
    }
    const transport = entry.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    if (!force && transports.get(entry.deviceId) === transport) {
      return;
    }
    transports.set(entry.deviceId, transport);
    safely(
      () => gladys.publishTransports([{ external_id: entry.deviceId, transport }]),
      'transport badge',
    );
  };

  const nameOf = (entry) => entry.gladysName || deviceName(entry);

  const publishStatus = () => {
    // The created robots once there are some, every robot found before.
    const identified = [...entries.values()].filter((entry) => entry.identified);
    const mine = identified.filter((entry) => created.has(entry.deviceId));
    const known = mine.length > 0 ? mine : identified;
    const answering = known.filter((entry) => entry.reachable);
    let key;
    let connected;
    let message;
    if ([...entries.values()].some((entry) => entry.authFailed)) {
      [key, connected, message] = ['auth', false, t('statusAuth')];
    } else if (known.length === 0) {
      [key, connected, message] = ['none', false, t('statusNone')];
    } else if (answering.length === 0) {
      key = `off:${known.length}`;
      [connected, message] = [false, t('statusAllUnreachable', { count: known.length })];
    } else {
      key = `ok:${answering.length}:${known.length}`;
      connected = true;
      message = t('statusConnected', { count: answering.length, total: known.length });
    }
    if (key !== statusKey) {
      statusKey = key;
      safely(() => gladys.setConnectionStatus(connected, message), 'status');
    }
  };

  // --- Entries -------------------------------------------------------------------------

  const persist = () =>
    safely(
      () =>
        storage.write(
          'robots.json',
          Object.fromEntries(
            [...entries.values()]
              .filter((entry) => entry.identified)
              .map((entry) => [
                entry.id,
                {
                  host: entry.host,
                  systemId: entry.systemId,
                  friendlyName: entry.friendlyName,
                  manufacturer: entry.manufacturer,
                  model: entry.model,
                },
              ]),
          ),
        ),
      'saving the robots',
    );

  const pushStates = (entry) => {
    const ids = gladys.externalIds('device', entry.id);
    for (const [key, value] of featureValues(entry)) {
      states.push(ids.feature(key), value);
    }
  };

  const entryOf = ({ id, host, systemId = '' }) => {
    let entry = entries.get(id);
    if (!entry) {
      entry = {
        id,
        deviceId: gladys.externalIds('device', id).device,
        host,
        systemId,
        friendlyName: '',
        manufacturer: '',
        model: '',
        version: '',
        typed: false,
        identified: false,
        reachable: null,
        authFailed: false,
        failures: 0,
        capabilities: new Set(),
        presets: {},
        segments: [],
        iterations: { min: 1, max: 1 },
        customOrder: false,
        consumables: [],
        consumableMeta: [],
        consumablesAt: 0,
        snapshot: null,
        current: { area: null, time: null },
        total: { area: null, time: null, count: null },
        totalsAt: 0,
        seenEvents: new Set(),
        eventsPrimed: false,
        stream: null,
        map: null,
        gladysName: '',
      };
      entries.set(id, entry);
    } else {
      if (host && entry.host !== host) {
        logger.info(`Valetudo: ${id} moved from ${entry.host} to ${host}`);
        entry.host = host;
        restartStream(entry);
      }
      entry.systemId ||= systemId;
    }
    return entry;
  };

  const sceneEvent = (entry, key, data = {}) => {
    if (!created.has(entry.deviceId)) {
      return;
    }
    safely(
      () =>
        gladys.publishSceneEvent(key, {
          device: entry.deviceId,
          name: truncate(nameOf(entry), 200),
          ...data,
        }),
      `scene event ${key}`,
    );
  };

  const setReachable = (entry, reachable) => {
    if (entry.reachable === reachable) {
      return;
    }
    const before = entry.reachable;
    entry.reachable = reachable;
    if (before === true && reachable === false) {
      sceneEvent(entry, SCENE_TRIGGERS.UNREACHABLE, { host: entry.host });
    } else if (before === false && reachable === true) {
      sceneEvent(entry, SCENE_TRIGGERS.REACHABLE_AGAIN, { host: entry.host });
    }
    publishTransport(entry);
    publishStatus();
    refreshWidgets();
  };

  const markSuccess = (entry) => {
    entry.failures = 0;
    if (entry.authFailed) {
      entry.authFailed = false;
      statusKey = '';
    }
    setReachable(entry, true);
  };

  const markFailure = (entry, error) => {
    if (stopped) {
      return;
    }
    if (isAuthError(error)) {
      // It answers: the credentials are wrong, not the network.
      entry.authFailed = true;
      entry.failures = 0;
      setReachable(entry, true);
      publishStatus();
      return;
    }
    entry.failures += 1;
    logger.debug?.(`Valetudo: ${entry.host} failed (${entry.failures}): ${errorText(error)}`);
    if (entry.failures >= FAILURES_BEFORE_UNREACHABLE || entry.reachable === null) {
      setReachable(entry, false);
      requestRescan();
    }
  };

  // --- Live state ---------------------------------------------------------------------------

  const finishedData = async (entry, status) => {
    let current = entry.current;
    if (entry.capabilities.has(CAPABILITIES.CURRENT_STATISTICS)) {
      try {
        current = toCurrent(readStatistics(await client.currentStatistics(entry.host)));
        entry.current = current;
      } catch (error) {
        logger.debug?.(`Valetudo: no statistics from ${entry.host}: ${errorText(error)}`);
      }
    }
    return {
      status,
      area_m2: current.area ?? 0,
      duration_min: current.time ?? 0,
    };
  };

  /** Apply a new attribute list: states, widgets, scene events. */
  const applyAttributes = (entry, attributes) => {
    const snapshot = readAttributes(attributes);
    const before = entry.snapshot;
    entry.snapshot = snapshot;
    pushStates(entry);
    const previous = before?.status ?? null;
    const status = snapshot.status;
    if (previous && status && previous !== status) {
      if (!isWorking(previous) && isWorking(status)) {
        entry.current = { area: null, time: null };
        sceneEvent(entry, SCENE_TRIGGERS.CLEANING_STARTED, {
          mode: snapshot.flag === 'mapping' ? 'mapping' : 'cleaning',
          task: snapshot.flag ?? 'none',
        });
      } else if (isWorking(previous) && !isWorking(status) && status !== 'error') {
        safely(async () => {
          const data = await finishedData(entry, status);
          sceneEvent(entry, SCENE_TRIGGERS.CLEANING_FINISHED, data);
          refreshWidgets([WIDGETS.ROBOT]);
        }, 'end of cleaning');
      }
      if (status === 'error') {
        sceneEvent(entry, SCENE_TRIGGERS.ERROR, {
          message: truncate(snapshot.error || text('widgetErrorUnknown', config.language), 500),
        });
      }
    }
    const changed =
      !before ||
      before.status !== snapshot.status ||
      before.flag !== snapshot.flag ||
      before.battery !== snapshot.battery ||
      before.batteryFlag !== snapshot.batteryFlag ||
      before.error !== snapshot.error ||
      JSON.stringify(before.presets) !== JSON.stringify(snapshot.presets);
    if (changed) {
      refreshWidgets([WIDGETS.ROBOT]);
    }
    if (before?.status !== snapshot.status) {
      refreshWidgets([WIDGETS.MAP]);
    }
  };

  const readAttributesOf = async (entry) => {
    try {
      applyAttributes(entry, await client.attributes(entry.host));
      markSuccess(entry);
      return true;
    } catch (error) {
      markFailure(entry, error);
      return false;
    }
  };

  function stopStream(entry) {
    if (entry.stream) {
      entry.stream.controller.abort();
      clearTimeout(entry.stream.timer);
      entry.stream = null;
    }
  }

  function startStream(entry) {
    if (!streams || stopped || entry.stream || !created.has(entry.deviceId)) {
      return;
    }
    const stream = { controller: new AbortController(), timer: null, delay: STREAM_RETRY_MS };
    entry.stream = stream;
    const run = async () => {
      if (stopped || entry.stream !== stream) {
        return;
      }
      try {
        await client.streamAttributes(
          entry.host,
          (attributes) => {
            stream.delay = STREAM_RETRY_MS;
            markSuccess(entry);
            applyAttributes(entry, attributes);
          },
          stream.controller.signal,
        );
      } catch (error) {
        if (stream.controller.signal.aborted) {
          return;
        }
        logger.debug?.(`Valetudo: stream of ${entry.host} closed: ${errorText(error)}`);
        // The stream is a convenience: the robot is unreachable only when a plain request fails.
        await readAttributesOf(entry);
      }
      if (stopped || entry.stream !== stream || stream.controller.signal.aborted) {
        return;
      }
      stream.timer = setTimeout(run, stream.delay);
      stream.timer.unref?.();
      stream.delay = Math.min(STREAM_RETRY_MAX_MS, stream.delay * 2);
    };
    run();
  }

  function restartStream(entry) {
    if (entry.stream) {
      stopStream(entry);
      startStream(entry);
    }
  }

  // --- Details ------------------------------------------------------------------------------

  const toCurrent = ({ area, time }) => ({
    area,
    time: Number.isFinite(time) ? Math.round(time / 60) : null,
  });

  const optional = async (task, fallback) => {
    try {
      return await task();
    } catch (error) {
      if (isAuthError(error)) {
        throw error;
      }
      return fallback;
    }
  };

  const loadConsumables = async (entry) => {
    if (!entry.capabilities.has(CAPABILITIES.CONSUMABLES)) {
      return;
    }
    const list = await optional(() => client.consumables(entry.host), null);
    if (Array.isArray(list)) {
      entry.consumables = list.filter((item) => typeof item?.type === 'string');
      entry.consumablesAt = now();
    }
  };

  const loadTotals = async (entry) => {
    if (!entry.capabilities.has(CAPABILITIES.TOTAL_STATISTICS)) {
      return;
    }
    const points = await optional(() => client.totalStatistics(entry.host), null);
    if (points) {
      const { area, time, count } = readStatistics(points);
      entry.total = {
        area: area === null ? null : Math.round(area),
        time: Number.isFinite(time) ? Math.round(time / 3600) : null,
        count,
      };
      entry.totalsAt = now();
    }
  };

  const loadSegments = async (entry) => {
    if (!entry.capabilities.has(CAPABILITIES.SEGMENTS)) {
      entry.segments = [];
      return;
    }
    const list = await optional(() => client.segments(entry.host), null);
    if (Array.isArray(list)) {
      entry.segments = list
        .filter((segment) => segment?.id !== undefined)
        .map((segment) => ({ id: String(segment.id), name: String(segment.name ?? '').trim() }));
    }
  };

  /**
   * Ask a robot who it is and what it can do. Throws when it does not answer
   * the Valetudo API.
   */
  const identify = async (host) => {
    const valetudo = await client.valetudo(host);
    const id = robotId(valetudo?.systemId);
    if (!id) {
      throw new Error('no Valetudo system id');
    }
    const [robot, customizations, version, capabilities] = await Promise.all([
      optional(() => client.robot(host), {}),
      optional(() => client.customizations(host), {}),
      optional(() => client.version(host), {}),
      client.capabilities(host),
    ]);
    return {
      id,
      systemId: String(valetudo.systemId),
      manufacturer: String(robot?.manufacturer ?? '').trim(),
      model: String(robot?.modelName ?? '').trim(),
      friendlyName: String(customizations?.friendlyName ?? '').trim(),
      version: String(version?.release ?? ''),
      capabilities: new Set(Array.isArray(capabilities) ? capabilities.map(String) : []),
    };
  };

  /** Everything the features and widgets need, after `identify`. */
  const loadDetails = async (entry) => {
    for (const [type, capability] of Object.entries(PRESET_CAPABILITIES)) {
      if (entry.capabilities.has(capability)) {
        const presets = await optional(() => client.presets(entry.host, capability), []);
        entry.presets[type] = Array.isArray(presets) ? presets.map(String) : [];
      } else {
        delete entry.presets[type];
      }
    }
    if (entry.capabilities.has(CAPABILITIES.CONSUMABLES)) {
      const properties = await optional(() => client.consumableProperties(entry.host), {});
      entry.consumableMeta = Array.isArray(properties?.availableConsumables)
        ? properties.availableConsumables
        : [];
    }
    if (entry.capabilities.has(CAPABILITIES.SEGMENTS)) {
      const properties = await optional(() => client.segmentProperties(entry.host), {});
      const min = Number(properties?.iterationCount?.min);
      const max = Number(properties?.iterationCount?.max);
      entry.iterations = {
        min: Number.isFinite(min) && min >= 1 ? min : 1,
        max: Number.isFinite(max) && max >= 1 ? max : 1,
      };
      entry.customOrder = properties?.customOrderSupport === true;
    }
    await loadConsumables(entry);
    await loadSegments(entry);
    await loadTotals(entry);
    await readAttributesOf(entry);
  };

  // --- Discovery -------------------------------------------------------------------------

  const discovered = () =>
    [...entries.values()]
      .filter((entry) => entry.identified)
      .map((entry) => buildDevice(gladys, entry, config.language));

  const publishDiscovered = () =>
    safely(() => gladys.publishDiscoveredDevices(discovered()), 'discovery');

  const probe = async (candidate) => {
    let info;
    try {
      info = await identify(candidate.host);
    } catch (error) {
      const known = [...entries.values()].find((entry) => entry.host === candidate.host);
      if (known) {
        markFailure(known, error);
      } else if (isAuthError(error)) {
        // A robot that refuses the credentials: say it in the status.
        const entry = entryOf({
          id: `host-${fold(candidate.host).replace(/[^a-z0-9]/g, '-')}`,
          host: candidate.host,
        });
        entry.authFailed = true;
        entry.typed = candidate.typed;
        entry.pendingAuth = true;
      }
      logger.debug?.(`Valetudo: ${candidate.host} is not a Valetudo robot: ${errorText(error)}`);
      return null;
    }
    for (const [id, entry] of entries) {
      if (entry.pendingAuth && entry.host === candidate.host) {
        entries.delete(id);
      }
    }
    const entry = entryOf({ id: info.id, host: candidate.host, systemId: info.systemId });
    Object.assign(entry, {
      manufacturer: info.manufacturer,
      model: info.model,
      friendlyName: info.friendlyName || candidate.name || entry.friendlyName,
      version: info.version,
      capabilities: info.capabilities,
      typed: candidate.typed,
      identified: true,
    });
    markSuccess(entry);
    await loadDetails(entry);
    return entry;
  };

  const scanOnce = async () => {
    lastScanAt = now();
    const candidates = []; // { host, name, typed }
    mdnsError = null;
    if (config.mdns) {
      try {
        const services = await gladys.scanNetwork('mdns', { timeoutSeconds: MDNS_SECONDS });
        for (const robot of parseMdnsServices(services)) {
          candidates.push({ host: robot.host, name: robot.name, typed: false });
        }
      } catch (error) {
        mdnsError = errorText(error);
        logger.warn(`Valetudo: the mDNS search failed: ${mdnsError}`);
      }
    }
    for (const host of config.hosts) {
      if (!candidates.some((candidate) => candidate.host === host)) {
        candidates.push({ host, name: '', typed: true });
      }
    }
    // The robots known from before, at their last address (a restart, mDNS off).
    for (const entry of entries.values()) {
      if (entry.identified && !candidates.some((candidate) => candidate.host === entry.host)) {
        candidates.push({ host: entry.host, name: '', typed: entry.typed });
      }
    }
    for (const [id, entry] of entries) {
      if (entry.pendingAuth) {
        entries.delete(id);
      }
    }
    const found = (await Promise.all(candidates.map((candidate) => probe(candidate)))).filter(
      Boolean,
    );
    persist();
    await publishDiscovered();
    publishStatus();
    entries.forEach((entry) => startStream(entry));
    refreshWidgets();
    return found;
  };

  /** Run a search, or join the one running. */
  const scan = () => {
    if (!scanning) {
      scanning = scanOnce().finally(() => {
        scanning = null;
      });
    }
    return scanning;
  };

  function requestRescan() {
    if (stopped || scanning || now() - lastScanAt < RESCAN_SPACING_MS) {
      return;
    }
    safely(() => scan(), 'search');
  }

  // --- Periodic check -----------------------------------------------------------------------

  const readEvents = async (entry) => {
    const events = await optional(() => client.events(entry.host), null);
    if (!Array.isArray(events)) {
      return;
    }
    for (const event of events) {
      const reason = ATTENTION_REASONS[event?.__class];
      if (!reason || !event.id || entry.seenEvents.has(event.id)) {
        continue;
      }
      entry.seenEvents.add(event.id);
      // The events stored before the integration started are not news.
      if (!entry.eventsPrimed || event.processed === true) {
        continue;
      }
      const consumable =
        reason === 'consumable_depleted'
          ? consumableName({ type: event.type, subType: event.subType }, config.language)
          : '';
      sceneEvent(entry, SCENE_TRIGGERS.ATTENTION_NEEDED, {
        reason,
        message: truncate(
          text(`attention_${reason}`, config.language, {
            consumable,
            message: String(event.message ?? '').trim(),
          }),
          500,
        ),
        consumable,
      });
    }
    entry.eventsPrimed = true;
    if (entry.seenEvents.size > SEEN_EVENTS_LIMIT) {
      entry.seenEvents = new Set([...entry.seenEvents].slice(-SEEN_EVENTS_LIMIT / 2));
    }
  };

  const checkEntry = async (entry) => {
    if (!(await readAttributesOf(entry))) {
      return;
    }
    await safely(() => readEvents(entry), 'events');
    const working = isWorking(entry.snapshot?.status);
    if (working && entry.capabilities.has(CAPABILITIES.CURRENT_STATISTICS)) {
      const points = await optional(() => client.currentStatistics(entry.host), null);
      if (points) {
        entry.current = toCurrent(readStatistics(points));
        refreshWidgets([WIDGETS.ROBOT]);
      }
    }
    if (now() - entry.consumablesAt >= CONSUMABLES_EVERY_MS) {
      const before = JSON.stringify(entry.consumables);
      await safely(() => loadConsumables(entry), 'consumables');
      pushStates(entry);
      if (before !== JSON.stringify(entry.consumables)) {
        refreshWidgets([WIDGETS.MAINTENANCE]);
      }
    }
    if (now() - entry.totalsAt >= TOTALS_EVERY_MS) {
      await safely(() => loadTotals(entry), 'statistics');
    }
  };

  const checkOnce = async () => {
    const targets = [...entries.values()].filter(
      (entry) => entry.identified && created.has(entry.deviceId),
    );
    await Promise.all(targets.map((entry) => checkEntry(entry)));
    publishStatus();
  };

  const check = () => {
    if (!checking) {
      checking = checkOnce().finally(() => {
        checking = null;
      });
    }
    return checking;
  };

  const schedule = () => {
    clearInterval(checkTimer);
    clearInterval(rescanTimer);
    checkTimer = null;
    rescanTimer = null;
    if (stopped) {
      return;
    }
    checkTimer = setInterval(() => safely(() => check(), 'check'), CHECK_EVERY_MS);
    checkTimer.unref?.();
    rescanTimer = setInterval(() => safely(() => scan(), 'search'), RESCAN_EVERY_MS);
    rescanTimer.unref?.();
  };

  // --- Commands ----------------------------------------------------------------------------

  const userError = (key, vars = {}) => new Error(text(key, config.language, vars));

  const entryFor = (externalId) => {
    const deviceId = String(externalId ?? '');
    const entry = [...entries.values()].find(
      (candidate) =>
        candidate.identified &&
        (candidate.deviceId === deviceId || deviceId.startsWith(`${candidate.deviceId}:`)),
    );
    if (!entry) {
      throw userError('errorUnknownDevice');
    }
    return entry;
  };

  const requireCapability = (entry, capability) => {
    if (!entry.capabilities.has(capability)) {
      throw userError('errorNoCapability', { name: nameOf(entry), capability });
    }
  };

  const refreshSoon = (entry) => {
    const timer = setTimeout(
      () => safely(() => readAttributesOf(entry), 'refresh after a command'),
      COMMAND_REFRESH_MS,
    );
    timer.unref?.();
  };

  /** Run requests on a robot, mapping errors to user texts. */
  const command = async (entry, task) => {
    try {
      const result = await task();
      markSuccess(entry);
      refreshSoon(entry);
      return result;
    } catch (error) {
      if (isAuthError(error)) {
        markFailure(entry, error);
        throw userError('errorAuth', { name: nameOf(entry) });
      }
      if (error instanceof ValetudoError) {
        throw userError('errorRefused', { name: nameOf(entry), error: errorText(error) });
      }
      markFailure(entry, error);
      throw userError('errorUnreachable', { name: nameOf(entry), error: errorText(error) });
    }
  };

  const basic = (entry, action) => {
    requireCapability(entry, CAPABILITIES.BASIC_CONTROL);
    return command(entry, () => client.basicControl(entry.host, action));
  };

  const setPreset = async (entry, presetType, value) => {
    const capability = PRESET_CAPABILITIES[presetType];
    requireCapability(entry, capability);
    const presets = entry.presets[presetType] ?? [];
    const preset = String(value ?? '').trim();
    if (!presets.includes(preset)) {
      throw userError('errorPreset', {
        name: nameOf(entry),
        value: truncate(preset, 30),
        list: presets.join(', '),
      });
    }
    await command(entry, () => client.setPreset(entry.host, capability, preset));
  };

  const runCommand = async (entry, name) => {
    switch (name) {
      case 'start':
      case 'pause':
      case 'stop':
      case 'home':
        return basic(entry, name);
      case 'locate':
        requireCapability(entry, CAPABILITIES.LOCATE);
        return command(entry, () => client.locate(entry.host));
      case 'auto_empty':
        requireCapability(entry, CAPABILITIES.AUTO_EMPTY);
        return command(entry, () => client.autoEmpty(entry.host));
      case 'mop_dock_clean':
        requireCapability(entry, CAPABILITIES.MOP_DOCK_CLEAN);
        return command(entry, () => client.mopDock(entry.host, 'clean', 'start'));
      case 'mop_dock_dry':
        requireCapability(entry, CAPABILITIES.MOP_DOCK_DRY);
        return command(entry, () => client.mopDock(entry.host, 'dry', 'start'));
      default:
        throw userError('errorCommand', { command: truncate(name, 30) });
    }
  };

  /** Find rooms by number or name (accents and case ignored). */
  const findRooms = async (entry, wanted) => {
    requireCapability(entry, CAPABILITIES.SEGMENTS);
    if (entry.segments.length === 0) {
      await command(entry, () => loadSegments(entry));
    }
    const rooms = [];
    for (const name of wanted) {
      const key = fold(name);
      const room =
        entry.segments.find((segment) => segment.id === name.trim()) ??
        entry.segments.find((segment) => fold(segment.name) === key);
      if (!room) {
        throw userError('errorUnknownRoom', {
          room: truncate(name, 40),
          name: nameOf(entry),
          list: truncate(
            entry.segments.map((segment) => segment.name || segment.id).join(', '),
            300,
          ),
        });
      }
      if (!rooms.includes(room)) {
        rooms.push(room);
      }
    }
    return rooms;
  };

  const cleanRooms = async (entry, rooms, iterations) => {
    const passes = Math.min(
      entry.iterations.max,
      Math.max(entry.iterations.min, Math.round(Number(iterations) || 1)),
    );
    await command(entry, () =>
      client.cleanSegments(
        entry.host,
        rooms.map((room) => room.id),
        { iterations: passes, customOrder: entry.customOrder },
      ),
    );
  };

  gladys.onSetValue(async (device, feature, value) => {
    const entry = entryFor(device.external_id);
    const key = String(feature.external_id).split(':').pop();
    if (key === FEATURE_KEYS.RUN_MODE) {
      const mode = Number(value);
      if (mode === VACUUM_MODE.MAPPING) {
        requireCapability(entry, CAPABILITIES.MAPPING_PASS);
        await command(entry, () => client.startMapping(entry.host));
      } else if (mode === VACUUM_MODE.CLEANING) {
        await basic(entry, 'start');
      } else {
        await basic(entry, 'stop');
      }
    } else if (key === FEATURE_KEYS.DOCK) {
      await basic(entry, 'home');
    } else if (PRESET_FEATURES[key]) {
      await setPreset(entry, PRESET_FEATURES[key], value);
    } else {
      throw userError('errorUnknownFeature', { key });
    }
  });

  // --- Device events ---------------------------------------------------------------------------

  const trackCreated = (device) => {
    if (!device?.external_id) {
      return null;
    }
    created.add(device.external_id);
    const id = String(device.external_id).split(':').pop();
    const param = (name) => device.params?.find?.((item) => item.name === name)?.value;
    const host = entries.get(id)?.host ?? normalizeHost(param('VALETUDO_HOST'));
    if (!host) {
      return null;
    }
    const entry = entryOf({ id, host, systemId: String(param('VALETUDO_SYSTEM_ID') ?? '') });
    entry.identified = true;
    entry.gladysName = device.name ?? entry.gladysName;
    return entry;
  };

  gladys.onDeviceCreated(async (device) => {
    const entry = trackCreated(device);
    if (entry) {
      // States published before the creation were thrown away by Gladys.
      states.republish(entry.deviceId);
      pushStates(entry);
      publishTransport(entry, true);
      startStream(entry);
      publishStatus();
    }
    refreshWidgets();
  });

  gladys.onDeviceUpdated(async (device) => {
    const entry = trackCreated(device);
    if (entry) {
      states.republish(entry.deviceId);
    }
    refreshWidgets();
  });

  gladys.onDeviceDeleted(async (device) => {
    if (device?.external_id) {
      created.delete(device.external_id);
      transports.delete(device.external_id);
      states.forget(device.external_id);
      const entry = [...entries.values()].find(
        (candidate) => candidate.deviceId === device.external_id,
      );
      if (entry) {
        stopStream(entry);
      }
    }
    publishStatus();
    refreshWidgets();
  });

  gladys.onScanRequest(async () => {
    await scan();
  });

  gladys.onConfigUpdated(async (raw) => {
    const previous = config;
    config = normalizeConfig(raw ?? {});
    client.setCredentials(config.username, config.password);
    const credentials =
      previous.username !== config.username || previous.password !== config.password;
    if (credentials) {
      entries.forEach((entry) => restartStream(entry));
    }
    if (
      credentials ||
      previous.hosts.join(',') !== config.hosts.join(',') ||
      previous.mdns !== config.mdns
    ) {
      await scan();
    } else if (previous.language !== config.language) {
      await publishDiscovered();
    }
  });

  // --- Configuration button ------------------------------------------------------------------------

  gladys.onAction(ACTIONS.TEST, async () => {
    await scan();
    const known = [...entries.values()].filter((entry) => entry.identified || entry.pendingAuth);
    const mdns = mdnsError ? t('testMdnsError', { error: mdnsError }) : null;
    const withMdns = (message) =>
      mdns
        ? Object.fromEntries(
            LANGUAGES.map((language) => [language, `${message[language]} ${mdns[language]}`]),
          )
        : message;
    if (known.length === 0) {
      return truncateAll(withMdns(t('testNone')), MAX_MESSAGE);
    }
    const message = {};
    for (const language of LANGUAGES) {
      const list = known
        .map((entry) => {
          const details = [entry.host];
          if (entry.typed) {
            details.push(text('testTyped', language));
          }
          if (entry.authFailed) {
            details.push(text('testAuth', language));
          } else if (!entry.reachable) {
            details.push(text('testUnreachable', language));
          } else if (Number.isFinite(entry.snapshot?.battery)) {
            details.push(text('testBattery', language, { value: entry.snapshot.battery }));
          }
          const label = entry.pendingAuth ? entry.host : nameOf(entry);
          return `${label} (${details.join(', ')})`;
        })
        .join(' ; ');
      message[language] = text('testOk', language, { count: known.length, list });
    }
    return truncateAll(withMdns(message), MAX_MESSAGE);
  });

  // --- Scene actions -----------------------------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.CLEAN_ROOMS, async (fields = {}) => {
    const entry = entryFor(fields.device);
    const wanted = String(fields.rooms ?? '')
      .split(/[,;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (wanted.length === 0) {
      throw userError('errorNoRooms');
    }
    const rooms = await findRooms(entry, wanted);
    if (fields.fan_speed) {
      await setPreset(entry, 'fan_speed', fields.fan_speed);
    }
    if (fields.water_usage) {
      await setPreset(entry, 'water_grade', fields.water_usage);
    }
    await cleanRooms(entry, rooms, fields.iterations ?? 1);
    return { rooms: truncate(rooms.map((room) => room.name || room.id).join(', '), 1000) };
  });

  gladys.onSceneAction(SCENE_ACTIONS.CONTROL, async (fields = {}) => {
    const name = CONTROL_COMMANDS.includes(fields.command)
      ? fields.command
      : String(fields.command);
    await runCommand(entryFor(fields.device), name);
  });

  // --- Widgets --------------------------------------------------------------------------------------

  const createdEntry = (deviceId) =>
    [...entries.values()].find(
      (candidate) =>
        candidate.identified && candidate.deviceId === deviceId && created.has(deviceId),
    ) ?? null;

  const robotView = (entry) => ({
    deviceId: entry.deviceId,
    name: nameOf(entry),
    reachable: Boolean(entry.reachable),
    status: entry.snapshot?.status ?? null,
    flag: entry.snapshot?.flag ?? 'none',
    error: entry.snapshot?.error ?? null,
    battery: entry.snapshot?.battery ?? null,
    batteryFlag: entry.snapshot?.batteryFlag ?? 'none',
    presets: entry.snapshot?.presets ?? {},
    current: isWorking(entry.snapshot?.status) ? entry.current : { area: null, time: null },
    rooms: entry.segments,
    canControl: entry.capabilities.has(CAPABILITIES.BASIC_CONTROL),
    canLocate: entry.capabilities.has(CAPABILITIES.LOCATE),
    canCleanRooms: entry.capabilities.has(CAPABILITIES.SEGMENTS),
    maxIterations: entry.iterations.max,
  });

  gladys.onWidgetGet(WIDGETS.ROBOT, async ({ settings } = {}) => {
    const entry = createdEntry(settings?.device);
    return buildRobotWidget(entry ? robotView(entry) : null);
  });

  const shortHash = (value, length) =>
    createHash('sha1').update(value).digest('hex').slice(0, length);

  /** Draw the map of a robot (kept MAP_REFRESH_MS). */
  const drawMap = async (entry) => {
    if (entry.map && now() - entry.map.at < MAP_REFRESH_MS) {
      return entry.map;
    }
    const map = await client.map(entry.host);
    const picture = renderMap(map);
    const rooms = mapSegments(map);
    const drawn = {
      at: now(),
      key: picture ? `map-${shortHash(entry.id, 8)}-${shortHash(picture.png, 16)}` : null,
      rooms: rooms.length,
      area:
        Number(map?.metaData?.totalLayerArea) > 0
          ? Math.round(Number(map.metaData.totalLayerArea) / 10000)
          : null,
      active: rooms
        .filter((room) => room.active)
        .map(
          (room) =>
            room.name || entry.segments.find((segment) => segment.id === room.id)?.name || room.id,
        ),
    };
    if (picture) {
      mapImages.set(drawn.key, picture.png.toString('base64'));
      while (mapImages.size > MAP_CACHE) {
        mapImages.delete(mapImages.keys().next().value);
      }
    }
    entry.map = drawn;
    return drawn;
  };

  gladys.onWidgetGet(WIDGETS.MAP, async ({ settings } = {}) => {
    const entry = createdEntry(settings?.device);
    if (!entry) {
      return buildMapWidget(null);
    }
    let drawn = entry.map;
    if (entry.reachable) {
      try {
        drawn = await drawMap(entry);
      } catch (error) {
        logger.debug?.(`Valetudo: no map from ${entry.host}: ${errorText(error)}`);
      }
    }
    return buildMapWidget({
      name: nameOf(entry),
      reachable: Boolean(entry.reachable),
      imageKey: drawn?.key && mapImages.has(drawn.key) ? drawn.key : null,
      rooms: drawn?.rooms ?? 0,
      area: drawn?.area ?? null,
      activeRoom:
        isWorking(entry.snapshot?.status) && drawn?.active?.length ? drawn.active.join(', ') : null,
    });
  });

  gladys.onWidgetGetImage(async (imageKey) => {
    const image = mapImages.get(imageKey);
    if (image) {
      return image;
    }
    // A key of before a restart: draw the map of that robot again.
    const entry = [...entries.values()].find((candidate) =>
      String(imageKey).startsWith(`map-${shortHash(candidate.id, 8)}-`),
    );
    if (!entry) {
      throw new Error(`unknown image ${imageKey}`);
    }
    entry.map = null;
    const drawn = await drawMap(entry);
    const fresh = drawn.key && mapImages.get(drawn.key);
    if (!fresh) {
      throw new Error('no map');
    }
    return fresh;
  });

  gladys.onWidgetGet(WIDGETS.MAINTENANCE, async ({ settings } = {}) => {
    const entry = createdEntry(settings?.device);
    if (!entry) {
      return buildMaintenanceWidget(null);
    }
    return buildMaintenanceWidget({
      deviceId: entry.deviceId,
      name: nameOf(entry),
      reachable: Boolean(entry.reachable),
      consumables: entry.consumables,
      meta: entry.consumableMeta,
      total: entry.total,
    });
  });

  const toast = (error) =>
    truncateAll(Object.fromEntries(LANGUAGES.map((language) => [language, error.message])), 200);

  const widgetAction = async (actionKey, params = {}, { settings, values } = {}) => {
    let entry;
    try {
      entry = entryFor(settings?.device ?? params.device);
    } catch (error) {
      return toast(error);
    }
    const name = truncate(nameOf(entry), 60);
    try {
      let done;
      if (actionKey === WIDGET_ACTIONS.START) {
        await basic(entry, 'start');
        done = t('toastStarted', { name });
      } else if (actionKey === WIDGET_ACTIONS.PAUSE) {
        await basic(entry, 'pause');
        done = t('toastPaused', { name });
      } else if (actionKey === WIDGET_ACTIONS.HOME) {
        await basic(entry, 'home');
        done = t('toastHome', { name });
      } else if (actionKey === WIDGET_ACTIONS.LOCATE) {
        await runCommand(entry, 'locate');
        done = t('toastLocate', { name });
      } else if (actionKey === WIDGET_ACTIONS.CLEAN_ROOM) {
        const rooms = await findRooms(entry, [String(values?.room ?? '')]);
        await cleanRooms(entry, rooms, values?.iterations ?? 1);
        done = t('toastRoom', {
          name,
          room: rooms[0].name ? rooms[0].name : t('roomNumber', { id: rooms[0].id }),
        });
      } else if (actionKey === WIDGET_ACTIONS.RESET_CONSUMABLE) {
        requireCapability(entry, CAPABILITIES.CONSUMABLES);
        const consumable = entry.consumables.find(
          (item) => consumableKey(item) === String(values?.consumable ?? ''),
        );
        if (!consumable) {
          throw userError('errorConsumable', { key: truncate(values?.consumable, 40) });
        }
        await command(entry, () =>
          client.resetConsumable(entry.host, consumable.type, consumable.subType),
        );
        await safely(() => loadConsumables(entry), 'consumables');
        pushStates(entry);
        done = t('toastReset', {
          consumable: Object.fromEntries(
            LANGUAGES.map((language) => [language, consumableName(consumable, language)]),
          ),
        });
        refreshWidgets([WIDGETS.MAINTENANCE]);
      } else {
        return undefined;
      }
      refreshWidgets([WIDGETS.ROBOT]);
      return truncateAll(done, 200);
    } catch (error) {
      return toast(error);
    }
  };

  gladys.onWidgetAction(WIDGETS.ROBOT, widgetAction);
  gladys.onWidgetAction(WIDGETS.MAINTENANCE, widgetAction);

  // --- Lifecycle -------------------------------------------------------------------------------------

  return {
    /** Restore the known robots, ask them, then search. */
    async start() {
      stopped = false;
      config = normalizeConfig(gladys.config ?? {});
      client.setCredentials(config.username, config.password);
      created.clear();
      const saved = (await storage.read('robots.json')) ?? {};
      for (const [id, info] of Object.entries(saved)) {
        const host = normalizeHost(info?.host);
        if (host) {
          const entry = entryOf({ id, host, systemId: String(info.systemId ?? '') });
          entry.friendlyName = String(info.friendlyName ?? '');
          entry.manufacturer = String(info.manufacturer ?? '');
          entry.model = String(info.model ?? '');
          entry.identified = true;
        }
      }
      (gladys.devices ?? []).forEach((device) => trackCreated(device));
      schedule();
      await scan();
      await check();
    },

    async stop() {
      stopped = true;
      clearInterval(checkTimer);
      clearInterval(rescanTimer);
      widgetRefresh.forEach((slot) => clearTimeout(slot.timer));
      entries.forEach((entry) => stopStream(entry));
      states.stop();
      await Promise.allSettled([checking, scanning]);
    },

    check,
    scan,
    applyAttributes: (id, attributes) => applyAttributes(entries.get(id), attributes),
    flushStates: () => states.flush(),
    entries,
  };
}
