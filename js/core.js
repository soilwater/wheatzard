// The one door to the core dataset (site/core). Apps never fetch data files
// themselves; they ask here and get values in real units (NaN = missing).
//
//   await core.init()
//   core.manifest                 period, variables, tile ids, field descriptions
//   core.variable('pr')           {name, label, units, scale, agg, spatial}
//   await core.tiles()            GeoJSON; feature order = tile order; static layers in properties
//   await core.monthly('pr')      Float32Array [tile][month]; use core.at(values, tile, month)
//   await core.daily(tile)        {pr: Float32Array [day], tmax: ..., ...} for one tile
//   await core.seasonal('gdd')    like annual, but [tile][growing season]; start = first harvest year
//   await core.counties()         GeoJSON of counties; feature order = county order
//   await core.annual('wheat_yield')   {label, units, start, years, values: Float32Array [county][year],
//                                       series(county) -> the county's years}
//   core.dayIndex(y, m, d), core.date(i), core.monthIndex(y, m)

const BASE = new URL('../core/', import.meta.url);
const DAY = 86400000;
const KEEP_DAILY = 12;            // tiles of daily data kept in memory

let manifest, startDay, startYear, startMonth;
const cache = new Map();

function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

async function get(path) {
  const r = await fetch(new URL(path, BASE));
  if (!r.ok) throw new Error(`core: ${path} (${r.status})`);
  return r;
}

function unpack(ints, scale) {
  const out = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] === manifest.missing ? NaN : ints[i] * scale;
  return out;
}

export const core = {
  async init() {
    manifest = await (await get('manifest.json')).json();
    const [y, m, d] = manifest.period.start.split('-').map(Number);
    startDay = Date.UTC(y, m - 1, d) / DAY;
    startYear = y;
    startMonth = m;
    return this;
  },

  get manifest() { return manifest; },
  get days() { return manifest.period.days; },
  get months() { return manifest.period.months; },

  variable(name) { return manifest.variables.find(v => v.name === name); },

  tiles() { return once('tiles', async () => (await get(manifest.tiles.file)).json()); },

  monthly(name) {
    return once('monthly/' + name, async () => {
      const r = await get(manifest.monthly.file.replace('{variable}', name));
      return unpack(new Int16Array(await r.arrayBuffer()), this.variable(name).scale);
    });
  },

  seasonal(name) {
    return once('seasonal/' + name, async () => {
      const s = manifest.seasonal, v = s.variables.find(a => a.name === name);
      const r = await get(s.file.replace('{variable}', name));
      const values = unpack(new Int16Array(await r.arrayBuffer()), v.scale);
      return { ...v, start: s.start, years: s.seasons, values, series: tile => values.subarray(tile * s.seasons, (tile + 1) * s.seasons) };
    });
  },

  counties() { return once('counties', async () => (await get(manifest.counties.file)).json()); },

  annual(name) {
    return once('annual/' + name, async () => {
      const v = manifest.annual.variables.find(a => a.name === name);
      const r = await get(manifest.annual.file.replace('{variable}', name));
      const values = unpack(new Int16Array(await r.arrayBuffer()), v.scale);
      return { ...v, values, series: county => values.subarray(county * v.years, (county + 1) * v.years) };
    });
  },

  at(values, tile, month) { return values[tile * manifest.period.months + month]; },

  daily(tile) {
    const key = 'daily/' + tile;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }       // most recent last
    const old = [...cache.keys()].filter(k => k.startsWith('daily/'));
    if (old.length >= KEEP_DAILY) cache.delete(old[0]);
    return once(key, async () => {
      const r = await get(manifest.daily.file.replace('{tile}', manifest.tiles.ids[tile]));
      const ints = new Int16Array(await r.arrayBuffer());
      const n = manifest.period.days, out = {};
      manifest.variables.forEach((v, k) => { out[v.name] = unpack(ints.subarray(k * n, (k + 1) * n), v.scale); });
      return out;
    });
  },

  // Position of a date in the daily series (may fall outside 0..days-1)
  dayIndex(year, month, day) { return Date.UTC(year, month - 1, day) / DAY - startDay; },
  date(i) { return new Date((startDay + i) * DAY); },                      // read with getUTC...
  // Position of a calendar month (1-12) in the monthly series
  monthIndex(year, month) { return (year - startYear) * 12 + month - startMonth; },
};
