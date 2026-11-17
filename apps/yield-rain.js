// Yield and rainfall: every county harvest without irrigation against the precipitation of its
// growing season (typical planting to harvest), with one frontier yield function for all Kansas
// counties, built as in Patrignani et al. (2014, Agron. J. 106:1329-1339). Yields are the core
// variable wheat_yield_rainfed: non-irrigated estimates where NASS published them (every county
// 1980-2007), and all-practice yields of counties with little irrigated wheat after that, so that
// recent seasons count and irrigated harvests do not lift the dry end of the frontier. Steps:
//   (i) all pairs of growing-season rainfall and county yield,
//   (ii) rainfall split into as many log-spaced bins as possible without an empty bin,
//   (iii) the highest yield of each bin,
//   (iv) a curve fitted through those yields.
// The curve is the Hoerl function y = a x^b exp(-c x): it rises, peaks at x = b/c and declines,
// and follows the bin maxima more closely than the paper's y = a + b ln x + c (ln x)^2, which ran
// below them from 350 to 700 mm and above them in dry seasons.
// Attainable yield of a county: the frontier at the county's average rainfall of the last 10 years on
// record; current yield: the county's average yield of the same years; yield gap = attainable -
// current. One frontier for the whole state, because a single county has about 45 seasons of
// weather on record and many central and eastern counties have no very dry season to anchor a
// curve of their own. The 10 years are fixed (the record ends with the 2025 harvest), so the page
// does not change with time.
import { el, header, figure, figures, chart, mapView, quantile, COLORS } from '../js/ui.js';

const MAX_BINS = 60;        // the search for the largest number of bins with no empty bin starts here
const MIN_MARKS = 4;        // a frontier needs at least this many bins
const RECENT = 10;          // years of current yield and average rainfall
const KG_HA = 67.25;        // kg/ha in one bu/ac of wheat

// Solve the 3 x 3 normal equations S [p] = r (Gauss-Jordan), or null
function solve3(S, r) {
  const M = S.map((row, i) => [...row, r[i]]);
  for (let i = 0; i < 3; i++) {
    const p = M[i][i];
    if (Math.abs(p) < 1e-12) return null;
    for (let j = i; j < 4; j++) M[i][j] /= p;
    for (let k = 0; k < 3; k++) if (k !== i) { const f = M[k][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; }
  }
  return M.map(row => row[3]);
}

// Least-squares fit of y = a x^b exp(-c x) through (x, y). Start: the straight-line fit of
// ln y = ln a + b ln x - c x; then b and c are refined by pattern search, with a worked out
// exactly for each pair. Returns {a, b, c} or null.
function hoerl(marks) {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
  for (const [x, y] of marks) {
    const row = [1, Math.log(x), -x], ly = Math.log(y);
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += row[i] * row[j]; r[i] += row[i] * ly; }
  }
  const start = solve3(S, r);
  if (!start) return null;
  const fit = (b, c) => {
    const g = marks.map(([x]) => x ** b * Math.exp(-c * x));
    const a = marks.reduce((s, [, y], i) => s + y * g[i], 0) / g.reduce((s, v) => s + v * v, 0);
    return { a, b, c, sse: marks.reduce((s, [, y], i) => s + (y - a * g[i]) ** 2, 0) };
  };
  let best = fit(start[1], start[2]), db = 0.1, dc = Math.max(Math.abs(start[2]) * 0.1, 1e-5);
  while (db > 1e-7) {
    const tries = [[db, 0], [-db, 0], [0, dc], [0, -dc], [db, dc], [-db, -dc], [db, -dc], [-db, dc]]
      .map(([u, v]) => fit(best.b + u, best.c + v));
    const better = tries.reduce((m, t) => (t.sse < m.sse ? t : m), best);
    if (better === best) { db /= 2; dc /= 2; } else best = better;
  }
  return best.a > 0 && best.c > 0 ? best : null;
}

// Highest yield of each of `bins` log-spaced rainfall bins, or null if a bin is empty
function binTops(points, bins) {
  const lx = points.map(p => Math.log(p.x)), lo = Math.min(...lx), hi = Math.max(...lx);
  const top = new Array(bins).fill(null);
  points.forEach((p, i) => {
    const k = Math.min(bins - 1, Math.floor((lx[i] - lo) / (hi - lo) * bins));
    if (!top[k] || p.y > top[k].y) top[k] = p;
  });
  return top.every(Boolean) ? top : null;
}

// Frontier yield function of a set of harvests {x: rain mm, y: yield}
function frontier(points) {
  let tops = null;
  for (let bins = Math.min(MAX_BINS, points.length); bins >= MIN_MARKS && !tops; bins--) tops = binTops(points, bins);
  if (!tops) return null;
  const marks = tops.map(p => [p.x, p.y]);
  const h = hoerl(marks);
  if (!h) return null;
  const at = x => h.a * x ** h.b * Math.exp(-h.c * x), peak = h.b / h.c;
  return { marks, peak, peakYield: at(peak), at };
}

export default {
  id: 'yield-rain',
  group: 'Wheat',
  title: 'Yield and rainfall',
  about: 'County wheat yield without irrigation against growing-season precipitation (planting to harvest), the frontier yield that the best harvests reach at each amount of rain, and how close each county usually gets to it.',

  async mount(host, { core, state }) {
    const [counties, tiles, yld, pr] = await Promise.all([core.counties(), core.tiles(), core.annual('wheat_yield_rainfed'), core.seasonal('pr')]);
    const irrigated = counties.features.map(f => f.properties.irrigated_pct);
    const LIMIT = 10;                // %, matches IRRIGATED_MAX in scripts/layers/wheat.py
    const fips = core.manifest.counties.fips, names = counties.features.map(f => f.properties.county);
    if (state.county === null && state.tile !== null) state.county = fips.indexOf(tiles.features[state.tile].properties.fips);

    // County precipitation: its tiles, weighted by area
    const first = pr.start, last = Math.min(pr.start + pr.years, yld.start + yld.years) - 1;
    const rain = names.map(() => new Float32Array(last - first + 1)), area = new Float32Array(names.length);
    tiles.features.forEach((f, i) => {
      const c = fips.indexOf(f.properties.fips), s = pr.series(i);
      area[c] += f.properties.area_km2;
      for (let k = 0; k < rain[c].length; k++) rain[c][k] += s[k] * f.properties.area_km2;
    });
    const points = [];
    names.forEach((_, c) => {
      const y = yld.series(c);
      for (let k = 0; k < rain[c].length; k++) {
        const v = y[first + k - yld.start];
        if (Number.isFinite(v) && rain[c][k] > 0) points.push({ x: rain[c][k] / area[c], y: v, c, year: first + k });
      }
    });
    const front = frontier(points);

    // Each county: rain and yield of the last 10 years; attainable yield, gap and % reached
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    const from = last - RECENT + 1;
    const county = names.map((_, c) => {
      const mine = points.filter(p => p.c === c), recent = mine.filter(p => p.year >= from);
      if (recent.length < RECENT / 2) return { mine, gap: false };
      const rainRecent = mean(recent.map(p => p.x)), current = mean(recent.map(p => p.y)), attainable = front.at(rainRecent);
      return { mine, gap: true, rainRecent, current, attainable, recent: recent.length, reach: 100 * current / attainable };
    });
    const reach = county.map(k => k.reach ?? NaN), sorted = reach.filter(Number.isFinite).sort((a, b) => a - b);
    const xs = points.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const line = Array.from({ length: 121 }, (_, k) => x0 + (x1 - x0) * k / 120);

    const scatterBox = el('div'), countyFigures = el('div');
    const map = mapView(counties, { key: 'fips', onclick: i => { state.county = i; draw(); } });
    map.paint({ z: reach, palette: 'wheat', lo: quantile(sorted, 0.02), hi: quantile(sorted, 0.98), format: v => v.toFixed(0) + '%',
      hover: i => `<b>${names[i]} County</b><br>Current yield: <b>${Number.isFinite(reach[i]) ? reach[i].toFixed(0) + '% of attainable'
        : irrigated[i] >= LIMIT ? `left out (${irrigated[i].toFixed(0)}% of its wheat irrigated)` : 'too few recent harvests'}</b>` +
        (Number.isFinite(reach[i]) ? `<br>Yield gap: ${(county[i].attainable - county[i].current).toFixed(0)} bu/ac` : '') });

    host.append(header(this.group, this.title, this.about),
      el('div', { class: 'layout layout-wide' },
        el('section', { class: 'card' },
          el('div', { class: 'card-head' }, el('h2', { class: 'card-title', text: 'Wheat yield and growing-season precipitation' })), scatterBox,
          figures(
            figure('Frontier peak', `${front.peakYield.toFixed(0)} bu/ac`, `${(front.peakYield * KG_HA / 1000).toFixed(1)} t/ha with ${front.peak.toFixed(0)} mm of rain`),
            figure('Frontier at 250 mm', `${front.at(250).toFixed(0)} bu/ac`, `${(front.at(250) * KG_HA / 1000).toFixed(1)} t/ha in a dry season`)),
          countyFigures,
          el('p', { class: 'source', text: `${points.length.toLocaleString()} county harvests without irrigation, ${first} to ${last}: USDA-NASS ` +
            `non-irrigated yields where published (every county to 2007), and after that the all-practice yields of counties where less than ` +
            `${LIMIT}% of the wheat was irrigated (2000-2007). Frontier yield function built as in ` +
            'Patrignani et al. (2014, Agron. J. 106:1329-1339): rainfall split into as many log-spaced bins as possible without an empty bin, ' +
            'the highest yield of each bin, and a curve fitted through them, here y = a x^b e^(−c x), which follows the bin maxima more ' +
            'closely than the paper\'s y = a + b ln x + c (ln x)². Attainable yield: the frontier at the county\'s average rainfall of ' +
            `${from} to ${last}; current yield: the county's average yield of the same years (bushels per harvested acre).` })),
        el('section', { class: 'card' },
          el('div', { class: 'card-head' }, el('h2', { class: 'card-title', text: `Current yield, % of attainable yield, ${from} to ${last}` })),
          map.node, el('p', { class: 'source', text: 'Each county against the frontier of all Kansas counties. 100% would mean no yield gap. Blank: ' +
            `too few recent harvests, or ${LIMIT}% or more of the county's wheat irrigated. Click a county to see where its harvests fall.` }))));

    function draw() {
      const c = state.county, k = c === null ? null : county[c];
      map.select(c);
      const traces = [
        { type: 'scattergl', mode: 'markers', x: points.map(p => p.x), y: points.map(p => p.y), name: 'County harvest',
          marker: { size: 5, color: COLORS.blue, opacity: 0.18 }, hoverinfo: 'skip' },
        { type: 'scatter', mode: 'markers', x: front.marks.map(m => m[0]), y: front.marks.map(m => m[1]), name: 'Highest yield per rain bin',
          marker: { size: 7, color: COLORS.ink }, hovertemplate: '%{x:.0f} mm: <b>%{y:.0f} bu/ac</b><extra></extra>' },
        { type: 'scatter', mode: 'lines', x: line, y: line.map(front.at), name: 'Frontier', line: { color: COLORS.ink, width: 2.6 },
          hovertemplate: 'Frontier: <b>%{y:.0f} bu/ac</b> with %{x:.0f} mm<extra></extra>' },
      ];
      if (k) {
        traces.push({ type: 'scatter', mode: 'markers', x: k.mine.map(p => p.x), y: k.mine.map(p => p.y), name: `${names[c]} County`,
          marker: { size: 9, color: COLORS.orange, line: { color: '#fff', width: 1.2 } },
          hovertemplate: `${names[c]} County<br><b>%{y:.0f} bu/ac</b> with %{x:.0f} mm<extra></extra>` });
      }
      scatterBox.replaceChildren(chart(traces, { height: 430, x: { title: { text: 'Growing-season precipitation, planting to harvest (mm)' } },
        y: { title: { text: 'Yield (bu/ac)' }, rangemode: 'tozero' } }));
      countyFigures.replaceChildren(!k ? el('p', { class: 'muted', text: 'Click a county on the map for its attainable yield and yield gap.' })
        : !k.gap ? el('p', { class: 'muted', text: irrigated[c] >= LIMIT
          ? `${names[c]} County: ${irrigated[c].toFixed(0)}% of its wheat was irrigated, so its recent yields are left out; its harvests to 2007 are the non-irrigated ones.`
          : `${names[c]} County: too few harvests from ${from} to ${last} to work out its yield gap.` })
        : el('div', {}, el('h3', { class: 'sub', text: `${names[c]} County, ${from} to ${last}` }), figures(
          figure('Growing-season rain', `${k.rainRecent.toFixed(0)} mm`, 'average, planting to harvest'),
          figure('Attainable yield', `${k.attainable.toFixed(0)} bu/ac`, 'frontier at that rain'),
          figure('Current yield', `${k.current.toFixed(0)} bu/ac`, `average of ${k.recent} harvests`),
          figure('Yield gap', `${(k.attainable - k.current).toFixed(0)} bu/ac`, `current yield at ${k.reach.toFixed(0)}% of attainable`))));
    }
    draw();
  },
};
