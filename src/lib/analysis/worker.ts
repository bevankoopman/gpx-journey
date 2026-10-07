/// <reference lib="webworker" />
import { analyseActivity } from './analyseActivity';
import type { WorkerRequest, WorkerResponse } from './messages';

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    post({ type: 'result', id: data.id, summary: analyseActivity(data.gpxText) });
  } catch (err) {
    post({ type: 'error', id: data.id, message: err instanceof Error ? err.message : String(err) });
  }
};
