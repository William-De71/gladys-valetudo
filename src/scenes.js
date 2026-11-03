// -----------------------------------------------------------------------------
// Scene actions and triggers (manifest `scene_actions`, `scene_triggers`).
//
// Actions
//   clean_rooms       clean rooms by name or number, with a number of passes
//                     and, optionally, a suction and a water preset first
//   control           start, pause, stop, back to the dock, locate, empty the
//                     dock bin, wash or dry the mop at the dock
//
// Triggers (one event per transition, never in reaction to a scene action)
//   cleaning_started  a cleaning run (or mapping pass) starts
//   cleaning_finished a run ends: the robot heads back, docks or stops
//                     without an error (a pause is not an end)
//   error             the robot enters its error state, with the message
//   attention_needed  a Valetudo event asks for the user: dust bin full,
//                     consumable worn out, mop to attach, missing resource
//                     (water tank…), map change to accept
//   unreachable       the robot stopped answering (twice in a row)
//   reachable_again   it answers again
//
// State, run mode, presets and battery are device features: the Gladys
// "device state" trigger and "control a device" action already cover them.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  CLEAN_ROOMS: 'clean_rooms',
  CONTROL: 'control',
};

// The outputs each action returns, as declared in the manifest.
export const SCENE_ACTION_OUTPUTS = {
  [SCENE_ACTIONS.CLEAN_ROOMS]: ['rooms'],
  [SCENE_ACTIONS.CONTROL]: [],
};

export const SCENE_TRIGGERS = {
  CLEANING_STARTED: 'cleaning_started',
  CLEANING_FINISHED: 'cleaning_finished',
  ERROR: 'error',
  ATTENTION_NEEDED: 'attention_needed',
  UNREACHABLE: 'unreachable',
  REACHABLE_AGAIN: 'reachable_again',
};

export const CONTROL_COMMANDS = [
  'start',
  'pause',
  'stop',
  'home',
  'locate',
  'auto_empty',
  'mop_dock_clean',
  'mop_dock_dry',
];

// Valetudo event class -> `reason` of the attention_needed trigger.
export const ATTENTION_REASONS = {
  DustBinFullValetudoEvent: 'dustbin_full',
  ConsumableDepletedValetudoEvent: 'consumable_depleted',
  MopAttachmentReminderValetudoEvent: 'mop_reminder',
  MissingResourceValetudoEvent: 'missing_resource',
  PendingMapChangeValetudoEvent: 'pending_map_change',
};

// The preset values of Valetudo (PresetSelectionStateAttribute.INTENSITY).
export const FAN_SPEEDS = ['off', 'min', 'low', 'medium', 'high', 'max', 'turbo'];
export const WATER_GRADES = ['off', 'min', 'low', 'medium', 'high', 'max'];
