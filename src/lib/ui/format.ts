// Display formats agreed in "Highlight figure definitions".

/** Kilometres to 2 dp, e.g. 10682 → "10.68". */
export const km = (metres: number) => (metres / 1000).toFixed(2);

/** h:mm:ss, e.g. 2993 → "0:49:53". */
export function duration(seconds: number): string {
  const s = Math.round(seconds);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${mm}:${ss}`;
}

/** Minutes per km as m:ss, e.g. 280 s/km → "4:40"; rounds to whole seconds first so 59.6 s never shows as ":60". */
export function pace(distanceM: number, movingS: number): string {
  if (distanceM <= 0 || movingS <= 0) return '–';
  const perKm = Math.round(movingS / (distanceM / 1000));
  return `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, '0')}`;
}

/** km/h to 1 dp. */
export function speed(distanceM: number, movingS: number): string {
  if (movingS <= 0) return '–';
  return (distanceM / 1000 / (movingS / 3600)).toFixed(1);
}

/** Start date and time in the activity's own timezone, e.g. "Mon, 28 Sept 2026, 6:42 am AEST". */
export function startTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(epochMs);
}

// Spoken forms for screen readers ("4:40 /km" would be read as "4 colon 40 slash k m").
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** e.g. 4751 → "1 hour 19 minutes 11 seconds". */
export function spokenDuration(seconds: number): string {
  const s = Math.round(seconds);
  const parts = [
    [Math.floor(s / 3600), 'hour'],
    [Math.floor(s / 60) % 60, 'minute'],
    [s % 60, 'second'],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, unit]) => plural(n, unit));
  return said.length ? said.join(' ') : '0 seconds';
}

/** e.g. "4 minutes 40 seconds per kilometre". */
export function spokenPace(distanceM: number, movingS: number): string {
  if (distanceM <= 0 || movingS <= 0) return 'not available';
  return `${spokenDuration(movingS / (distanceM / 1000))} per kilometre`;
}

export const spokenSpeed = (distanceM: number, movingS: number) =>
  movingS <= 0 ? 'not available' : `${speed(distanceM, movingS)} kilometres per hour`;
export const spokenKm = (metres: number) => `${km(metres)} kilometres`;
