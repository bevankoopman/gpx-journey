import type { ActivityType } from './activityType';
import type { ActivitySummary } from './analyseActivity';
import type { AnalysisErrorKind } from './errors';

/** Main thread → analysis worker. */
export type WorkerRequest =
  | { type: 'loadPostcodes'; boundariesUrl: string; localitiesUrl: string }
  | { type: 'analyse'; id: number; gpxText: string; activityType?: ActivityType };

/** Analysis worker → main thread. */
export type WorkerResponse =
  /** Analysis has begun (the postcode data is ready); the client's time limit starts now. */
  | { type: 'started'; id: number }
  | { type: 'result'; id: number; summary: ActivitySummary }
  | { type: 'error'; id: number; message: string; kind?: AnalysisErrorKind };
