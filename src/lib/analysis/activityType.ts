export type ActivityType = 'running' | 'cycling';

/**
 * How the type was decided: the file's `<type>`, power data, average speed, the untimed default,
 * or the user's toggle.
 */
export type TypeSource = 'file' | 'power' | 'speed' | 'default' | 'user';

// Strava numeric codes (9 Run, 10 Walk, 4 Hike, 1 Ride), Strava strings and Garmin activity keys.
// Walks and hikes are shown like runs (pace).
const RUNNING = ['9', 'running', 'trail_running', 'treadmill_running', 'run', '10', '4', 'walking', 'hiking'];
const CYCLING = [
  '1',
  'cycling',
  'ride',
  'ebikeride',
  'touring_bicycle',
  'road_biking',
  'mountain_biking',
  'gravel_cycling',
];
const BY_LABEL = new Map<string, ActivityType>([
  ...RUNNING.map((t) => [t, 'running'] as const),
  ...CYCLING.map((t) => [t, 'cycling'] as const),
]);

/** The activity type a GPX `<type>` label stands for, or null if it isn't one we know. */
export function typeFromLabel(label: string | null): ActivityType | null {
  return label === null ? null : (BY_LABEL.get(label.trim().toLowerCase()) ?? null);
}
