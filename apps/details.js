// Further cards for a clicked tile, read from its daily file:
//   accumulation  precipitation accumulated over the tile's growing season: median, 8 seasons in 10, driest and wettest
//   waterBalance  precipitation and reference ET accumulated over the growing season
//   freezeWeeks   chance of a freeze in each week of the year at 0, -2 and -4 °C
import { el, card, chart, quantile, doyLabel, COLORS } from '../js/ui.js';

const name = y => `${y - 1}-${String(y).slice(2)}`;

// Daily values of one variable accumulated over the growing season of the tile (typical planting to
// typical harvest), for every season on record. Feb 29 is added to Feb 28 so that all seasons line up.
async function seasonSums(core, tile, variable) {
  const d = await core.daily(tile), s = core.manifest.seasonal, p = (await core.tiles()).features[tile].properties;
  const seasons = Array.from({ length: s.seasons }, (_, i) => s.start + i);
  const length = p.harvest_doy + 365 - p.plant_doy + 1;
  const sums = seasons.map(year => {
    const out = new Float32Array(length);
    let sum = 0, k = 0;
    for (let i = core.dayIndex(year - 1, 1, 1) + p.plant_doy - 1; k < length; i++) {
      sum += d[variable][i];
      const date = core.date(i);
      if (date.getUTCMonth() === 1 && date.getUTCDate() === 29) { if (k) out[k - 1] = sum; continue; }
      out[k++] = sum;
    }
    return out;
  });
  const band = q => Array.from({ length }, (_, k) => quantile(sums.map(r => r[k]).sort((a, b) => a - b), q));
  const x = Array.from({ length }, (_, k) => new Date(Date.UTC(2021, 0, p.plant_doy + k)));
  return { seasons, sums, median: band(0.5), low: band(0.1), high: band(0.9), x, p };
}

const line = (x, y, label, color, width = 2, dash) => ({ type: 'scatter', mode: 'lines', x, y: [...y], name: label,
  line: { color, width, dash }, hovertemplate: `${label}: <b>%{y:.0f} mm</b><extra></extra>` });
// Shaded band between the 10th and 90th percentiles: 8 seasons in 10 fall inside it
const range = (x, lo, hi, label, color) => [
  { type: 'scatter', mode: 'lines', x, y: lo, line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
  { type: 'scatter', mode: 'lines', x, y: hi, fill: 'tonexty', fillcolor: color + '22', line: { width: 0 }, name: label, hoverinfo: 'skip' },
];
const DATES = { type: 'date', tickformat: '%b', dtick: 'M1' };

export async function accumulation(core, tile) {
  const { seasons, sums, median, low, high, x, p } = await seasonSums(core, tile, 'pr');
  const totals = sums.map(r => r[r.length - 1]);
  const dry = totals.indexOf(Math.min(...totals)), wet = totals.indexOf(Math.max(...totals));
  return card('Precipitation accumulated through the growing season',
    chart([
      ...range(x, low, high, '8 seasons in 10', COLORS.blue),
      line(x, sums[wet], `Wettest, ${name(seasons[wet])}`, COLORS.green, 1.6),
      line(x, sums[dry], `Driest, ${name(seasons[dry])}`, COLORS.orange, 1.6),
      line(x, median, 'Median', COLORS.blue, 2.8),
    ], { height: 290, hovermode: 'x unified', x: DATES, y: { title: { text: 'mm' }, rangemode: 'tozero' } }),
    el('p', { class: 'source', text: `From planting (${doyLabel(p.plant_doy)}) to harvest (${doyLabel(p.harvest_doy)}), ` +
      `${seasons.length} seasons, ${name(seasons[0])} to ${name(seasons[seasons.length - 1])}.` }));
}

// Water balance of the season: median precipitation and reference ET accumulated from planting
export async function waterBalance(core, tile) {
  const [rain, demand] = await Promise.all([seasonSums(core, tile, 'pr'), seasonSums(core, tile, 'eto')]);
  const { x, p, seasons } = rain;
  return card('Rain and evaporative demand through the growing season',
    chart([
      ...range(x, demand.low, demand.high, 'Reference ET, 8 seasons in 10', COLORS.orange),
      ...range(x, rain.low, rain.high, 'Precipitation, 8 seasons in 10', COLORS.blue),
      line(x, demand.median, 'Reference ET, median', COLORS.orange, 2.8),
      line(x, rain.median, 'Precipitation, median', COLORS.blue, 2.8),
    ], { height: 300, hovermode: 'x unified', x: DATES, y: { title: { text: 'mm accumulated from planting' }, rangemode: 'tozero' } }),
    el('p', { class: 'source', text: `The gap between the two lines is the atmospheric water deficit. From planting ` +
      `(${doyLabel(p.plant_doy)}) to harvest (${doyLabel(p.harvest_doy)}), ${seasons.length} seasons.` }));
}

export async function freezeWeeks(core, tile) {
  const d = await core.daily(tile);
  const first = +core.manifest.period.start.slice(0, 4), last = +core.manifest.period.end.slice(0, 4);
  const limits = [[0, '0 °C', '#95cad6'], [-2, '-2 °C', '#33829d'], [-4, '-4 °C', '#0f3f55']];
  const x = Array.from({ length: 52 }, (_, w) => new Date(Date.UTC(2022, 0, 4 + 7 * w)));     // middle of each week
  const traces = limits.map(([limit, label, color]) => {
    const hits = new Array(52).fill(0), covered = new Array(52).fill(0);
    for (let year = first; year <= last; year++) {
      const jan1 = core.dayIndex(year, 1, 1), length = core.dayIndex(year + 1, 1, 1) - jan1;
      for (let w = 0; w < 52; w++) {
        const end = w === 51 ? length : 7 * w + 7;          // the last week takes the 1 or 2 days left over
        if (jan1 + end > core.days) break;                  // the record ends before this week does
        covered[w]++;
        for (let k = 7 * w; k < end; k++) if (d.tmin[jan1 + k] <= limit) { hits[w]++; break; }
      }
    }
    return { type: 'scatter', mode: 'lines', x, y: hits.map((h, w) => 100 * h / covered[w]), name: `${label} or colder`,
             line: { color, width: 2.4 }, hovertemplate: `${label}: <b>%{y:.0f}%</b><extra></extra>` };
  });
  return card('Chance of a freeze in each week of the year',
    chart(traces, { height: 270, hovermode: 'x unified', x: { type: 'date', tickformat: '%b', dtick: 'M1', hoverformat: 'Week of %b %d' },
                    y: { title: { text: '% of years' }, range: [0, 102], ticksuffix: '%', dtick: 25 } }),
    el('p', { class: 'source', text: `Share of the years ${first} to ${last} with at least one day at or below each temperature in that week.` }));
}
