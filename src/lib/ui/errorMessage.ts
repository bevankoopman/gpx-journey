import { AnalysisError } from '../analysis/errors';

/** What to tell someone whose file couldn't be analysed, and what to try next. */
export function errorMessage(err: unknown): string {
  if (err instanceof AnalysisError) {
    switch (err.kind) {
      case 'not-gpx':
        return 'That isn’t a GPX file. Export the activity as GPX (Strava, Garmin Connect and Komoot all offer it) and try again.';
      case 'malformed':
        return 'This GPX file looks damaged or incomplete, so it couldn’t be read. Try exporting it again.';
      case 'no-points':
        return 'This GPX file has no track points, so there’s no route to show. It may hold only waypoints or a planned route.';
      case 'too-slow':
        return 'This file took too long to analyse; it may be too large for this device. Try a shorter activity or another device.';
    }
  }
  return 'Something went wrong while analysing this file. Please try again.';
}
