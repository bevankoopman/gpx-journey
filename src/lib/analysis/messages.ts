import type { ActivitySummary } from './analyseActivity';

/** Main thread → analysis worker. */
export type WorkerRequest = { type: 'analyse'; id: number; gpxText: string };

/** Analysis worker → main thread. */
export type WorkerResponse =
  { type: 'result'; id: number; summary: ActivitySummary } | { type: 'error'; id: number; message: string };
