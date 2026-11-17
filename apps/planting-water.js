// Soil water at planting: plant available water in the root zone (0-120 cm) at wheat planting,
// from the water left at harvest plus the part of the summer-fallow rain that the soil stores
// (precipitation storage efficiency), capped at the water the root zone can hold (PAWC):
//     water at planting = min(PAWC, fraction at harvest x PAWC + efficiency x fallow rain)
// PAWC: the 1-km total available water map of the kansas-1km project (0-60 cm), doubled.
// The fallow runs from the typical harvest to the typical planting date of the tile (Crop calendar).
// The two settings are the only controls; everything shown is over all fallows on record.
import { el, header, card, buttons, figure, figures, mapView, chanceChart, quantile, doyLabel } from '../js/ui.js';
import { summarize } from './stat-page.js';

const AT_HARVEST = [[0, 'Dry (0%)'], [0.1, '10%'], [0.2, '20%'], [0.3, '30%'], [0.5, '50%']];
const EFFICIENCY = [[0.1, '10%'], [0.15, '15%'], [0.2, '20%'], [0.25, '25%'], [0.3, '30%']];
const pct = v => `${Math.round(100 * v)}%`;

export default {
  id: 'planting-water',
  group: 'Soil',
  title: 'Soil water at planting',
  about: 'How much plant available water the soil is likely to hold at wheat planting, from the water left at harvest and the rain stored during the summer fallow.',

  async mount(host, { core, state }) {
    const [tiles, counties, fallow] = await Promise.all([core.tiles(), core.counties(), core.seasonal('fallow_pr')]);
    const props = tiles.features.map(f => f.properties);
    const years = Array.from({ length: fallow.years }, (_, k) => fallow.start + k);
    if (state.tile === null && state.county !== null) {
      state.tile = props.findIndex(p => p.fips === counties.features[state.county].properties.fips);
    }
    let atHarvest = 0.2, efficiency = 0.2;

    // Fraction of the PAWC filled at planting in every fallow of a tile, for the current settings
    const stored = i => {
      const cap = props[i].pawc_mm;
      return Float32Array.from(fallow.series(i), r => Number.isFinite(r) ? Math.min(1, atHarvest + efficiency * r / cap) : NaN);
    };

    const title = el('h2', { class: 'card-title' }), place = el('div', { class: 'place' });
    const map = mapView(tiles, { key: 'id', outline: counties, onclick: i => { state.tile = i; showPlace(); } });
    const setting = (label, options, value, set) => el('div', { class: 'setting' }, el('span', { class: 'setting-label', text: label }),
      buttons(options, value, v => { set(v); paint(); showPlace(); }));
    host.append(header(this.group, this.title, this.about),
      el('div', { class: 'settings card' },
        setting('Root zone filled at harvest (% of plant available water capacity)',AT_HARVEST, atHarvest, v => { atHarvest = v; }),
        setting('Fallow precipitation storage efficiency', EFFICIENCY, efficiency, v => { efficiency = v; })),
      el('div', { class: 'layout' },
        el('section', { class: 'card map-card' },
          el('div', { class: 'card-head' }, title), map.node,
          el('p', { class: 'source', text: 'Water at planting = fraction filled at harvest × PAWC + storage efficiency × fallow precipitation, up to the ' +
            'PAWC: the plant available water capacity of the root zone, 0-120 cm (the 1-km total available water map of Kansas for 0-60 cm, ' +
            'doubled). Fallow: from the day after the typical harvest to the day before the typical planting date of each tile. ' +
            `Precipitation: gridMET, fallows of ${years[0] - 1} to ${years[years.length - 1] - 1}.` })),
        place));

    function paint() {
      title.textContent = 'Median soil water at planting, % of the root zone filled';
      const z = props.map((_, i) => quantile([...stored(i)].filter(Number.isFinite).sort((a, b) => a - b), 0.5));
      const s = [...z].sort((a, b) => a - b);
      map.paint({ z, palette: 'water', lo: quantile(s, 0.02), hi: quantile(s, 0.98), format: pct, title: '% of PAWC',
        hover: i => `<b>${props[i].county} County · tile ${props[i].number}</b><br>Median at planting: <b>${pct(z[i])}</b>` +
          ` of ${props[i].pawc_mm} mm (${(z[i] * props[i].pawc_mm).toFixed(0)} mm)` });
    }

    function showPlace() {
      const i = state.tile;
      map.select(i);
      if (i === null) {
        place.replaceChildren(card(null, el('div', { class: 'empty' }, el('div', { class: 'empty-title', text: 'Pick a tile on the map' }),
          el('p', { text: 'Its fallow rain, the water likely stored by planting and the chance of each amount will show here.' }))));
        return;
      }
      const p = props[i], w = summarize(years, stored(i)), r = summarize(years, fallow.series(i));
      const full = 100 * w.sorted.filter(v => v >= 0.999).length / w.n;
      const mm = v => `${(v * p.pawc_mm).toFixed(0)} mm`;
      place.replaceChildren(card(null,
        el('div', { class: 'place-head' }, el('div', { class: 'eyebrow', text: 'Tile' }), el('h2', { text: `${p.county} County · tile ${p.number}` })),
        figures(
          figure('Fallow precipitation', `${r.median.toFixed(0)} mm`, `median, ${doyLabel(p.harvest_doy + 1)} to ${doyLabel(p.plant_doy - 1)}`),
          figure('Filled at planting', pct(w.median), `median, ${mm(w.median)}`),
          figure('Lowest', pct(w.min), `${mm(w.min)}, fallow of ${w.minYear - 1}`),
          figure('Highest', pct(w.max), full > 0 ? `root zone full in ${full.toFixed(0)}% of fallows` : `${mm(w.max)}, fallow of ${w.maxYear - 1}`),
          figure('Root zone holds', `${p.pawc_mm} mm`, 'plant available water capacity, 0-120 cm')),
        el('h3', { class: 'sub', text: 'Chance of each amount of soil water at planting' }),
        chanceChart(w.sorted.map(v => 100 * v), { units: '%', format: v => `${v.toFixed(0)}% (${(v / 100 * p.pawc_mm).toFixed(0)} mm)`,
          what: 'fallows', ytitle: '% of fallows' }),
        el('p', { class: 'source', text: `Root zone ${pct(atHarvest)} full at harvest and ${pct(efficiency)} of the fallow rain stored, ` +
          `over ${w.n} fallows.` })));
    }
    paint();
    showPlace();
  },
};
