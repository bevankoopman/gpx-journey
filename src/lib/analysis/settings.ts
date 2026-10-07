// Named, tunable analysis settings (Highlight figure definitions). Calibrated by "Sample GPX set and tuning the settings".

/** Point pairs faster than this are GPS spikes and dropped. Running applies until the activity type is known. */
export const SPIKE_LIMIT_KMH = { running: 60, cycling: 120 } as const;
