/** Mean earth radius used for all distances (Highlight figure definitions). */
export const EARTH_RADIUS_M = 6_371_000;

export type LonLat = readonly [lon: number, lat: number];

/** 2D great-circle distance in metres. */
export function haversineM([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
