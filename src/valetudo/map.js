// -----------------------------------------------------------------------------
// The Valetudo map drawn as a small PNG for the dashboard widget.
//
// `GET /api/v2/robot/state/map` is a ValetudoMap (metaData.version 2):
//
//   pixelSize   size of one grid pixel in centimetres (usually 5)
//   layers      floor, wall, segment (rooms: metaData.segmentId, name,
//               active), each with `compressedPixels`: runs of
//               [x, y, count] grid pixels on one row
//   entities    robot_position, charger_location (one point, in cm),
//               path, predicted_path (polylines in cm), virtual_wall
//               (line), no_go_area, no_mop_area (polygons in cm), …
//
// The picture is cropped to the drawn area, scaled to fit `maxSize` pixels,
// with a transparent background (it sits on the widget card).
// -----------------------------------------------------------------------------

import { encodePng } from '../png.js';

export const MAP_MAX_SIZE = 480;
const MARGIN = 3; // grid pixels around the drawing

const TRANSPARENT = 0;
const FLOOR = 1;
const WALL = 2;
const PATH = 3;
const PREDICTED = 4;
const ROBOT = 5;
const CHARGER = 6;
const OUTLINE = 7;
const RESTRICTION = 8;
const ACTIVE = 9;
const ROOMS = [10, 11, 12, 13, 14, 15];

// Calm colors that read on a light and on a dark card.
const PALETTE = [
  [0, 0, 0],
  [176, 196, 214], // floor
  [62, 74, 89], // walls
  [55, 71, 79], // path
  [144, 164, 174], // predicted path
  [30, 136, 229], // robot
  [46, 125, 50], // charger
  [255, 255, 255], // marker outline
  [229, 57, 53], // virtual walls, no-go areas
  [255, 193, 7], // room being cleaned
  [129, 199, 132],
  [100, 181, 246],
  [121, 134, 203],
  [186, 104, 200],
  [77, 208, 225],
  [240, 98, 146],
];

/**
 * @description The rooms of a map.
 * @param {object} map - ValetudoMap.
 * @returns {Array<{ id: string, name: string, area: number, active: boolean }>} The rooms.
 */
export function mapSegments(map) {
  return (Array.isArray(map?.layers) ? map.layers : [])
    .filter((layer) => layer?.type === 'segment' && layer.metaData?.segmentId !== undefined)
    .map((layer) => ({
      id: String(layer.metaData.segmentId),
      name: typeof layer.metaData.name === 'string' ? layer.metaData.name.trim() : '',
      area: Number(layer.metaData.area) || 0,
      active: layer.metaData.active === true,
    }));
}

const runsOf = (layer) => {
  if (Array.isArray(layer?.compressedPixels) && layer.compressedPixels.length >= 3) {
    return layer.compressedPixels;
  }
  // Old maps: plain [x, y, x, y…] pixels.
  const runs = [];
  const pixels = Array.isArray(layer?.pixels) ? layer.pixels : [];
  for (let i = 0; i + 1 < pixels.length; i += 2) {
    runs.push(pixels[i], pixels[i + 1], 1);
  }
  return runs;
};

/**
 * @description Draw a map.
 * @param {object} map - ValetudoMap.
 * @param {object} [options] - Options.
 * @param {number} [options.maxSize] - Largest side of the picture.
 * @returns {{ png: Buffer, width: number, height: number }|null} The picture, null for an empty map.
 */
export function renderMap(map, { maxSize = MAP_MAX_SIZE } = {}) {
  const layers = Array.isArray(map?.layers) ? map.layers : [];
  const pixelSize = Number(map?.pixelSize) > 0 ? Number(map.pixelSize) : 5;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of layers) {
    const runs = runsOf(layer);
    for (let i = 0; i + 2 < runs.length; i += 3) {
      const [x, y, count] = [runs[i], runs[i + 1], runs[i + 2]];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + count - 1);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) {
    return null;
  }
  minX -= MARGIN;
  minY -= MARGIN;
  maxX += MARGIN;
  maxY += MARGIN;
  const gridWidth = maxX - minX + 1;
  const gridHeight = maxY - minY + 1;
  const largest = Math.max(gridWidth, gridHeight);
  // Whole multiples when enlarging (sharp walls), one grid pixel out of N when shrinking.
  const scale =
    largest <= maxSize
      ? Math.max(1, Math.min(8, Math.floor(maxSize / largest)))
      : 1 / Math.ceil(largest / maxSize);
  const width = Math.max(1, Math.ceil(gridWidth * scale));
  const height = Math.max(1, Math.ceil(gridHeight * scale));
  const pixels = new Uint8Array(width * height);
  const cell = Math.max(1, Math.round(scale));

  const plot = (px, py, color) => {
    if (px >= 0 && py >= 0 && px < width && py < height) {
      pixels[py * width + px] = color;
    }
  };
  const fillGrid = (x, y, color) => {
    const px = Math.floor((x - minX) * scale);
    const py = Math.floor((y - minY) * scale);
    for (let dy = 0; dy < cell; dy += 1) {
      for (let dx = 0; dx < cell; dx += 1) {
        plot(px + dx, py + dy, color);
      }
    }
  };
  const toImage = (cmX, cmY) => [
    Math.round((cmX / pixelSize - minX + 0.5) * scale),
    Math.round((cmY / pixelSize - minY + 0.5) * scale),
  ];

  const order = { floor: 0, segment: 1, wall: 2 };
  const sorted = [...layers].sort((a, b) => (order[a?.type] ?? 0) - (order[b?.type] ?? 0));
  let room = 0;
  for (const layer of sorted) {
    let color = FLOOR;
    if (layer?.type === 'wall') {
      color = WALL;
    } else if (layer?.type === 'segment') {
      color = layer.metaData?.active === true ? ACTIVE : ROOMS[room % ROOMS.length];
      room += 1;
    }
    const runs = runsOf(layer);
    for (let i = 0; i + 2 < runs.length; i += 3) {
      for (let k = 0; k < runs[i + 2]; k += 1) {
        fillGrid(runs[i] + k, runs[i + 1], color);
      }
    }
  }

  const line = ([x0, y0], [x1, y1], color, thickness = 1) => {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    let [x, y] = [x0, y0];
    for (let guard = 0; guard < 20000; guard += 1) {
      for (let t = 0; t < thickness; t += 1) {
        plot(x + t, y, color);
        plot(x, y + t, color);
      }
      if (x === x1 && y === y1) {
        break;
      }
      const e2 = 2 * error;
      if (e2 >= dy) {
        error += dy;
        x += sx;
      }
      if (e2 <= dx) {
        error += dx;
        y += sy;
      }
    }
  };
  const polyline = (points, color, thickness, closed = false) => {
    const coords = [];
    for (let i = 0; i + 1 < points.length; i += 2) {
      coords.push(toImage(points[i], points[i + 1]));
    }
    for (let i = 1; i < coords.length; i += 1) {
      line(coords[i - 1], coords[i], color, thickness);
    }
    if (closed && coords.length > 2) {
      line(coords[coords.length - 1], coords[0], color, thickness);
    }
  };
  const disc = ([cx, cy], radius, color, outline) => {
    for (let y = -radius - 1; y <= radius + 1; y += 1) {
      for (let x = -radius - 1; x <= radius + 1; x += 1) {
        const d = x * x + y * y;
        if (d <= radius * radius) {
          plot(cx + x, cy + y, color);
        } else if (outline !== undefined && d <= (radius + 1) * (radius + 1)) {
          plot(cx + x, cy + y, outline);
        }
      }
    }
  };

  const entities = Array.isArray(map?.entities) ? map.entities : [];
  const pathWidth = scale >= 3 ? 2 : 1;
  const points = (entity) => (Array.isArray(entity?.points) ? entity.points.map(Number) : []);
  for (const entity of entities) {
    if (['no_go_area', 'no_mop_area'].includes(entity?.type)) {
      polyline(points(entity), RESTRICTION, 1, true);
    } else if (entity?.type === 'virtual_wall') {
      polyline(points(entity), RESTRICTION, pathWidth);
    }
  }
  for (const entity of entities) {
    if (entity?.type === 'predicted_path') {
      polyline(points(entity), PREDICTED, 1);
    } else if (entity?.type === 'path') {
      polyline(points(entity), PATH, pathWidth);
    }
  }
  const marker = Math.max(3, Math.round(cell * 2.5));
  for (const entity of entities) {
    const [x, y] = points(entity);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    if (entity.type === 'charger_location') {
      disc(toImage(x, y), Math.max(2, marker - 1), CHARGER, OUTLINE);
    }
  }
  for (const entity of entities) {
    const [x, y] = points(entity);
    if (entity?.type === 'robot_position' && Number.isFinite(x) && Number.isFinite(y)) {
      disc(toImage(x, y), marker, ROBOT, OUTLINE);
    }
  }

  return {
    png: encodePng({ width, height, pixels, palette: PALETTE, transparent: TRANSPARENT }),
    width,
    height,
  };
}
