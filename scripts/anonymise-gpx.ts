/**
 * Makes a real GPX export safe to commit as a test fixture (the repo is public).
 *
 * Whitelist, not blacklist: the output is a fresh, minimal GPX holding only what the analysis uses:
 * the creator, the first track's <type>, and each track point's lat/lon, <ele>, <time> and power reading.
 * Names, descriptions, metadata, waypoints, routes, comments, heart rate and every other extension are gone.
 *
 * Places that would identify someone are cut out: the start, the end and every stop (a gap of 10+ minutes,
 * or under 100 m of movement in 10 minutes), such as home or a workplace. Each is removed with a circle of
 * radius CUT_RADIUS_M around a point randomly offset up to CUT_OFFSET_M from the real place, so the real
 * place is always well inside the hole but not at its centre. The track is split at each cut.
 * Timestamps are shifted so the activity starts at 2026-01-01T00:00:00Z (intervals unchanged).
 *
 * Usage: npx tsx scripts/anonymise-gpx.ts <in.gpx> <out.gpx> [--radius-m 800]
 */
import { randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const FAKE_START = Date.parse('2026-01-01T00:00:00Z');
const CUT_OFFSET_M = 300;
const STOP_GAP_S = 600;
const STOP_MOVE_M = 100;
const EARTH_RADIUS_M = 6_371_000;
const M_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

interface Point {
  lat: number;
  lon: number;
  ele: number | null;
  time: number | null;
  power: string | null;
}
type LatLon = Pick<Point, 'lat' | 'lon'>;

function haversineM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const text = (block: string, tag: string) =>
  new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, 'i').exec(block)?.[1]?.trim() ?? null;
const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)?.[1];

function parse(gpx: string): { creator: string | null; type: string | null; segments: Point[][] } {
  const track = /<trk\b[\s\S]*?<\/trk>/.exec(gpx)?.[0] ?? '';
  // The track's own <type> sits before its first <trkseg> (and outside any <link>).
  const header = track.split(/<trkseg\b/)[0]!.replace(/<link\b[\s\S]*?<\/link>/g, '');
  const segments = [...gpx.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/g)].map(([, seg]) =>
    [...seg!.matchAll(/<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g)].map(([, tag, body = '']) => {
      const lat = Number(attr(tag!, 'lat'));
      const lon = Number(attr(tag!, 'lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Unreadable track point: ${tag}`);
      const ele = Number(text(body, 'ele'));
      const time = Date.parse(text(body, 'time') ?? '');
      return {
        lat,
        lon,
        ele: Number.isFinite(ele) ? ele : null,
        time: Number.isNaN(time) ? null : time,
        power: text(body, 'power') ?? text(body, 'PowerInWatts'),
      };
    }),
  );
  return {
    creator: attr(/<gpx\b[^>]*>/.exec(gpx)?.[0] ?? '', 'creator') ?? null,
    type: text(header, 'type'),
    segments,
  };
}

/** Places to hide: the start, the end and every stop. */
function sensitivePlaces(points: Point[]): LatLon[] {
  const places: LatLon[] = [];
  if (points[0]) places.push(points[0]);
  if (points.at(-1)) places.push(points.at(-1)!);
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const next = points[i + 1];
    if (next && p.time !== null && next.time !== null && next.time - p.time >= STOP_GAP_S * 1000)
      places.push(p);
    if (p.time === null) continue;
    j = Math.max(j, i);
    while (j < points.length && (points[j]!.time ?? Infinity) - p.time < STOP_GAP_S * 1000) j++;
    if (j < points.length && haversineM(p, points[j]!) < STOP_MOVE_M) places.push(p);
  }
  return places;
}

/** A random point within CUT_OFFSET_M of `place`. */
function offset(place: LatLon): LatLon {
  const angle = (randomInt(0, 360_000) / 1000) * (Math.PI / 180);
  const dist = Math.sqrt(randomInt(0, 1_000_001) / 1_000_000) * CUT_OFFSET_M;
  return {
    lat: place.lat + (dist * Math.cos(angle)) / M_PER_DEG_LAT,
    lon: place.lon + (dist * Math.sin(angle)) / (M_PER_DEG_LAT * Math.cos((place.lat * Math.PI) / 180)),
  };
}

function anonymise(gpx: string, radiusM: number): { output: string; kept: number; cuts: number } {
  const { creator, type, segments } = parse(gpx);
  const centres = sensitivePlaces(segments.flat()).map(offset);
  const hidden = (p: Point) => centres.some((c) => haversineM(c, p) < radiusM);

  // Drop hidden points, starting a new segment wherever points were cut out.
  const kept: Point[][] = [];
  for (const seg of segments) {
    let current: Point[] = [];
    for (const p of seg) {
      if (hidden(p)) {
        if (current.length) kept.push(current);
        current = [];
      } else current.push(p);
    }
    if (current.length) kept.push(current);
  }

  const first = kept.flat().find((p) => p.time !== null)?.time;
  const shift = first == null ? 0 : FAKE_START - first;
  const iso = (ms: number) => new Date(ms + shift).toISOString().replace('.000Z', 'Z');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const pt = (p: Point) =>
    `<trkpt lat="${p.lat}" lon="${p.lon}">` +
    (p.ele !== null ? `<ele>${p.ele}</ele>` : '') +
    (p.time !== null ? `<time>${iso(p.time)}</time>` : '') +
    (p.power !== null ? `<extensions><power>${esc(p.power)}</power></extensions>` : '') +
    '</trkpt>';
  const output = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1"${creator ? ` creator="${esc(creator)}"` : ''} xmlns="http://www.topografix.com/GPX/1/1">`,
    '<trk>',
    ...(type ? [`<type>${esc(type)}</type>`] : []),
    ...kept.map((seg) => `<trkseg>\n${seg.map(pt).join('\n')}\n</trkseg>`),
    '</trk>',
    '</gpx>',
    '',
  ].join('\n');
  return { output, kept: kept.flat().length, cuts: centres.length };
}

const args = process.argv.slice(2);
const [input, output] = args;
const radiusFlag = args.indexOf('--radius-m');
const radiusM = radiusFlag >= 0 ? Number(args[radiusFlag + 1]) : 800;
if (!input || !output || input.startsWith('--') || output.startsWith('--')) {
  console.error('Usage: npx tsx scripts/anonymise-gpx.ts <in.gpx> <out.gpx> [--radius-m 800]');
  process.exit(1);
}
if (!Number.isFinite(radiusM) || radiusM <= CUT_OFFSET_M) {
  console.error(
    `--radius-m must be a number above ${CUT_OFFSET_M} (the random offset), got "${args[radiusFlag + 1]}"`,
  );
  process.exit(1);
}
const result = anonymise(await readFile(input, 'utf8'), radiusM);
if (result.kept === 0) {
  console.error('Nothing left after cutting out the start, end and stops; refusing to write an empty track.');
  process.exit(1);
}
await writeFile(output, result.output);
console.log(
  `${output}: ${result.kept} track points kept; ${result.cuts} places cut out (radius ${radiusM} m)`,
);
