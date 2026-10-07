/// <reference lib="webworker" />
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { analyseActivity } from './analyseActivity';
import { AnalysisError } from './errors';
import type { WorkerRequest, WorkerResponse } from './messages';
import { buildPostcodeIndex, type PostcodeIndex } from './postcodes';

const post = (message: WorkerResponse) => self.postMessage(message);
const POSTCODE_WAIT_MS = 45_000;

/** Resolves to null if the postcode data can't be loaded: activities still analyse, without postcodes. */
let postcodeIndex: Promise<PostcodeIndex | null> = Promise.resolve(null);

async function loadPostcodes(boundariesUrl: string, localitiesUrl: string): Promise<PostcodeIndex | null> {
  try {
    const [topology, localities] = await Promise.all([
      fetch(boundariesUrl).then((r) => (r.ok ? (r.json() as Promise<Topology>) : Promise.reject(r.status))),
      fetch(localitiesUrl).then((r) =>
        r.ok ? (r.json() as Promise<Record<string, string[]>>) : Promise.reject(r.status),
      ),
    ]);
    const layer = topology.objects.postcodes;
    if (!layer) throw new Error('postcode layer missing');
    const boundaries = feature(topology, layer) as FeatureCollection<
      Polygon | MultiPolygon,
      { code: string }
    >;
    return buildPostcodeIndex(boundaries, localities);
  } catch (err) {
    console.error('Postcode data unavailable', err);
    return null;
  }
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'loadPostcodes') {
    postcodeIndex = loadPostcodes(data.boundariesUrl, data.localitiesUrl);
    return;
  }
  try {
    // A stalled download mustn't hold every analysis hostage: after a while, analyse without postcodes.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), POSTCODE_WAIT_MS));
    const postcodes = (await Promise.race([postcodeIndex, timeout])) ?? undefined;
    post({ type: 'started', id: data.id });
    post({
      type: 'result',
      id: data.id,
      summary: analyseActivity(data.gpxText, { activityType: data.activityType, postcodes }),
    });
  } catch (err) {
    post({
      type: 'error',
      id: data.id,
      message: err instanceof Error ? err.message : String(err),
      kind: err instanceof AnalysisError ? err.kind : undefined,
    });
  }
};
