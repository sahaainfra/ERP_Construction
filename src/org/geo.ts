// Geometry for geofences (Part 06 REQ-ORG-F07). Pure functions. Distances use the haversine formula on a spherical Earth,
// which is accurate to about 0.5 % and adequate for site geofences of 20 m to 5 km (assumption A-12).
export const EARTH_RADIUS_M = 6_371_008.8;

export interface Point {
  latitude: number;
  longitude: number;
}

export function distanceM(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray-casting test. `ring` is a list of [longitude, latitude] vertices; the closing vertex may be repeated. */
export function pointInPolygon(point: Point, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > point.latitude !== yj > point.latitude && point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function segmentsCross(p1: readonly [number, number], p2: readonly [number, number], p3: readonly [number, number], p4: readonly [number, number]): boolean {
  const orient = (a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Problems with a polygon ring: at least three distinct vertices, closed, and not self-intersecting (§7). */
export function polygonProblems(ring: readonly (readonly [number, number])[]): string[] {
  const problems: string[] = [];
  if (ring.length < 4) return ["a polygon needs at least three vertices and a closing vertex"];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) problems.push("the polygon must be closed: the last vertex must equal the first");
  for (const [lon, lat] of ring) {
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) problems.push("a vertex is outside the valid coordinate range");
  }
  const edges = ring.slice(0, -1).map((v, i) => [v, ring[i + 1]] as const);
  let crossing = false;
  for (let i = 0; i < edges.length && !crossing; i++) {
    for (let j = i + 2; j < edges.length; j++) {
      if (i === 0 && j === edges.length - 1) continue;
      if (segmentsCross(edges[i][0], edges[i][1], edges[j][0], edges[j][1])) {
        crossing = true;
        break;
      }
    }
  }
  if (crossing) problems.push("the polygon must not cross itself");
  return problems;
}
