import boundariesUrl from '../../data/postcodes/poa-2021.topo.json?url';
import localitiesUrl from '../../data/postcodes/poa-2021.localities.json?url';
import type { ActivityType } from './activityType';
import type { ActivitySummary } from './analyseActivity';
import type { WorkerRequest, WorkerResponse } from './messages';

let worker: Worker | undefined;
let wantPostcodes = false;
let nextId = 0;
const pending = new Map<number, { resolve: (s: ActivitySummary) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (!request) return;
      if (data.type === 'result') request.resolve(data.summary);
      else request.reject(new Error(data.message));
    };
    worker.onerror = (e) => {
      // A crashed worker fails everything in flight; the next request starts a fresh one.
      for (const { reject } of pending.values()) reject(new Error(e.message || 'Analysis failed'));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
    // A replacement worker (after a crash) needs the postcode data too.
    if (wantPostcodes) loadPostcodesIn(worker);
  }
  return worker;
}

const loadPostcodesIn = (w: Worker) =>
  w.postMessage({ type: 'loadPostcodes', boundariesUrl, localitiesUrl } satisfies WorkerRequest);

/** Start downloading and indexing the postcode data in the worker, so it is usually ready before an upload. */
export function prefetchPostcodes(): void {
  if (wantPostcodes) return;
  wantPostcodes = true;
  if (worker) loadPostcodesIn(worker);
  else getWorker();
}

/** Analyse GPX text off the main thread; `activityType` overrides detection (the Run/Ride toggle). */
export function analyseInWorker(gpxText: string, activityType?: ActivityType): Promise<ActivitySummary> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'analyse', id, gpxText, activityType } satisfies WorkerRequest);
  });
}
