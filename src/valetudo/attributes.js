// -----------------------------------------------------------------------------
// The state attributes of a Valetudo robot, read into a plain snapshot.
//
// `GET /api/v2/robot/state/attributes` (and each SSE event) is a list of
// typed entities (`__class`):
//
//   StatusStateAttribute           value: error, docked, idle, returning,
//                                  cleaning, paused, manual_control, moving;
//                                  flag: none, zone, segment, spot, target,
//                                  resumable, mapping; error: { message, … }
//   BatteryStateAttribute          level (%), flag: charging, discharging, charged
//   PresetSelectionStateAttribute  type: fan_speed, water_grade, operation_mode
//   AttachmentStateAttribute       type: dustbin, watertank, mop; attached
//   DockStatusStateAttribute       value: idle, pause, emptying, cleaning, drying, error
//
// The Gladys vacuum-cleaner category (Gladys core, VACUUM_CLEANER_STATE /
// VACUUM_CLEANER_MODE) has fewer states: the mapping is below.
// -----------------------------------------------------------------------------

// Gladys core server/utils/constants.js (5.3.1).
export const VACUUM_STATE = {
  STOPPED: 0,
  RUNNING: 1,
  PAUSED: 2,
  ERROR: 3,
  RETURNING_TO_DOCK: 4,
  CHARGING: 5,
  DOCKED: 6,
};
export const VACUUM_MODE = { IDLE: 0, CLEANING: 1, MAPPING: 2 };

export const STATUSES = [
  'error',
  'docked',
  'idle',
  'returning',
  'cleaning',
  'paused',
  'manual_control',
  'moving',
];

// The statuses of a cleaning run (started, still going).
const WORKING = new Set(['cleaning', 'paused', 'moving', 'manual_control']);

/**
 * @description Read an attribute list.
 * @param {object[]} attributes - The Valetudo attributes.
 * @returns {object} `{ status, flag, error, battery, charging, presets, attachments, dock }`.
 */
export function readAttributes(attributes) {
  const snapshot = {
    status: null,
    flag: 'none',
    error: null,
    battery: null,
    batteryFlag: 'none',
    presets: {},
    attachments: {},
    dock: null,
  };
  for (const attribute of Array.isArray(attributes) ? attributes : []) {
    switch (attribute?.__class) {
      case 'StatusStateAttribute':
        snapshot.status = STATUSES.includes(attribute.value) ? attribute.value : null;
        snapshot.flag = typeof attribute.flag === 'string' ? attribute.flag : 'none';
        snapshot.error =
          attribute.value === 'error' ? String(attribute.error?.message ?? '').trim() || '' : null;
        break;
      case 'BatteryStateAttribute': {
        const level = Number(attribute.level);
        if (Number.isFinite(level)) {
          snapshot.battery = Math.min(100, Math.max(0, Math.round(level)));
        }
        snapshot.batteryFlag = typeof attribute.flag === 'string' ? attribute.flag : 'none';
        break;
      }
      case 'PresetSelectionStateAttribute':
        if (typeof attribute.type === 'string' && typeof attribute.value === 'string') {
          snapshot.presets[attribute.type] = attribute.value;
        }
        break;
      case 'AttachmentStateAttribute':
        if (typeof attribute.type === 'string') {
          snapshot.attachments[attribute.type] = attribute.attached === true;
        }
        break;
      case 'DockStatusStateAttribute':
        snapshot.dock = typeof attribute.value === 'string' ? attribute.value : null;
        break;
      default:
        break;
    }
  }
  return snapshot;
}

/**
 * @description The Gladys vacuum state of a snapshot.
 * @param {object} snapshot - readAttributes().
 * @returns {number|null} VACUUM_STATE value.
 */
export function vacuumState({ status, batteryFlag }) {
  switch (status) {
    case 'error':
      return VACUUM_STATE.ERROR;
    case 'docked':
      return batteryFlag === 'charging' ? VACUUM_STATE.CHARGING : VACUUM_STATE.DOCKED;
    case 'idle':
      return VACUUM_STATE.STOPPED;
    case 'returning':
      return VACUUM_STATE.RETURNING_TO_DOCK;
    case 'paused':
      return VACUUM_STATE.PAUSED;
    case 'cleaning':
    case 'moving':
    case 'manual_control':
      return VACUUM_STATE.RUNNING;
    default:
      return null;
  }
}

/**
 * @description The Gladys run mode of a snapshot.
 * @param {object} snapshot - readAttributes().
 * @returns {number|null} VACUUM_MODE value.
 */
export function vacuumMode({ status, flag }) {
  if (!status) {
    return null;
  }
  if (WORKING.has(status)) {
    return flag === 'mapping' ? VACUUM_MODE.MAPPING : VACUUM_MODE.CLEANING;
  }
  return VACUUM_MODE.IDLE;
}

/**
 * @description Whether the robot is on a cleaning run (cleaning, paused, moving).
 * @param {string|null} status - Valetudo status.
 * @returns {boolean} True when working.
 */
export const isWorking = (status) => WORKING.has(status);
