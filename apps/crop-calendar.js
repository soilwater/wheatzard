// Crop calendar: the typical planting, emergence, heading, maturity and harvest
// dates of winter wheat in each tile. Planting follows the K-State planting
// zones; the other stages come from the Wang-Engel phenology model calibrated on
// USDA-NASS crop progress. These dates set the growing season used by every
// other growing-season page.
import { el, header, card, buttons, figure, figures, chart, mapView, doyDate, doyLabel, COLORS } from '../js/ui.js';
import { summarize } from './stat-page.js';

const DAY = 86400000;

export default {
  id: 'crop-calendar',
  group: 'Crop',
  title: 'Crop calendar',
  about: 'When wheat is typically planted, emerges, heads, matures and is harvested in each tile. These dates set the growing season used across Wheatzard.',

  async mount(host, { core, state }) {
    const [tiles, counties, ...stages] = await Promise.all([core.tiles(), core.counties(),
      ...['emergence', 'heading', 'maturity', 'harvest'].map(v => core.seasonal(v))]);
    const props = tiles.features.map(f => f.properties), notes = core.manifest.seasonal.calendar;
    const SHOW = [['plant_doy', 'Planting window'], ['heading_doy', 'Heading'], ['maturity_doy', 'Maturity'], ['harvest_doy', 'Harvest'],
                  ['season_days', 'Season length']];
    const check = notes.nass_check;
    let which = 'plant_doy';
    if (state.tile === null && state.county !== null) {
      state.tile = props.findIndex(p => p.fips === counties.features[state.county].properties.fips);
    }
    const sorted = t => [...t].filter(Number.isFinite).sort((a, b) => a - b);

    const title = el('h2', { class: 'card-title' }), place = el('div', { class: 'place' });
    const map = mapView(tiles, { key: 'id', outline: counties, onclick: i => { state.tile = i; showPlace(); } });
    host.append(header(this.group, this.title, this.about),
      el('div', { class: 'layout' },
        el('section', { class: 'card map-card' },
          el('div', { class: 'card-head' }, title, buttons(SHOW, which, v => { which = v; paint(); })), map.node,
          el('p', { class: 'source', text: 'Planting: middle of the suggested window of the K-State planting zone of the tile (Kansas Crop Planting ' +
            'Guide, L-818). Emergence, heading, maturity and harvest: Wang-Engel model (Wang and Engel, 1998) with the vernalization response ' +
            'of Streck et al. (2003), driven by daily temperature and day length from the planting date, with the stage thresholds calibrated ' +
            'on the dates 50% of Kansas wheat is emerged, headed, mature and harvested in USDA-NASS crop progress. Error of the state dates: ' +
            `${['emergence', 'heading', 'maturity', 'harvest'].map(s => `${s} ${check[s].rmse_days} days`).join(', ')} (root mean square). ` +
            'Typical date: median over the seasons.' })),
        place));

    // K-State planting zones: one color and one label per zone, written on the tile nearest the middle of the zone
    const centers = tiles.features.map(f => {
      const r = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
      return [r.reduce((a, c) => a + c[0], 0) / r.length, r.reduce((a, c) => a + c[1], 0) / r.length];
    });
    const ZONE_COLORS = ['#c08a45', '#d7ad6a', '#e8cd96', '#f6ebcb'];
    const zones = [...new Set(props.map(p => p.zone))].sort().map(z => {
      const members = props.map((p, i) => i).filter(i => props[i].zone === z), p = props[members[0]];
      const mid = [0, 1].map(k => members.reduce((a, i) => a + centers[i][k], 0) / members.length);
      const at = members.reduce((b, i) => Math.hypot(centers[i][0] - mid[0], (centers[i][1] - mid[1]) * 1.3) <
        Math.hypot(centers[b][0] - mid[0], (centers[b][1] - mid[1]) * 1.3) ? i : b);
      const window = `${doyLabel(p.plant_start)} – ${doyLabel(p.plant_end)}`;
      return { value: z, name: `Zone ${z}`, color: ZONE_COLORS[(z - 1) % 4],
        label: { lon: centers[at][0], lat: centers[at][1], text: `<b>Zone ${z}</b><br>${window}` } };
    });

    function paint() {
      const label = SHOW.find(s => s[0] === which)[1], z = props.map(p => p[which]), s = sorted(z);
      const isDate = which !== 'season_days';
      title.textContent = which === 'plant_doy' ? 'Recommended planting window, K-State planting zones'
        : isDate ? `Typical ${label.toLowerCase()} date` : 'Typical season, planting to harvest';
      if (which === 'plant_doy') {
        map.paint({ z: props.map(p => p.zone), classes: zones, labels: zones.map(c => c.label),
          hover: i => `<b>${props[i].county} County · tile ${props[i].number}</b><br>K-State zone ${props[i].zone}: ` +
            `<b>${doyLabel(props[i].plant_start)} to ${doyLabel(props[i].plant_end)}</b>` });
        return;
      }
      const show = v => isDate ? doyLabel(v) : `${Math.round(v)} days`;
      map.paint({ z, palette: which === 'season_days' ? 'water' : 'heat',
        lo: s[0], hi: s[s.length - 1] === s[0] ? s[0] + 1 : s[s.length - 1], format: show, title: isDate ? '' : 'days',
        hover: i => `<b>${props[i].county} County · tile ${props[i].number}</b><br>${label}: <b>${show(z[i])}</b>` });
    }

    function showPlace() {
      const i = state.tile;
      map.select(i);
      if (i === null) {
        place.replaceChildren(card(null, el('div', { class: 'empty' }, el('div', { class: 'empty-title', text: 'Pick a tile on the map' }),
          el('p', { text: 'Its planting window and its usual emergence, heading, maturity and harvest dates will show here.' }))));
        return;
      }
      const years = s => Array.from({ length: s.years }, (_, k) => s.start + k);
      const p = props[i], [e, h, m, v] = stages.map(s => summarize(years(s), s.series(i)));
      const span = (s, back = 0) => `${doyLabel(s.min)} (${s.minYear - back}) to ${doyLabel(s.max)} (${s.maxYear - back})`;
      const range = s => `earliest ${doyLabel(s.min)}, latest ${doyLabel(s.max)}`;
      // Timeline from August to July: planting window, season, and the earliest to latest date of each stage on record
      const fall = d => new Date(Date.UTC(2021, 0, d)), spring = d => doyDate(d);
      const bar = (label, start, end, color, text) => ({ type: 'bar', orientation: 'h', y: [label], base: [start.getTime()],
        x: [end.getTime() - start.getTime() + DAY], marker: { color, line: { width: 0 } }, width: 0.5, hovertemplate: `${text}<extra></extra>` });
      const ROWS = ['Growing season', 'Harvest', 'Maturity', 'Heading', 'Emergence', 'Planting'];
      const timeline = chart([
        bar('Growing season', fall(p.plant_doy), spring(p.harvest_doy), COLORS.blue + '33', `Typical season: ${doyLabel(p.plant_doy)} to ${doyLabel(p.harvest_doy)}`),
        bar('Harvest', spring(v.min), spring(v.max), COLORS.orange, `Earliest to latest: ${span(v)}`),
        bar('Maturity', spring(m.min), spring(m.max), COLORS.gold, `Earliest to latest: ${span(m)}`),
        bar('Heading', spring(h.min), spring(h.max), COLORS.green, `Earliest to latest: ${span(h)}`),
        bar('Emergence', fall(e.min), fall(e.max), COLORS.green + '99', `Earliest to latest: ${span(e, 1)}`),
        bar('Planting', fall(p.plant_start), fall(p.plant_end), COLORS.gold, `K-State zone ${p.zone}: ${doyLabel(p.plant_start)} to ${doyLabel(p.plant_end)}`),
        { type: 'scatter', mode: 'markers', y: ['Planting', 'Emergence', 'Heading', 'Maturity', 'Harvest'],
          x: [fall(p.plant_doy), fall(p.emergence_doy), spring(p.heading_doy), spring(p.maturity_doy), spring(p.harvest_doy)],
          marker: { size: 11, color: '#fff', line: { color: COLORS.ink, width: 2 } }, hovertemplate: 'Typical: %{x|%b %d}<extra></extra>' },
      ], { height: 280, barmode: 'overlay', showlegend: false, margin: { l: 8, r: 16, t: 8, b: 8 },
           x: { type: 'date', range: [Date.UTC(2021, 7, 15), Date.UTC(2022, 6, 31)], tickformat: '%b', dtick: 'M1' },
           y: { categoryorder: 'array', categoryarray: ROWS } });
      place.replaceChildren(card(null,
        el('div', { class: 'place-head' }, el('div', { class: 'eyebrow', text: 'Tile' }), el('h2', { text: `${p.county} County · tile ${p.number}` })),
        figures(
          figure('Planting', doyLabel(p.plant_doy), `K-State zone ${p.zone}: ${doyLabel(p.plant_start)} to ${doyLabel(p.plant_end)}`),
          figure('Emergence', doyLabel(p.emergence_doy), range(e)),
          figure('Heading', doyLabel(p.heading_doy), range(h)),
          figure('Maturity', doyLabel(p.maturity_doy), range(m)),
          figure('Harvest', doyLabel(p.harvest_doy), range(v)),
          figure('Growing season', `${p.season_days} days`, 'typical planting to typical harvest')),
        el('h3', { class: 'sub', text: 'The wheat year in this tile' }), timeline,
        el('p', { class: 'source', text: 'Bars: the recommended planting window and the earliest to latest date of each stage on record. Circles: typical dates.' })));
    }
    paint();
    showPlace();
  },
};
