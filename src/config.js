// -----------------------------------------------------------------------------
// Integration configuration: the `config_schema` values of the manifest,
// normalized so the rest of the code never deals with strings from a form or
// `undefined`.
// -----------------------------------------------------------------------------

import { parseHosts } from './valetudo/discovery.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULTS = {
  mdns_discovery: true,
  hosts: '',
  username: '',
  language: 'en',
};

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value === true || value === 'true' || value === 1 || value === '1';
};

/**
 * @description Normalize the raw configuration.
 * @param {object} raw - `gladys.config` or the `onConfigUpdated` payload.
 * @returns {{ mdns: boolean, hosts: string[], username: string, password: string, language: string }} The configuration.
 */
export function normalizeConfig(raw = {}) {
  return {
    mdns: bool(raw.mdns_discovery, DEFAULTS.mdns_discovery),
    hosts: parseHosts(raw.hosts ?? DEFAULTS.hosts),
    username: String(raw.username ?? DEFAULTS.username).trim(),
    password: typeof raw.password === 'string' ? raw.password : '',
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULTS.language,
  };
}
