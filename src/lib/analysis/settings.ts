// Named, tunable analysis settings (Highlight figure definitions). Calibrated by "Sample GPX set and tuning the settings".

/** Point pairs faster than this are GPS spikes and dropped. Running applies until the activity type is known. */
export const SPIKE_LIMIT_KMH = { running: 60, cycling: 120 } as const;

/** Moving while net displacement over the trailing window is at least this fast. */
export const MOVING_SPEED_KMH = 1;
export const MOVING_WINDOW_S = 10;

/** Share of points that must carry a value for time-based (or elevation) figures to be shown. */
export const MIN_COVERAGE = 0.9;

/** Dead band for elevation gain: rises and dips smaller than this are treated as GPS/barometer noise. */
export const ELEVATION_HYSTERESIS_M = 5;

/** With no usable `<type>` or power data: average moving speed at or above this means cycling. */
export const CYCLING_SPEED_KMH = 15;
/** A speed-based guess inside this band (km/h) is flagged as uncertain. */
export const UNCERTAIN_SPEED_KMH = { min: 12, max: 18 } as const;

/** A postcode counts as passed through only with at least this much route inside it (filters boundary-road wobble). */
export const POSTCODE_MIN_M = 50;

/** Steps longer than this are always checked for postcode boundaries, even if both ends share a postcode. */
export const POSTCODE_SPARSE_STEP_M = 100;
