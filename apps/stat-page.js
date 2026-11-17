// One kind of page for every "value per place and season" quantity: a map of
// tiles or counties showing what the record says (the median and the lowest
// and highest on record), and for the place that is
// clicked, its numbers and the chance of each value. No year-by-year series
// and no trends: everything shown describes the whole record.
//
// statPage({
//   id, group, title, about,       sidebar entry and heading
//   unit: 'tile' | 'county',       what the map shows
//   units, digits, palette,        how values are written and colored (palettes in js/ui.js)
//   dates,                         values are days of the year, written as dates
//   below,                         chance chart counts "at most" instead of "at least"
//   each: 'seasons',               word for one value ("47 seasons on record")
//   labels: {min, max},            names of the record low and high ("Earliest", "Latest")
//   any: {label, note},            optional: for counts of rare events, show the share of seasons with
//                                  at least one in place of the record low (which is then nearly always 0)
//   chanceTitle, chanceAxis, chanceWord   wording of the chance chart
//   load(core, {tiles, counties})  -> {years, label(year), series(i), note}
//   extra(properties),             optional: one more number for the clicked place -> [label, value, note]
//   detail(core, i),               optional: a further card for the clicked place
// })
import { el, header, card, buttons, figure, figures, mapView, chanceChart, soilLine, quantile, doyLabel } from '../js/ui.js';

const MIN_YEARS = 15;               // places with fewer values on record are left blank

// What the record of one place says. Missing years (NaN) are skipped.
export function summarize(years, series) {
  const pairs = [...series].map((v, k) => [years[k], v]).filter(([, v]) => Number.isFinite(v));
  const n = pairs.length;
  if (n < MIN_YEARS) return { n };
  const sorted = pairs.map(p => p[1]).sort((a, b) => a - b);
  return {
    n, sorted, median: quantile(sorted, 0.5), min: sorted[0], max: sorted[n - 1],
    any: 100 * sorted.filter(v => v > 0).length / n,
    minYear: pairs.find(p => p[1] === sorted[0])[0], maxYear: pairs.find(p => p[1] === sorted[n - 1])[0],
  };
}

export function statPage(cfg) {
  return {
    id: cfg.id, group: cfg.group, title: cfg.title, about: cfg.about,

    async mount(host, { core, state }) {
      const [tiles, counties] = await Promise.all([core.tiles(), core.counties()]);
      const byCounty = cfg.unit === 'county', geo = byCounty ? counties : tiles;
      if (byCounty && state.county === null && state.tile !== null) {
        state.county = core.manifest.counties.fips.indexOf(tiles.features[state.tile].properties.fips);
      }
      if (!byCounty && state.tile === null && state.county !== null) {
        state.tile = tiles.features.findIndex(f => f.properties.fips === counties.features[state.county].properties.fips);
      }
      const data = await cfg.load(core, { tiles, counties });
      const label = data.label ?? String;
      const places = geo.features.map((_, i) => summarize(data.years, data.series(i)));
      const each = cfg.each ?? 'years';
      const labels = { min: 'Record low', max: 'Record high', ...cfg.labels };
      const STATS = [['median', 'Median'], cfg.any ? ['any', cfg.any.label] : ['min', labels.min], ['max', labels.max]];
      const percent = x => `${Math.round(x)}%`;
      const name = i => {
        const p = geo.features[i].properties;
        return byCounty ? `${p.county} County` : `${p.county} County · tile ${p.number}`;
      };
      const num = x => cfg.dates ? doyLabel(x)
        : x.toLocaleString('en-US', { maximumFractionDigits: cfg.digits, minimumFractionDigits: cfg.digits });
      const unit = cfg.units === '%' ? '%' : ' ' + cfg.units;
      const write = x => !Number.isFinite(x) ? 'not enough data' : cfg.dates ? doyLabel(x) : num(x) + unit;
      const span = `${label(data.years[0])} to ${label(data.years[data.years.length - 1])}`;
      let which = 'median';

      const mapTitle = el('h2', { class: 'card-title' }), place = el('div', { class: 'place' });
      const map = mapView(geo, {
        key: byCounty ? 'fips' : 'id', outline: byCounty ? null : counties,
        onclick: i => { state[cfg.unit] = i; showPlace(); },
      });
      host.append(
        header(cfg.group, cfg.title, cfg.about),
        el('div', { class: 'layout' },
          el('section', { class: 'card map-card' },
            el('div', { class: 'card-head' }, mapTitle, buttons(STATS, which, v => { which = v; paint(); })),
            map.node,
            el('p', { class: 'source', text: data.note })),
          place));

      function paint() {
        const stat = STATS.find(k => k[0] === which)[1];
        mapTitle.textContent = `${stat} · ${span}`;
        const z = places.map(s => s[which] ?? NaN), sorted = z.filter(Number.isFinite).sort((a, b) => a - b);
        let lo = quantile(sorted, 0.02), hi = quantile(sorted, 0.98);
        if (hi === lo) hi = lo + 1;
        const share = which === 'any';
        map.paint({
          z, palette: cfg.palette, lo, hi, format: share ? percent : num, title: share ? `% of ${each}` : cfg.dates ? '' : cfg.units,
          hover: i => {
            const s = places[i], year = (which === 'min' || which === 'max') && s.median !== undefined ? ` (${label(s[which + 'Year'])})` : '';
            const value = share && Number.isFinite(z[i]) ? `${percent(z[i])} of ${each}` : write(z[i]);
            return `<b>${name(i)}</b><br>${stat}: <b>${value}</b>${year}`;
          },
        });
      }

      let shown = 0;
      async function showPlace() {
        const turn = ++shown, i = state[cfg.unit];
        map.select(i);
        if (i === null) {
          place.replaceChildren(card(null, el('div', { class: 'empty' },
            el('div', { class: 'empty-title', text: `Pick a ${cfg.unit} on the map` }),
            el('p', { text: 'Its median, its record low and high and the chance of each value will show here.' }))));
          return;
        }
        const s = places[i], props = geo.features[i].properties;
        const head = el('div', { class: 'place-head' }, el('div', { class: 'eyebrow', text: byCounty ? 'County' : 'Tile' }),
          el('h2', { text: name(i) }));
        if (s.median === undefined) {
          place.replaceChildren(card(null, head, el('p', { class: 'muted', text: `Only ${s.n} ${each} on record: too few to describe.` })));
          return;
        }
        place.replaceChildren(
          card(null, head,
            figures(
              figure('Median', write(s.median), `${s.n} ${each} on record`),
              cfg.any ? figure(cfg.any.label, percent(s.any), cfg.any.note) : figure(labels.min, write(s.min), label(s.minYear)),
              figure(labels.max, write(s.max), label(s.maxYear)),
              cfg.extra ? figure(...cfg.extra(props)) : null),
            el('h3', { class: 'sub', text: cfg.chanceTitle ?? 'How likely is each value' }),
            chanceChart(s.sorted, { units: cfg.dates ? 'Date' : cfg.units, format: write, below: cfg.below, dates: cfg.dates,
                                    what: each, ytitle: cfg.chanceAxis, word: cfg.chanceWord }),
            byCounty ? null : el('p', { class: 'source', text: soilLine(props, core.manifest) })));
        if (cfg.detail) {
          const more = await cfg.detail(core, i);
          if (turn === shown) place.append(more);             // unless another place was clicked meanwhile
        }
      }

      paint();
      showPlace();
    },
  };
}
