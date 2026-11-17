// The pages of the sidebar, in order. Each is a module (or a statPage with a
// few settings) that exports
//   { id, group, title, about, async mount(host, { core, state }) }
// Pages read data only through `core` (js/core.js); `state.tile` and
// `state.county` are the selected tile and county (their position in the
// core dataset), shared between pages.
//
// Rules for every page:
// - Show what the whole record says: medians, chances, record lows and highs.
//   Never year-by-year series, a "current" year, departures from normal or
//   trends, so that nothing goes out of date.
// - Keep controls to a minimum: a new question is a new page, not a menu.
import { statPage } from './stat-page.js';
import { doyLabel } from '../js/ui.js';
import { accumulation, waterBalance, freezeWeeks } from './details.js';
import cropCalendar from './crop-calendar.js';
import soil from './soil.js';
import plantingWater from './planting-water.js';
import yieldRain from './yield-rain.js';
import about from './about.js';

const ACRE_KM2 = 0.00404686;
const seasonName = y => `${y - 1}-${String(y).slice(2)}`;
const range = (start, n) => Array.from({ length: n }, (_, i) => start + i);

// A growing-season variable of the core dataset, by tile
const season = (name, settings) => statPage({
  unit: 'tile', each: 'seasons', digits: 0, ...settings,
  load: async core => {
    const s = await core.seasonal(name);
    const skip = s.series(0).findIndex(Number.isFinite);            // some variables start later than the weather record
    return { years: range(s.start + skip, s.years - skip), label: seasonName, series: i => s.series(i).subarray(skip), note: s.definition };
  },
});

// A county variable, over the years of the weather record
const county = (settings, series) => statPage({
  unit: 'county', digits: 0, ...settings,
  load: async (core, { counties }) => {
    const from = +core.manifest.period.start.slice(0, 4);
    const { years, of, note } = await series(core, counties);
    const keep = years.map((y, k) => [y, k]).filter(([y]) => y >= from);
    return { years: keep.map(([y]) => y), series: c => keep.map(([, k]) => of(c, k)), note };
  },
});

const SEASON = 'the growing season (from the typical planting to the typical harvest date of each tile)';

export default [
  cropCalendar,

  season('pr', { id: 'precipitation', group: 'Climate', title: 'Precipitation', units: 'mm', palette: 'water',
    labels: { min: 'Driest season', max: 'Wettest season' }, detail: accumulation,
    about: `How much rain and snow falls over ${SEASON}, and how much it varies.` }),
  season('eto', { id: 'reference-et', group: 'Climate', title: 'Reference evapotranspiration', units: 'mm', palette: 'heat',
    labels: { min: 'Lowest demand', max: 'Highest demand' },
    about: `How much water the air demands over ${SEASON}: the evapotranspiration of a well-watered grass.` }),
  season('water_deficit', { id: 'water-deficit', group: 'Climate', title: 'Atmospheric water deficit', units: 'mm', palette: 'dry',
    labels: { min: 'Wettest season', max: 'Driest season' }, detail: waterBalance,
    about: `Reference evapotranspiration minus precipitation over ${SEASON}. Positive values mean the air demanded more water than fell.` }),
  season('gdd', { id: 'degree-days', group: 'Climate', title: 'Growing degree-days', units: '°C d', palette: 'heat',
    labels: { min: 'Coolest season', max: 'Warmest season' },
    about: `Heat accumulated over ${SEASON}.` }),
  season('ptq', { id: 'photothermal', group: 'Climate', title: 'Photothermal quotient', units: 'MJ m⁻² d⁻¹ °C⁻¹', digits: 2, palette: 'light',
    about: 'Sunlight per degree of temperature around heading, when the number of grains is set. Higher values favor yield.' }),
  season('hot_days', { id: 'grain-fill-heat', group: 'Climate', title: 'Extreme heat during grain fill', units: 'days', palette: 'heat',
    labels: { max: 'Hottest season' },
    any: { label: 'Seasons with a hot day', note: 'at least one day at 34 °C or above' },
    extra: p => ['Grain fill', `${doyLabel(p.heading_doy)} to ${doyLabel(p.maturity_doy)}`, 'typical heading to maturity'],
    chanceTitle: 'Chance of at least each number of hot days',
    about: 'Days with a maximum temperature of 34 °C (93 °F) or higher from heading to maturity. Like a freeze, a single hot day ' +
      'during grain filling can shorten it and cut kernel weight.' }),
  season('last_spring_freeze', { id: 'spring-freeze', group: 'Climate', title: 'Last spring freeze', dates: true, palette: 'cold',
    labels: { min: 'Earliest', max: 'Latest' }, detail: freezeWeeks,
    chanceTitle: 'Chance of a freeze on or after each date', chanceAxis: '% of years', chanceWord: 'On or after',
    about: 'When the last freeze of spring (-2 °C or colder) comes, and the chance of a freeze after each date.' }),
  season('first_fall_freeze', { id: 'fall-freeze', group: 'Climate', title: 'First fall freeze', dates: true, palette: 'cold', below: true,
    labels: { min: 'Earliest', max: 'Latest' }, detail: freezeWeeks,
    chanceTitle: 'Chance of a freeze on or before each date', chanceAxis: '% of years', chanceWord: 'On or before',
    about: 'When the first freeze of fall (-2 °C or colder) comes after sowing, and the chance of a freeze by each date.' }),
  season('cold_snap', { id: 'cold-snap', group: 'Climate', title: 'Fall cold snap', units: '°C', digits: 1, palette: 'cold',
    labels: { min: 'Gentlest fall', max: 'Sharpest snap' },
    chanceTitle: 'Chance of a snap at least this sharp',
    about: 'The sharpest plunge of the fall: the largest drop of the nightly low over three days, from planting through December. ' +
      'Wheat hardens gradually as the fall cools, so a sudden plunge after warm weather can cause winterkill.' }),
  season('coldest_night', { id: 'coldest-night', group: 'Climate', title: 'Coldest night', units: '°C', digits: 1, palette: 'frost',
    below: true, labels: { min: 'Coldest season', max: 'Mildest season' },
    chanceTitle: 'Chance of a night at least this cold', chanceAxis: '% of seasons', chanceWord: 'At or below',
    about: 'The lowest temperature of the growing season. Hardened wheat withstands deep cold, but the risk of winterkill ' +
      'grows as the coldest night gets colder, most of all on dry soil without snow.' }),

  soil,
  plantingWater,
  season('deficit_days', { id: 'deficit-days', group: 'Soil', title: 'Deficit-days', units: 'FAW-days', palette: 'dry',
    labels: { min: 'Wettest season', max: 'Driest season' },
    about: `How dry the soil was, and for how long, over ${SEASON}.` }),
  season('spring_deficit_days', { id: 'spring-deficit-days', group: 'Soil', title: 'Spring deficit-days', units: 'FAW-days', digits: 1,
    palette: 'dry', labels: { min: 'Wettest spring', max: 'Driest spring' },
    about: 'How dry the soil was, and for how long, from March through May, the months that matter most for wheat yield.' }),
  season('surplus_days', { id: 'surplus-days', group: 'Soil', title: 'Surplus-days', units: 'FAW-days', palette: 'water',
    labels: { min: 'Driest season', max: 'Wettest season' },
    about: `How wet the soil was, and for how long, over ${SEASON}.` }),
  county({ id: 'wheat-yield', group: 'Wheat', title: 'Wheat yield', units: 'bu/ac', each: 'harvests', palette: 'wheat',
    labels: { min: 'Poorest harvest', max: 'Best harvest' },
    about: 'County winter wheat yield: what a typical, a poor and a good harvest look like.' }, async core => {
    const y = await core.annual('wheat_yield');
    return { years: range(y.start, y.years), of: (c, k) => y.series(c)[k],
             note: 'USDA-NASS county estimates, bushels per harvested acre. Counties with fewer than 15 harvests on record are left blank.' };
  }),
  county({ id: 'wheat-area', group: 'Wheat', title: 'Wheat area', units: '%', each: 'years', palette: 'wheat',
    about: 'Share of each county that is planted to winter wheat.',
    extra: p => ['Land in wheat, 2016-2023', `${p.wheat_pct.toFixed(0)}%`, 'from satellite crop maps (Cropland Data Layer)'],
  }, async (core, counties) => {
    const p = await core.annual('wheat_planted');
    const area = counties.features.map(f => f.properties.area_km2);
    return { years: range(p.start, p.years), of: (c, k) => 100 * p.series(c)[k] * ACRE_KM2 / area[c],
             note: 'Acres planted to winter wheat (USDA-NASS county estimates) as a share of the area of the county.' };
  }),
  yieldRain,
  about,
];
