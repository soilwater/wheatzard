// Soil: the most frequent textural class of each tile (0-25 cm), its sand,
// silt and clay, and its plant available water, from the ISSR-800 soil grids.
// The clicked tile is placed on the soil texture triangle among all tiles.
import { el, header, card, buttons, figure, figures, mapView, quantile, COLORS } from '../js/ui.js';

// USDA textural classes, colors loosely following the usual soil texture triangle
const CLASS_COLORS = {
  'sand': '#f3e3a1', 'loamy sand': '#ead07a', 'sandy loam': '#dcb35c', 'loam': '#b9925a', 'silt loam': '#9fb76e',
  'silt': '#c8d98f', 'sandy clay loam': '#c98a5b', 'clay loam': '#a3714f', 'silty clay loam': '#5f9a77',
  'sandy clay': '#b0634a', 'silty clay': '#4f7f8f', 'clay': '#6b5a8e',
};

export default {
  id: 'soil-texture',
  group: 'Soil',
  title: 'Soil texture',
  about: 'The most common soil textural class of each tile in the top 25 cm, its sand, silt and clay, and how much water the soil profile can hold for the crop.',

  async mount(host, { core, state }) {
    const [tiles, counties] = await Promise.all([core.tiles(), core.counties()]);
    const props = tiles.features.map(f => f.properties), field = core.manifest.tiles.fields;
    const names = field.texture.classes;
    const present = [...new Set(props.map(p => p.texture))].sort((a, b) => a - b);
    const classes = present.map(v => ({ value: v, name: names[v], color: CLASS_COLORS[names[v]] }));
    const count = v => props.filter(p => p.texture === v).length;
    const SHOW = [['texture', 'Textural class'], ['sand', 'Sand'], ['silt', 'Silt'], ['clay', 'Clay'], ['pawc_mm', 'Plant available water']];
    const PALETTE = { sand: 'wheat', silt: 'light', clay: 'heat', pawc_mm: 'water' };
    let which = 'texture';
    if (state.tile === null && state.county !== null) {
      state.tile = props.findIndex(p => p.fips === counties.features[state.county].properties.fips);
    }

    const title = el('h2', { class: 'card-title' }), place = el('div', { class: 'place' });
    const map = mapView(tiles, { key: 'id', outline: counties, onclick: i => { state.tile = i; showPlace(); } });
    host.append(header(this.group, this.title, this.about),
      el('div', { class: 'layout' },
        el('section', { class: 'card map-card' },
          el('div', { class: 'card-head' }, title, buttons(SHOW, which, v => { which = v; paint(); })), map.node,
          el('p', { class: 'source', text: `${field.texture.source}. Textural class: the most frequent class of the 800 m cells ` +
            'in the tile. Sand, silt and clay: mean of the cells. Plant available water capacity (0-120 cm): mean of the 1-km total ' +
            'available water map of Kansas (0-60 cm, kansas-1km project), doubled.' })),
        place));

    function paint() {
      const label = SHOW.find(s => s[0] === which)[1], tip = i => `<b>${props[i].county} County · tile ${props[i].number}</b><br>`;
      if (which === 'texture') {
        title.textContent = 'Most common textural class, 0-25 cm';
        map.paint({ z: props.map(p => p.texture), classes, hover: i => tip(i) +
          `<b>${names[props[i].texture]}</b> (${props[i].texture_pct}% of the tile)` });
        return;
      }
      const units = which === 'pawc_mm' ? ' mm' : '%', z = props.map(p => p[which]), sorted = [...z].sort((a, b) => a - b);
      title.textContent = which === 'pawc_mm' ? 'Plant available water capacity, 0-120 cm' : `${label}, 0-25 cm`;
      map.paint({ z, palette: PALETTE[which], lo: quantile(sorted, 0.02), hi: quantile(sorted, 0.98),
        format: v => v.toFixed(0) + units, title: which === 'pawc_mm' ? 'mm' : '%', hover: i => tip(i) + `${label}: <b>${z[i]}${units}</b>` });
    }

    function showPlace() {
      const i = state.tile;
      map.select(i);
      if (i === null) {
        place.replaceChildren(card(null, el('div', { class: 'empty' }, el('div', { class: 'empty-title', text: 'Pick a tile on the map' }),
          el('p', { text: 'Its soil and its place on the texture triangle will show here.' }))));
        return;
      }
      const p = props[i];
      // all tiles on the texture triangle, the clicked one on top
      const ternary = el('div', { class: 'chart' });
      setTimeout(() => Plotly.newPlot(ternary, [
        ...classes.map(c => {
          const t = props.filter(q => q.texture === c.value);
          return { type: 'scatterternary', mode: 'markers', name: c.name, a: t.map(q => q.clay), b: t.map(q => q.sand), c: t.map(q => q.silt),
            marker: { size: 7, color: c.color, line: { color: '#ffffff', width: 0.6 } },
            hovertemplate: `${c.name}<br>sand %{b}% · silt %{c}% · clay %{a}%<extra></extra>` };
        }),
        { type: 'scatterternary', mode: 'markers', name: 'This tile', a: [p.clay], b: [p.sand], c: [p.silt],
          marker: { size: 15, color: COLORS.ink, symbol: 'star', line: { color: '#fff', width: 1.5 } },
          hovertemplate: `This tile<br>sand %{b}% · silt %{c}% · clay %{a}%<extra></extra>` },
      ], {
        height: 360, margin: { l: 40, r: 40, t: 30, b: 30 }, paper_bgcolor: 'rgba(0,0,0,0)', showlegend: false,
        font: { family: 'Inter, "Segoe UI", system-ui, sans-serif', size: 11, color: '#5b6472' },
        ternary: { sum: 100, bgcolor: '#fafbfc',
          aaxis: { title: { text: 'Clay %' }, min: 0, linecolor: '#cfd5dd', gridcolor: '#edf0f4', ticksuffix: '' },
          baxis: { title: { text: 'Sand %' }, min: 0, linecolor: '#cfd5dd', gridcolor: '#edf0f4' },
          caxis: { title: { text: 'Silt %' }, min: 0, linecolor: '#cfd5dd', gridcolor: '#edf0f4' } },
        hoverlabel: { bgcolor: '#fff', bordercolor: '#cfd5dd' },
      }, { displayModeBar: false, responsive: true }), 0);
      place.replaceChildren(card(null,
        el('div', { class: 'place-head' }, el('div', { class: 'eyebrow', text: 'Tile' }), el('h2', { text: `${p.county} County · tile ${p.number}` })),
        figures(
          figure('Textural class, 0-25 cm', names[p.texture], `${p.texture_pct}% of the tile`),
          figure('Sand · silt · clay', `${p.sand} · ${p.silt} · ${p.clay}%`, 'mean of the tile, 0-25 cm'),
          figure('Plant available water', `${p.pawc_mm} mm`, 'capacity of the root zone, 0-120 cm'),
          figure('Same class in Kansas', `${count(p.texture)} tiles`, `of ${props.length}`)),
        el('h3', { class: 'sub', text: 'Soil texture triangle: every tile in Kansas' }), ternary,
        el('p', { class: 'source', text: 'Each dot is a tile, colored by its most common class. The star is this tile.' })));
    }
    paint();
    showPlace();
  },
};
