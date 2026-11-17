// Shared building blocks for pages: page header, cards, figures, buttons,
// and Plotly maps and charts with one look. Plotly is loaded as a global from
// vendor/ (no outside calls).

// ---- DOM -----------------------------------------------------------------
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  node.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));
  return node;
}

export function header(group, title, about) {
  return el('header', { class: 'page-head' },
    el('div', { class: 'eyebrow', text: group }), el('h1', { text: title }), el('p', { class: 'lead', text: about }));
}

export function card(title, ...kids) {
  return el('section', { class: 'card' }, title ? el('h2', { class: 'card-title', text: title }) : null, ...kids);
}

// A segmented control: buttons([[value, text], ...], value, onchange)
export function buttons(options, value, onchange) {
  const row = el('div', { class: 'segmented', role: 'group' });
  row.append(...options.map(([v, text]) => el('button', {
    class: v === value ? 'on' : '', text, type: 'button',
    onclick: e => { row.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); onchange(v); },
  })));
  return row;
}

export function figure(label, value, note) {
  return el('div', { class: 'figure' }, el('div', { class: 'figure-label', text: label }),
    el('div', { class: 'figure-value', text: value }), note ? el('div', { class: 'figure-note', text: note }) : null);
}
export const figures = (...items) => el('div', { class: 'figures' }, items.filter(Boolean));

export function soilLine(props, manifest) {
  const classes = manifest.tiles.fields.texture.classes;
  return `Soil, 0-25 cm: ${classes[props.texture]} (${props.texture_pct}% of the tile) · sand ${props.sand}%, silt ${props.silt}%, ` +
    `clay ${props.clay}% · plant available water capacity (0-120 cm) ${props.pawc_mm} mm`;
}

// ---- numbers and dates ---------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const quantile = (sorted, q) => {
  const p = (sorted.length - 1) * q, i = Math.floor(p);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (p - i);
};
// Day of the year (1 = January 1) as a date of a year without February 29
export const doyDate = d => new Date(Date.UTC(2022, 0, Math.round(d)));
export const doyLabel = d => { const t = doyDate(d); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`; };

// ---- color ---------------------------------------------------------------
// Sequential scales, light to dark. Pick by meaning, not by looks.
export const PALETTES = {
  water: ['#eef5fc', '#c6dcf5', '#8fbbea', '#4f93d9', '#2a6fbf', '#1a4f8f', '#0e3466'],
  heat: ['#fff5eb', '#fdd8b0', '#fbb075', '#f28443', '#da5a1f', '#ad3b10', '#7a2508'],
  dry: ['#fbf7ee', '#f1e0b8', '#e2c07c', '#cf9a45', '#b0732a', '#86501c', '#5a3212'],
  wheat: ['#fbf8ec', '#f2e6b6', '#e3c96f', '#c9a536', '#9f7f1e', '#735a12', '#4a3a0b'],
  light: ['#f6f3fb', '#ddd3f0', '#bba8e0', '#9478cc', '#7150b0', '#523690', '#36226b'],
  cold: ['#f0f7f9', '#cce6ec', '#95cad6', '#5aa7bc', '#33829d', '#1d5f7a', '#0f3f55'],
  frost: ['#0f3f55', '#1d5f7a', '#33829d', '#5aa7bc', '#95cad6', '#cce6ec', '#f0f7f9'],   // cold, darkest at the low end
};
const scale = name => (PALETTES[name] ?? PALETTES.water).map((c, i, a) => [i / (a.length - 1), c]);

// ---- Plotly theme --------------------------------------------------------
const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
const INK = '#1f2937', INK2 = '#5b6472', GRID = '#edf0f4', LINE = '#cfd5dd';
export const COLORS = { blue: '#2a6fbf', orange: '#e0712c', green: '#1f9e74', gold: '#c9a536', ink: INK, muted: '#9aa3af' };
const CONFIG = { displayModeBar: false, responsive: true, topojsonURL: new URL('../vendor/topojson/', import.meta.url).href };
const axis = extra => ({ gridcolor: GRID, linecolor: LINE, zeroline: false, ticks: 'outside', tickcolor: LINE, ticklen: 4,
  tickfont: { size: 11, color: INK2 }, automargin: true, ...extra,
  title: { font: { size: 12, color: INK2 }, standoff: 8, ...(extra.title ?? {}) } });
const LAYOUT = {
  font: { family: FONT, size: 12, color: INK }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
  margin: { l: 8, r: 12, t: 8, b: 8 }, hovermode: 'closest',
  hoverlabel: { bgcolor: '#ffffff', bordercolor: LINE, font: { family: FONT, size: 12, color: INK }, align: 'left' },
  legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { size: 11, color: INK2 }, bgcolor: 'rgba(0,0,0,0)' },
};

// Plot once the node is on the page, so that Plotly sizes it to its real width
const whenShown = (node, draw) => new Promise(done => setTimeout(() => done(draw()), 0));

export function chart(traces, { x = {}, y = {}, height = 300, ...layout } = {}) {
  const node = el('div', { class: 'chart', style: `min-height:${height}px` });
  whenShown(node, () => Plotly.newPlot(node, traces, { ...LAYOUT, height, xaxis: axis(x), yaxis: axis(y), ...layout }, CONFIG));
  return node;
}

// ---- maps ----------------------------------------------------------------
const rings = g => g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
const lines = features => {
  const lon = [], lat = [];
  for (const f of features) for (const r of rings(f.geometry)) { for (const [a, b] of r) { lon.push(a); lat.push(b); } lon.push(null); lat.push(null); }
  return { lon, lat };
};

// mapView(geojson, {key, outline, onclick(i)}) -> {node, paint({z, palette, lo, hi, hover(i), format, title}), select(i)}
// `key` is the property that names each feature; `outline` is drawn as lines on top (county lines over tiles).
export function mapView(geo, { key, outline, onclick }) {
  // Plotly's map projection wants the outer rings clockwise; GeoJSON files have them counterclockwise
  const flip = f => ({ ...f, geometry: { type: f.geometry.type, coordinates: f.geometry.type === 'Polygon'
    ? f.geometry.coordinates.map(r => [...r].reverse()) : f.geometry.coordinates.map(p => p.map(r => [...r].reverse())) } });
  const flipped = { type: 'FeatureCollection', features: geo.features.map(flip) };
  const ids = geo.features.map(f => f.properties[key]);
  const node = el('div', { class: 'map' });
  const traces = [
    { type: 'choropleth', geojson: flipped, featureidkey: 'properties.' + key, locations: ids, z: ids.map(() => 0),
      marker: { line: { width: outline ? 0.3 : 0.6, color: '#ffffff' } }, hovertemplate: '%{customdata}<extra></extra>',
      customdata: ids, showscale: true, colorscale: scale('water'),
      colorbar: { orientation: 'h', x: 0.5, xanchor: 'center', y: 0, yanchor: 'top', len: 0.55, thickness: 10,
                  outlinewidth: 0, tickfont: { size: 11, color: INK2 }, title: { side: 'top', font: { size: 12, color: INK2 } } } },
    { type: 'scattergeo', mode: 'lines', hoverinfo: 'skip', ...(outline ? lines(outline.features) : { lon: [], lat: [] }),
      line: { color: 'rgba(31,41,55,0.5)', width: 0.9 } },
    { type: 'scattergeo', mode: 'lines', hoverinfo: 'skip', lon: [], lat: [], line: { color: INK, width: 2.6 } },
    { type: 'scattergeo', mode: 'text', hoverinfo: 'skip', lon: [], lat: [], text: [],
      textfont: { size: 12, color: INK, family: 'Inter, "Segoe UI", system-ui, sans-serif' } },
  ];
  // frame the map on the features (Plotly's own fitting leaves the map small)
  let west = 180, east = -180, south = 90, north = -90;
  for (const f of geo.features) for (const r of rings(f.geometry)) for (const [a, b] of r) {
    west = Math.min(west, a); east = Math.max(east, a); south = Math.min(south, b); north = Math.max(north, b);
  }
  const pad = 0.04 * (east - west);
  const layout = { ...LAYOUT, margin: { l: 0, r: 0, t: 0, b: 64 }, showlegend: false, dragmode: false,
    geo: { visible: false, projection: { type: 'mercator' }, bgcolor: 'rgba(0,0,0,0)',
           lonaxis: { range: [west - pad, east + pad] }, lataxis: { range: [south - pad / 2, north + pad / 2] } } };
  const tall = () => Math.max(240, Math.round(node.clientWidth * 0.5)) + 64;     // about as tall as Kansas is wide
  const ready = whenShown(node, async () => {
    await Plotly.newPlot(node, traces, { ...layout, height: tall() }, { ...CONFIG, scrollZoom: false });
    node.on('plotly_click', e => { const p = e.points[0]; if (p && p.curveNumber === 0) onclick?.(p.pointNumber); });
    new ResizeObserver(() => { if (Math.abs(node.layout.height - tall()) > 4) Plotly.relayout(node, { height: tall() }); }).observe(node);
  });

  return {
    node,
    // Continuous colors from a palette, or with `classes` ([{value, name, color}]) one color per class.
    // `labels` ([{lon, lat, text}]) are written on the map.
    async paint({ z, palette, lo, hi, hover, format = v => v, title = '', classes, labels = [] }) {
      await ready;
      let colorscale, ticks, text;
      if (classes) {
        const k = classes.length;
        z = z.map(v => classes.findIndex(c => c.value === v));
        colorscale = classes.flatMap((c, i) => [[i / k, c.color], [(i + 1) / k, c.color]]);
        lo = -0.5; hi = k - 0.5; ticks = classes.map((_, i) => i); text = classes.map(c => c.name);
      } else {
        colorscale = scale(palette);
        ticks = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * i / 4); text = ticks.map(format);
      }
      Plotly.restyle(node, {
        z: [z.map(v => Number.isFinite(v) && !(classes && v < 0) ? v : null)], zmin: lo, zmax: hi, colorscale: [colorscale],
        customdata: [z.map((_, i) => hover(i))],
        'colorbar.tickvals': [ticks], 'colorbar.ticktext': [text], 'colorbar.title.text': title,
        'colorbar.len': [classes ? Math.min(0.95, 0.12 * classes.length) : 0.55],
      }, [0]);
      Plotly.restyle(node, { lon: [labels.map(l => l.lon)], lat: [labels.map(l => l.lat)], text: [labels.map(l => l.text)] }, [3]);
    },
    async select(i) {
      await ready;
      const l = i === null || i === undefined ? { lon: [], lat: [] } : lines([geo.features[i]]);
      Plotly.restyle(node, { lon: [l.lon], lat: [l.lat] }, [2]);
    },
  };
}

// ---- charts ----------------------------------------------------------------
// Chance chart: the probability of a value at least as high (or, with `below`, at most as high) as each
// value on the x axis, from all the values on record. Marks the median.
export function chanceChart(values, { units, format, below = false, dates = false, color = COLORS.blue, what, height = 250, ytitle, word }) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b), n = v.length;
  const at = t => dates ? doyDate(t) : t;
  const p = v.map((_, i) => 100 * (below ? i + 1 : n - i) / n);
  const marks = [0.5].map(q => ({ t: quantile(v, q), chance: 100 * (below ? q : 1 - q) }));
  word ??= below ? 'At most' : 'At least';
  const traces = [
    { type: 'scatter', mode: 'lines', x: v.map(at), y: p, line: { color, width: 2.5, shape: 'hv' }, fill: 'tozeroy',
      fillcolor: color + '1f', customdata: v.map(format),
      hovertemplate: `${word} %{customdata}<br><b>%{y:.0f}%</b> of ${what}<extra></extra>` },
    { type: 'scatter', mode: 'markers+text', x: marks.map(m => at(m.t)), y: marks.map(m => m.chance),
      text: marks.map(m => `&nbsp;&nbsp;<b>${m.chance.toFixed(0)}%</b> · ${format(m.t)}`), textposition: 'middle right',
      textfont: { size: 11, color: INK }, marker: { size: 9, color: '#fff', line: { color: INK, width: 2 } },
      hoverinfo: 'skip', cliponaxis: false },
  ];
  return chart(traces, {
    height, showlegend: false, margin: { l: 8, r: 40, t: 8, b: 8 },
    x: { title: { text: units }, ...(dates ? { type: 'date', tickformat: '%b %d' } : {}) },
    y: { title: { text: ytitle ?? `${word} this much (% of ${what})` }, range: [0, 104], ticksuffix: '%', dtick: 25 },
  });
}
