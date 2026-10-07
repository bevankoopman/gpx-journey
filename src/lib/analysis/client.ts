import boundariesUrl from '../../data/postcodes/poa-2021.topo.json?url';
import localitiesUrl from '../../data/postcodes/poa-2021.localities.json?url';
import type { ActivityType } from './activityType';
import type { ActivitySummary } from './analyseActivity';
import { AnalysisError } from './errors';
import type { WorkerRequest, WorkerResponse } from './messages';

/** Far beyond any real analysis (seconds even for huge files on a phone): never leave the user waiting forever. */
const ANALYSIS_TIMEOUT_MS = 60_000;

interface Pending {
  request: Extract<WorkerRequest, { type: 'analyse' }>;
  resolve: (summary: ActivitySummary) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

let worker: Worker | undefined;
let wantPostcodes = false;
let nextId = 0;
const pending = new Map<number, Pending>();

function settle(id: number): Pending | undefined {
  const p = pending.get(id);
  pending.delete(id);
  if (p) clearTimeout(p.timer);
  return p;
}

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'started') {
        // The time limit covers analysis only, not waiting for the postcode data to download.
        const p = pending.get(data.id);
        if (p) p.timer = setTimeout(() => timedOut(data.id), ANALYSIS_TIMEOUT_MS);
        return;
      }
      const p = settle(data.id);
      if (!p) return;
      if (data.type === 'result') p.resolve(data.summary);
      else p.reject(data.kind ? new AnalysisError(data.kind, data.message) : new Error(data.message));
    };
    w.onerror = (e) => {
      // A crash can't be pinned on one request, so everything in flight fails; the next request starts afresh.
      const reason = new Error(e.message || 'Analysis failed');
      for (const id of [...pending.keys()]) settle(id)?.reject(reason);
      discardWorker();
    };
    // A replacement worker needs the postcode data too.
    if (wantPostcodes) loadPostcodesIn(w);
  }
  return worker;
}

function discardWorker() {
  worker?.terminate();
  worker = undefined;
}

/** A stuck analysis fails on its own; other requests are re-sent to a fresh worker. */
function timedOut(id: number) {
  settle(id)?.reject(new AnalysisError('too-slow', 'Analysis took too long'));
  discardWorker();
  const w = getWorker();
  for (const p of pending.values()) w.postMessage(p.request);
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
  const request = { type: 'analyse', id: nextId++, gpxText, activityType } satisfies WorkerRequest;
  return new Promise((resolve, reject) => {
    pending.set(request.id, { request, resolve, reject });
    getWorker().postMessage(request);
  });
}
