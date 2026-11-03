// -----------------------------------------------------------------------------
// Dashboard widgets (setting `device`: one robot each).
//
//   robot        state, battery, current run (area, time), suction, error;
//                buttons: start / pause, back to the dock, locate, and
//                "Clean a room" (a form: the room, the passes)
//   map          the live map drawn as a picture (rooms, walls, path, robot,
//                dock, virtual walls), the room being cleaned highlighted
//   maintenance  the consumables (remaining life, a badge when they wear
//                out), the lifetime statistics, and a "Reset" form
//
// Pure: the build functions turn a snapshot into a content, so the tests and
// docs/illustrations/gen.mjs use the exact code Gladys gets. Every text is
// multi-language: Gladys caches the content per language.
// -----------------------------------------------------------------------------

import { consumableKey, consumableName, consumablePercent } from './devices.js';
import { LANGUAGES, t, text, truncate } from './i18n.js';
import { isWorking } from './valetudo/attributes.js';

export const WIDGETS = { ROBOT: 'robot', MAP: 'map', MAINTENANCE: 'maintenance' };
export const WIDGET_ACTIONS = {
  START: 'start',
  PAUSE: 'pause',
  HOME: 'home',
  LOCATE: 'locate',
  CLEAN_ROOM: 'clean_room',
  RESET_CONSUMABLE: 'reset_consumable',
};
export const TTL_SECONDS = 60;
export const MAP_TTL_SECONDS = 60;
export const MAX_ITERATIONS = 3;
const LOW_PERCENT = 25;
const EMPTY_PERCENT = 10;

const STATUS_COLORS = {
  error: 'danger',
  docked: 'success',
  idle: 'neutral',
  returning: 'info',
  cleaning: 'primary',
  paused: 'warning',
  manual_control: 'primary',
  moving: 'primary',
};

/** The same string in every language (a room name, a robot name). */
const same = (value) => Object.fromEntries(LANGUAGES.map((language) => [language, value]));

const choose = () => ({
  version: 1,
  ttl_seconds: TTL_SECONDS,
  components: [{ type: 'text', text: t('widgetChooseDevice'), variant: 'caption' }],
});

const offline = (view, ttl = TTL_SECONDS) => ({
  version: 1,
  ttl_seconds: ttl,
  components: [
    { type: 'text', text: truncate(view.name, 40), variant: 'heading' },
    {
      type: 'status',
      items: [{ label: t('widgetState'), value: t('widgetUnreachable'), color: 'danger' }],
    },
    { type: 'text', text: t('widgetOffline'), variant: 'caption' },
  ],
});

/**
 * @description A preset value in the four languages.
 * @param {string} value - Valetudo preset (`max`, `vacuum_and_mop`).
 * @returns {object} `{ en, fr, de, es }`.
 */
const presetLabel = (value) =>
  Object.fromEntries(
    LANGUAGES.map((language) => [language, text(`preset_${value}`, language, {}, value)]),
  );

/**
 * @typedef {object} RobotView
 * @property {string} deviceId - Gladys external id.
 * @property {string} name - Device name in Gladys.
 * @property {boolean} reachable - Answers on the local network.
 * @property {string|null} status - Valetudo status.
 * @property {string} flag - Valetudo status flag.
 * @property {string|null} error - Error message.
 * @property {number|null} battery - %.
 * @property {string} batteryFlag - charging, discharging, charged.
 * @property {object} presets - Current presets `{ fan_speed, water_grade, operation_mode }`.
 * @property {{ area: number|null, time: number|null }} current - Current run, m² and minutes.
 * @property {Array<{ id: string, name: string }>} rooms - Rooms of the map.
 * @property {boolean} canControl - BasicControlCapability.
 * @property {boolean} canLocate - LocateCapability.
 * @property {boolean} canCleanRooms - MapSegmentationCapability.
 * @property {number} maxIterations - Passes the robot accepts.
 */

/**
 * @description The `robot` widget.
 * @param {RobotView|null} view - The robot, null when the setting points nowhere.
 * @returns {object} The widget content.
 */
export function buildRobotWidget(view) {
  if (!view) {
    return choose();
  }
  if (!view.reachable) {
    return offline(view);
  }
  const components = [{ type: 'text', text: truncate(view.name, 40), variant: 'heading' }];
  if (Number.isFinite(view.battery)) {
    components.push({
      type: 'value',
      value: view.battery,
      unit: '%',
      label: view.batteryFlag === 'charging' ? t('widgetCharging') : t('widgetBattery'),
      icon: 'battery-charging',
      color: view.battery <= 20 ? 'danger' : 'success',
    });
  }
  if (Number.isFinite(view.current?.area)) {
    components.push({
      type: 'value',
      value: view.current.area,
      unit: 'm²',
      label: t('widgetArea'),
      icon: 'maximize',
      color: 'primary',
    });
  }
  if (Number.isFinite(view.current?.time)) {
    components.push({
      type: 'value',
      value: view.current.time,
      unit: 'min',
      label: t('widgetTime'),
      icon: 'clock',
      color: 'primary',
    });
  }
  const working = isWorking(view.status);
  const items = [
    {
      label: t('widgetState'),
      value: view.status ? t(`status_${view.status}`) : t('statusUnknown'),
      color: STATUS_COLORS[view.status] ?? 'neutral',
    },
  ];
  if (working && view.flag && view.flag !== 'none') {
    items.push({
      label: t('widgetTask'),
      value: t(`flag_${view.flag}`, {}, view.flag),
      color: 'info',
    });
  }
  if (view.presets?.operation_mode) {
    items.push({
      label: t('operation_mode'),
      value: presetLabel(view.presets.operation_mode),
      color: 'neutral',
    });
  }
  if (view.presets?.fan_speed) {
    items.push({
      label: t('fan_speed'),
      value: presetLabel(view.presets.fan_speed),
      color: 'neutral',
    });
  }
  if (view.presets?.water_grade) {
    items.push({
      label: t('water_usage'),
      value: presetLabel(view.presets.water_grade),
      color: 'neutral',
    });
  }
  if (view.status === 'error') {
    items.push({
      label: t('widgetError'),
      value: view.error ? same(truncate(view.error, 40)) : t('widgetErrorUnknown'),
      color: 'danger',
    });
  }
  components.push({ type: 'status', items });
  if (!view.canControl) {
    return { version: 1, ttl_seconds: TTL_SECONDS, components };
  }
  const device = { device: view.deviceId };
  if (view.status === 'cleaning' || view.status === 'moving') {
    components.push({
      type: 'button',
      label: t('widgetPause'),
      icon: 'pause',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.PAUSE, params: device },
    });
  } else {
    components.push({
      type: 'button',
      label: view.status === 'paused' ? t('widgetResume') : t('widgetStart'),
      icon: 'play',
      style: 'primary',
      action: { key: WIDGET_ACTIONS.START, params: device },
    });
  }
  if (view.status !== 'docked') {
    components.push({
      type: 'button',
      label: t('widgetHome'),
      icon: 'home',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.HOME, params: device },
    });
  }
  if (view.canCleanRooms && view.rooms.length > 0 && !working) {
    components.push({
      type: 'button',
      label: t('widgetCleanRoom'),
      icon: 'grid',
      style: 'primary',
      action: {
        key: WIDGET_ACTIONS.CLEAN_ROOM,
        params: device,
        fields: [
          {
            key: 'room',
            type: 'select',
            label: t('widgetRoomField'),
            required: true,
            default: view.rooms[0].id,
            options: view.rooms.slice(0, 50).map((room) => ({
              value: room.id,
              label: room.name ? same(truncate(room.name, 40)) : t('roomNumber', { id: room.id }),
            })),
          },
          {
            key: 'iterations',
            type: 'number',
            label: t('widgetPassesField'),
            required: false,
            default: 1,
            min: 1,
            max: Math.max(1, Math.min(MAX_ITERATIONS, view.maxIterations || 1)),
          },
        ],
      },
    });
  }
  if (view.canLocate) {
    components.push({
      type: 'button',
      label: t('widgetLocate'),
      icon: 'volume-2',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.LOCATE, params: device },
    });
  }
  return { version: 1, ttl_seconds: TTL_SECONDS, components: components.slice(0, 8) };
}

/**
 * @typedef {object} MapView
 * @property {string} name - Device name in Gladys.
 * @property {boolean} reachable - Answers on the local network.
 * @property {string|null} imageKey - Key of the drawn map, null when there is none.
 * @property {number} rooms - Number of rooms.
 * @property {number|null} area - Mapped floor, m².
 * @property {string|null} activeRoom - Name of the room being cleaned.
 */

/**
 * @description The `map` widget.
 * @param {MapView|null} view - The robot, null when the setting points nowhere.
 * @returns {object} The widget content.
 */
export function buildMapWidget(view) {
  if (!view) {
    return choose();
  }
  if (!view.reachable && !view.imageKey) {
    return offline(view, MAP_TTL_SECONDS);
  }
  const components = [{ type: 'text', text: truncate(view.name, 40), variant: 'heading' }];
  if (!view.imageKey) {
    components.push({ type: 'text', text: t('widgetNoMap'), variant: 'caption' });
    return { version: 1, ttl_seconds: MAP_TTL_SECONDS, components };
  }
  components.push({ type: 'image', key: view.imageKey, alt: t('widgetMapAlt'), fit: 'contain' });
  const caption = view.activeRoom
    ? t('widgetMapCleaning', { room: truncate(view.activeRoom, 30) })
    : t('widgetMapSummary', { rooms: view.rooms, area: view.area ?? '?' });
  components.push({ type: 'text', text: caption, variant: 'caption' });
  return { version: 1, ttl_seconds: MAP_TTL_SECONDS, components };
}

/**
 * @typedef {object} MaintenanceView
 * @property {string} deviceId - Gladys external id.
 * @property {string} name - Device name in Gladys.
 * @property {boolean} reachable - Answers on the local network.
 * @property {object[]} consumables - Valetudo consumables.
 * @property {object[]} meta - availableConsumables (maxValue).
 * @property {{ area: number|null, time: number|null, count: number|null }} total - m², hours, runs.
 */

const wear = (percent) => {
  if (percent === null) {
    return null;
  }
  if (percent <= EMPTY_PERCENT) {
    return { text: t('badgeReplace'), color: 'danger' };
  }
  if (percent <= LOW_PERCENT) {
    return { text: t('badgeSoon'), color: 'warning' };
  }
  return { text: t('badgeOk'), color: 'success' };
};

const remainingText = (consumable, percent) => {
  if (percent !== null) {
    return t('remainingPercent', { value: percent });
  }
  const minutes = Number(consumable.remaining?.value);
  return t('remainingHours', { value: Math.max(0, Math.round(minutes / 60)) });
};

/**
 * @description The `maintenance` widget.
 * @param {MaintenanceView|null} view - The robot, null when the setting points nowhere.
 * @returns {object} The widget content.
 */
export function buildMaintenanceWidget(view) {
  if (!view) {
    return choose();
  }
  if (!view.reachable) {
    return offline(view);
  }
  const components = [{ type: 'text', text: truncate(view.name, 40), variant: 'heading' }];
  const tiles = [
    ['area', 'm²', 'widgetTotalArea', 'maximize'],
    ['time', 'h', 'widgetTotalTime', 'clock'],
    ['count', '', 'widgetTotalRuns', 'repeat'],
  ];
  for (const [key, unit, label, icon] of tiles) {
    if (Number.isFinite(view.total?.[key])) {
      components.push({
        type: 'value',
        value: view.total[key],
        ...(unit ? { unit } : {}),
        label: t(label),
        icon,
        color: 'neutral',
      });
    }
  }
  const consumables = (view.consumables ?? []).filter((consumable) =>
    Number.isFinite(Number(consumable?.remaining?.value)),
  );
  if (consumables.length === 0) {
    components.push({ type: 'text', text: t('widgetNoConsumables'), variant: 'caption' });
    return { version: 1, ttl_seconds: TTL_SECONDS, components };
  }
  const items = consumables
    .map((consumable) => {
      const percent = consumablePercent(consumable, view.meta);
      return { consumable, percent };
    })
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101))
    .slice(0, 8);
  components.push({
    type: 'card-list',
    display: 'list',
    items: items.map(({ consumable, percent }) => {
      const badge = wear(percent);
      return {
        title: Object.fromEntries(
          LANGUAGES.map((language) => [language, consumableName(consumable, language)]),
        ),
        subtitle: remainingText(consumable, percent),
        ...(badge ? { badge } : {}),
      };
    }),
  });
  components.push({
    type: 'button',
    label: t('widgetReset'),
    icon: 'rotate-ccw',
    style: 'secondary',
    action: {
      key: WIDGET_ACTIONS.RESET_CONSUMABLE,
      params: { device: view.deviceId },
      confirm: true,
      fields: [
        {
          key: 'consumable',
          type: 'select',
          label: t('widgetConsumableField'),
          required: true,
          default: consumableKey(items[0].consumable),
          options: items.map(({ consumable }) => ({
            value: consumableKey(consumable),
            label: Object.fromEntries(
              LANGUAGES.map((language) => [language, consumableName(consumable, language)]),
            ),
          })),
        },
      ],
    },
  });
  return { version: 1, ttl_seconds: TTL_SECONDS, components };
}
