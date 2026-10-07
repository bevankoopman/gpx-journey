import type { ActivityType } from './activityType';
import type { ActivitySummary } from './analyseActivity';

/** Main thread → analysis worker. */
export type WorkerRequest =
  | { type: 'loadPostcodes'; boundariesUrl: string; localitiesUrl: string }
  | { type: 'analyse'; id: number; gpxText: string; activityType?: ActivityType };

/** Analysis worker → main thread. */
export type WorkerResponse =
  { type: 'result'; id: number; summary: ActivitySummary } | { type: 'error'; id: number; message: string };
