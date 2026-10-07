import { parse, type TNode } from 'txml/txml';

export interface TrackPoint {
  lon: number;
  lat: number;
  /** Epoch milliseconds, or null when the point has no (valid) `<time>`. */
  time: number | null;
}

export interface ParsedGpx {
  /** All `<trkseg>`s of all `<trk>`s, in file order. */
  segments: TrackPoint[][];
  /** Text of the first `<type>` that is a direct child of a `<trk>` (never a `<link>`'s MIME type). */
  typeLabel: string | null;
  /** The `<gpx creator="…">` attribute: the app or device that wrote the file. */
  creator: string | null;
  /** Any track point carries a power reading (Strava `<power>`, Garmin `PowerInWatts`). */
  hasPower: boolean;
}

const isElement = (n: TNode | string): n is TNode => typeof n !== 'string';
const children = (node: TNode, name: string) =>
  node.children.filter(isElement).filter((c) => c.tagName === name);
const textOf = (node: TNode | undefined) =>
  node
    ? node.children
        .filter((c) => typeof c === 'string')
        .join('')
        .trim()
    : '';
/** Tag name without its namespace prefix, e.g. `gpxpx:PowerInWatts` → `PowerInWatts`. */
const localName = (node: TNode) => node.tagName.slice(node.tagName.indexOf(':') + 1);

/** Attribute → number; missing or blank is NaN (not 0, as `Number('')` would give). */
const coordinate = (value: string | null | undefined) => (value?.trim() ? Number(value) : NaN);

const POWER_TAGS = new Set(['power', 'powerinwatts']);
function hasPowerReading(node: TNode): boolean {
  return node.children
    .filter(isElement)
    .some((c) => POWER_TAGS.has(localName(c).toLowerCase()) || hasPowerReading(c));
}

export function parseGpx(text: string): ParsedGpx {
  // GPX is XML, not HTML: txml's default void tags would swallow `<link>`'s children.
  const nodes = parse(text, { selfClosingTags: [], decodeEntities: true });
  const gpx = nodes.filter(isElement).find((n) => n.tagName === 'gpx');
  if (!gpx) throw new Error('Not a GPX file');
  const tracks = children(gpx, 'trk');
  const typeLabel = tracks.map((trk) => textOf(children(trk, 'type')[0])).find((t) => t !== '') ?? null;
  let hasPower = false;
  const segments = tracks.flatMap((trk) =>
    children(trk, 'trkseg').map((seg) =>
      children(seg, 'trkpt')
        .map((pt) => {
          const extensions = children(pt, 'extensions')[0];
          if (!hasPower && extensions && hasPowerReading(extensions)) hasPower = true;
          const time = Date.parse(textOf(children(pt, 'time')[0]));
          return {
            lon: coordinate(pt.attributes.lon),
            lat: coordinate(pt.attributes.lat),
            time: Number.isNaN(time) ? null : time,
          };
        })
        // A point without a usable position can't be drawn or measured; skip it.
        .filter((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180),
    ),
  );
  return { segments, typeLabel, creator: gpx.attributes.creator ?? null, hasPower };
}
