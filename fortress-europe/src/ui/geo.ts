// Map geometry, built once: one path per modeled region, plus the Reich core, neutrals, the Soviet rump and the rest.
import { feature } from "topojson-client";
import { geoConicConformal, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-50m.json";
import { REGIONS, REICH_CORE, NEUTRAL_COUNTRIES, SOVIET } from "../model/regions";

export const W = 760;
export const H = 640;

type Named = Feature<Geometry, { name: string }>;
const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const all = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features as Named[];
const byName = new Map(all.map((f) => [f.properties.name, f]));

const projection = geoConicConformal()
  .rotate([-14, 0])
  .parallels([42, 62])
  .fitExtent([[8, 8], [W - 8, H - 8]], { type: "MultiPoint", coordinates: [[-10, 36], [40, 36], [-8, 70], [34, 70.5], [26, 71.5], [14, 35]] });
const path = geoPath(projection);
const d = (names: string[]) => names.map((n) => byName.get(n)).filter((f): f is Named => !!f).map((f) => path(f) ?? "").join("");

export const REGION_PATHS = REGIONS.map((r) => d(r.countries));
export const REGION_CENTROIDS = REGIONS.map((r) => {
  const f = byName.get(r.countries[0]);
  if (!f) return [0, 0] as [number, number];
  // Use the largest polygon so France's centroid ignores its overseas parts.
  const g = f.geometry;
  if (g.type === "MultiPolygon") {
    const big = g.coordinates.map((c) => ({ c, a: path.area({ type: "Polygon", coordinates: c }) })).sort((a, b) => b.a - a.a)[0].c;
    return path.centroid({ type: "Polygon", coordinates: big }) as [number, number];
  }
  return path.centroid(f) as [number, number];
});
export const REICH_PATH = d(REICH_CORE);
export const NEUTRAL_PATHS = Object.keys(NEUTRAL_COUNTRIES).map((n) => ({ name: n, d: d([n]) }));
export const SOVIET_PATH = d(SOVIET);
const used = new Set([...REGIONS.flatMap((r) => r.countries), ...REICH_CORE, ...Object.keys(NEUTRAL_COUNTRIES), ...SOVIET]);
export const OTHER_PATH = all.filter((f) => !used.has(f.properties.name)).map((f) => path(f) ?? "").join("");
