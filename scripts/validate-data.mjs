// Checks referential integrity of the catalog and trips. Usage: npm run validate:data
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../src/assets/data/', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const countries = read('catalog/countries.json');
const cities = read('catalog/cities.json');
const areas = read('catalog/areas.json');
const places = read('catalog/places.json');
const routes = read('catalog/routes.json');
const spots = read('catalog/photo-spots.json');
const trips = readdirSync(new URL('trips/', root)).map(f => read(`trips/${f}`));

const errors = [];
const warnings = [];
const err = m => errors.push(m);
const warn = m => warnings.push(m);

const ids = (name, list) => {
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x.id)) err(`${name}: duplicate id "${x.id}"`);
    seen.add(x.id);
  }
  return seen;
};

const countryIds = ids('countries', countries);
const cityIds = ids('cities', cities);
const areaIds = ids('areas', areas);
const placeIds = ids('places', places);
const routeIds = ids('routes', routes);
ids('photo-spots', spots);
ids('trips', trips);

for (const c of cities) if (!countryIds.has(c.countryId)) err(`city "${c.id}": unknown countryId "${c.countryId}"`);
for (const a of areas) if (!cityIds.has(a.cityId)) err(`area "${a.id}": unknown cityId "${a.cityId}"`);
for (const p of places) if (!areaIds.has(p.areaId)) err(`place "${p.id}": unknown areaId "${p.areaId}"`);

for (const r of routes) {
  if (!r.stops.length) warn(`route "${r.id}": no stops yet`);
  const orders = r.stops.map(s => s.order);
  if (orders.some((o, i) => o !== i + 1)) err(`route "${r.id}": stop order must be 1..n without gaps`);
  for (const s of r.stops) if (!placeIds.has(s.placeId)) err(`route "${r.id}": unknown placeId "${s.placeId}"`);
}

const areaOfPlace = new Map(places.map(p => [p.id, p.areaId]));
for (const s of spots) {
  if (!areaIds.has(s.areaId)) err(`photo-spot "${s.id}": unknown areaId "${s.areaId}"`);
  for (const id of s.placeIds ?? []) {
    if (!placeIds.has(id)) err(`photo-spot "${s.id}": unknown placeId "${id}"`);
    else if (areaOfPlace.get(id) !== s.areaId) warn(`photo-spot "${s.id}": place "${id}" is in another area`);
  }
  for (const id of s.routeIds ?? []) if (!routeIds.has(id)) err(`photo-spot "${s.id}": unknown routeId "${id}"`);
}

for (const t of trips) {
  if (t.startDate > t.endDate) err(`trip "${t.id}": startDate is after endDate`);
  for (const id of t.cityIds) if (!cityIds.has(id)) err(`trip "${t.id}": unknown cityId "${id}"`);
}

const withSpots = new Set(spots.map(s => s.areaId));
const noSpots = areas.filter(a => !withSpots.has(a.id)).map(a => a.id);
if (noSpots.length) warn(`areas without photo spots (${noSpots.length}): ${noSpots.join(', ')}`);
const noHours = places.filter(p => !p.schedule?.openingHours).length;
if (noHours) warn(`places without opening hours: ${noHours} of ${places.length}`);

console.log(`countries ${countries.length}, cities ${cities.length}, areas ${areas.length}, places ${places.length}, routes ${routes.length}, photo-spots ${spots.length}, trips ${trips.length}`);
warnings.forEach(w => console.log('warn  ', w));
errors.forEach(e => console.log('ERROR ', e));
process.exit(errors.length ? 1 : 0);
