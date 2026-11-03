// -----------------------------------------------------------------------------
// Finding the Valetudo robots.
//
//   mdns    Valetudo announces `_valetudo._tcp` (and `_http._tcp`) with the
//           TXT entries id (its system id), model, manufacturer, version and
//           name (the friendly name, when set). The container sits behind
//           the Docker bridge: Gladys runs the mDNS query for it
//           (manifest `network_discovery`, `gladys.scanNetwork('mdns')`).
//   typed   the addresses of the configuration, for a robot mDNS does not
//           reach (another VLAN, mDNS turned off in Valetudo).
//
// The identity of a robot is its Valetudo system id (`GET /api/v2/valetudo`,
// the same as the mDNS `id`): stable across addresses and reinstalls.
// -----------------------------------------------------------------------------

import { parseMdnsTxt } from '@gladysassistant/integration-sdk';

export const MDNS_SERVICE = '_valetudo._tcp';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * @description One typed address, normalized.
 * @param {string} value - `192.168.1.40`, `192.168.1.40:8080`, `valetudo-xyz.local`, `http://robot/`.
 * @returns {string} `host` or `host:port`, '' when invalid.
 */
export function normalizeHost(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
  const match = /^([^:]+)(?::(\d{1,5}))?$/.exec(raw);
  if (!match) {
    return '';
  }
  const [, name, port] = match;
  if (!IPV4.test(name) && !HOSTNAME.test(name)) {
    return '';
  }
  const number = Number(port);
  if (port !== undefined && (number < 1 || number > 65535)) {
    return '';
  }
  return port === undefined || number === 80
    ? name.toLowerCase()
    : `${name.toLowerCase()}:${number}`;
}

/**
 * @description The addresses typed in the configuration.
 * @param {string} raw - `192.168.1.40, robot.lan:8080`.
 * @returns {string[]} Valid addresses, without duplicates, in order.
 */
export function parseHosts(raw) {
  const hosts = String(raw ?? '')
    .split(/[\s,;]+/)
    .map(normalizeHost)
    .filter(Boolean);
  return [...new Set(hosts)];
}

/**
 * @description The identity of a robot in its external id.
 * @param {string} systemId - Valetudo system id (`SmoothWeakPigeon`).
 * @returns {string} `smoothweakpigeon`, '' when unusable.
 */
export function robotId(systemId) {
  return String(systemId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

/**
 * @description Read the mDNS answers relayed by Gladys.
 * @param {Array<{ name, host, addresses, port, txt }>} services - `scanNetwork('mdns')`.
 * @returns {Array<{ host: string, systemId: string, name: string, model: string, manufacturer: string }>} The robots.
 */
export function parseMdnsServices(services) {
  const robots = new Map();
  for (const service of Array.isArray(services) ? services : []) {
    const txt = parseMdnsTxt(Array.isArray(service?.txt) ? service.txt : []);
    const address = (Array.isArray(service?.addresses) ? service.addresses : []).find((value) =>
      IPV4.test(String(value)),
    );
    const host = normalizeHost(
      `${address ?? service?.host ?? ''}${service?.port && Number(service.port) !== 80 ? `:${service.port}` : ''}`,
    );
    const systemId = String(txt.id ?? '');
    if (!host || !robotId(systemId)) {
      continue;
    }
    robots.set(robotId(systemId), {
      host,
      systemId,
      name: String(txt.name ?? '').trim(),
      model: String(txt.model ?? '').trim(),
      manufacturer: String(txt.manufacturer ?? '').trim(),
    });
  }
  return [...robots.values()];
}
