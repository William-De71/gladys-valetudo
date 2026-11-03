// -----------------------------------------------------------------------------
// Gladys side of a Valetudo robot: the device published in the Discover tab
// and the values of its features.
//
//   state           vacuum-cleaner/state: stopped, running, paused, error,
//                   returning, charging, docked (read only)
//   run_mode        vacuum-cleaner/run-mode: idle (stop), cleaning (start or
//                   resume), mapping (a mapping pass, when the robot has one)
//   dock            vacuum-cleaner/dock: back to the dock
//   battery         battery/integer, %
//   fan_speed       text/select: the suction presets of the robot
//   water_usage     text/select: the water presets (mopping robots)
//   operation_mode  text/select: vacuum, mop, vacuum and mop… (when offered)
//   consumable_*    maintenance/life-remaining, %: one per consumable that
//                   reports a percentage (or minutes with a known maximum)
//
// The features depend on the capabilities of the robot: Valetudo lists them
// (`GET /api/v2/robot/capabilities`), a robot without water control gets no
// water_usage feature. Feature keys never change for a given robot.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { featureName, text } from './i18n.js';
import { VACUUM_MODE, vacuumMode, vacuumState } from './valetudo/attributes.js';
import { CAPABILITIES, PRESET_CAPABILITIES } from './valetudo/client.js';

export const FEATURE_KEYS = {
  STATE: 'state',
  RUN_MODE: 'run_mode',
  DOCK: 'dock',
  BATTERY: 'battery',
  FAN_SPEED: 'fan_speed',
  WATER_USAGE: 'water_usage',
  OPERATION_MODE: 'operation_mode',
};

// Feature key -> preset type of Valetudo.
export const PRESET_FEATURES = {
  [FEATURE_KEYS.FAN_SPEED]: 'fan_speed',
  [FEATURE_KEYS.WATER_USAGE]: 'water_grade',
  [FEATURE_KEYS.OPERATION_MODE]: 'operation_mode',
};

export const CONSUMABLE_PREFIX = 'consumable_';

/**
 * @description The feature key of a consumable.
 * @param {{ type: string, subType?: string }} consumable - Valetudo consumable.
 * @returns {string} `consumable_brush_main`, `consumable_filter`.
 */
export function consumableKey({ type, subType }) {
  const clean = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
  const sub = clean(subType);
  return `${CONSUMABLE_PREFIX}${clean(type)}${sub && sub !== 'none' ? `_${sub}` : ''}`;
}

/**
 * @description The name of a consumable.
 * @param {{ type: string, subType?: string }} consumable - Valetudo consumable.
 * @param {string} language - Language.
 * @returns {string} `Main brush`, `Filter`.
 */
export function consumableName({ type, subType }, language) {
  const typeName = text(`consumable_${type}`, language, {}, type);
  if (!subType || subType === 'none') {
    return typeName;
  }
  const whole = text(`consumable_${type}_${subType}`, language, {}, '');
  if (whole) {
    return whole;
  }
  return text('consumableWithPart', language, {
    type: typeName,
    part: text(`part_${subType}`, language, {}, subType),
  });
}

/**
 * @description Remaining life of a consumable in percent.
 * @param {object} consumable - `{ type, subType, remaining: { value, unit } }`.
 * @param {Array<{ type, subType, maxValue }>} [meta] - availableConsumables of the capability properties.
 * @returns {number|null} 0 to 100, null when unknown.
 */
export function consumablePercent(consumable, meta = []) {
  const value = Number(consumable?.remaining?.value);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (consumable.remaining.unit === 'percent') {
    return Math.min(100, Math.max(0, Math.round(value)));
  }
  const known = meta.find(
    (item) =>
      item?.type === consumable.type &&
      (item.subType ?? 'none') === (consumable.subType ?? 'none') &&
      Number(item.maxValue) > 0,
  );
  return known
    ? Math.min(100, Math.max(0, Math.round((value / Number(known.maxValue)) * 100)))
    : null;
}

/**
 * @description Default name of a robot: its Valetudo friendly name, else its model.
 * @param {object} entry - `{ friendlyName, manufacturer, model, systemId }`.
 * @returns {string} `Robot Salon` or `Dreame D9`.
 */
export function deviceName(entry) {
  const friendly = String(entry.friendlyName ?? '').trim();
  if (friendly) {
    return friendly;
  }
  const model = [entry.manufacturer, entry.model].filter(Boolean).join(' ').trim();
  return model || `Valetudo ${entry.systemId ?? ''}`.trim();
}

/**
 * @description The options of a preset feature.
 * @param {string[]} presets - Valetudo preset names.
 * @param {string} language - Label language.
 * @returns {Array<{ value: string, label: string, sort_order: number }>} The options.
 */
export function presetOptions(presets, language) {
  return presets.map((value, order) => ({
    value,
    label: text(`preset_${value}`, language, {}, value),
    sort_order: order,
  }));
}

/**
 * @description The run-mode options the robot supports.
 * @param {Set<string>} capabilities - Capability names.
 * @param {string} language - Label language.
 * @returns {Array<{ value: number, label: string, sort_order: number }>} The options.
 */
export function runModeOptions(capabilities, language) {
  const options = [
    { value: VACUUM_MODE.IDLE, label: text('modeIdle', language), sort_order: 0 },
    { value: VACUUM_MODE.CLEANING, label: text('modeCleaning', language), sort_order: 1 },
  ];
  if (capabilities.has(CAPABILITIES.MAPPING_PASS)) {
    options.push({
      value: VACUUM_MODE.MAPPING,
      label: text('modeMapping', language),
      sort_order: 2,
    });
  }
  return options;
}

/**
 * @description The consumables that get a feature (a percentage is known).
 * @param {object} entry - `{ consumables, consumableMeta }`.
 * @returns {object[]} The consumables.
 */
export const trackedConsumables = (entry) =>
  entry.capabilities?.has(CAPABILITIES.CONSUMABLES)
    ? (entry.consumables ?? []).filter(
        (consumable) => consumablePercent(consumable, entry.consumableMeta) !== null,
      )
    : [];

/**
 * @description The device of the Discover tab.
 * @param {object} gladys - SDK client (externalIds).
 * @param {object} entry - Robot entry (app.js).
 * @param {string} language - Language of the feature names.
 * @returns {object} The Gladys device.
 */
export function buildDevice(gladys, entry, language) {
  const ids = gladys.externalIds('device', entry.id);
  const name = deviceName(entry);
  const capabilities = entry.capabilities ?? new Set();
  const feature = (key, fields, label = featureName(key, language)) => ({
    name: `${name} - ${label}`,
    external_id: ids.feature(key),
    keep_history: false,
    ...fields,
  });
  const features = [
    feature(FEATURE_KEYS.STATE, {
      category: CATEGORIES.VACUUM_CLEANER,
      type: TYPES.VACUUM_CLEANER.STATE,
      min: 0,
      max: 6,
      read_only: true,
      has_feedback: true,
      keep_history: true,
    }),
  ];
  if (capabilities.has(CAPABILITIES.BASIC_CONTROL)) {
    features.push(
      feature(FEATURE_KEYS.RUN_MODE, {
        category: CATEGORIES.VACUUM_CLEANER,
        type: TYPES.VACUUM_CLEANER.RUN_MODE,
        min: 0,
        max: 2,
        read_only: false,
        has_feedback: true,
        supported_options: runModeOptions(capabilities, language),
      }),
      feature(FEATURE_KEYS.DOCK, {
        category: CATEGORIES.VACUUM_CLEANER,
        type: TYPES.VACUUM_CLEANER.DOCK,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: false,
      }),
    );
  }
  features.push(
    feature(FEATURE_KEYS.BATTERY, {
      category: CATEGORIES.BATTERY,
      type: TYPES.BATTERY.INTEGER,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
      read_only: true,
      has_feedback: true,
      keep_history: true,
    }),
  );
  for (const [key, presetType] of Object.entries(PRESET_FEATURES)) {
    const presets = entry.presets?.[presetType] ?? [];
    if (capabilities.has(PRESET_CAPABILITIES[presetType]) && presets.length > 0) {
      features.push(
        feature(key, {
          category: CATEGORIES.TEXT,
          type: TYPES.TEXT.SELECT,
          min: 0,
          max: 0,
          read_only: false,
          has_feedback: true,
          supported_options: presetOptions(presets, language),
        }),
      );
    }
  }
  for (const consumable of trackedConsumables(entry)) {
    features.push(
      feature(
        consumableKey(consumable),
        {
          category: CATEGORIES.MAINTENANCE,
          type: TYPES.MAINTENANCE.LIFE_REMAINING,
          unit: UNITS.PERCENT,
          min: 0,
          max: 100,
          read_only: true,
          has_feedback: true,
        },
        consumableName(consumable, language),
      ),
    );
  }
  return {
    name,
    external_id: ids.device,
    // The robot pushes its changes (SSE): no polling by Gladys.
    should_poll: false,
    features,
    params: [
      { name: 'VALETUDO_HOST', value: entry.host },
      { name: 'VALETUDO_SYSTEM_ID', value: entry.systemId ?? '' },
    ],
  };
}

/**
 * @description The values of the features.
 * @param {object} entry - Robot entry (snapshot, consumables).
 * @returns {Array<[string, number|{text: string}]>} `[featureKey, value]`.
 */
export function featureValues(entry) {
  const values = [];
  const snapshot = entry.snapshot;
  if (snapshot) {
    const state = vacuumState(snapshot);
    if (state !== null) {
      values.push([FEATURE_KEYS.STATE, state]);
    }
    const mode = vacuumMode(snapshot);
    if (mode !== null && entry.capabilities?.has(CAPABILITIES.BASIC_CONTROL)) {
      values.push([FEATURE_KEYS.RUN_MODE, mode]);
    }
    if (Number.isFinite(snapshot.battery)) {
      values.push([FEATURE_KEYS.BATTERY, snapshot.battery]);
    }
    for (const [key, presetType] of Object.entries(PRESET_FEATURES)) {
      const value = snapshot.presets?.[presetType];
      if (typeof value === 'string' && (entry.presets?.[presetType] ?? []).includes(value)) {
        values.push([key, { text: value }]);
      }
    }
  }
  for (const consumable of trackedConsumables(entry)) {
    values.push([consumableKey(consumable), consumablePercent(consumable, entry.consumableMeta)]);
  }
  return values;
}
