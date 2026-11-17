// About the data: where every layer comes from and how it was made, read from
// the manifest of the core dataset.
import { el, header, card } from '../js/ui.js';

export default {
  id: 'about',
  group: 'About',
  title: 'About the data',
  about: 'Where each layer comes from, the period it covers and how it was made.',

  async mount(host, { core }) {
    const m = core.manifest, s = m.seasonal;
    const row = (name, what, period) => el('tr', {}, el('th', { text: name }), el('td', { text: what }), el('td', { text: period }));
    host.append(
      header(this.group, this.title, this.about),
      el('div', { class: 'stack' },
        card('The platform',
          el('p', { text: `Kansas is divided into ${m.tiles.count} tiles of about 15 × 15 miles (24 × 24 km), four in most counties, that add up to the county. ` +
            'Every number in Wheatzard is computed from a single frozen record, so the platform needs no updates: maps and charts show ' +
            'medians, chances and record values over the whole record, never a single year.' }),
          el('p', { text: `Weather: ${m.period.start} to ${m.period.end}. The growing season of each tile runs from its typical ` +
            'planting date to its typical harvest date (Crop calendar) and is named by its harvest year; ' +
            `${s.seasons} seasons are on record, from ${s.start - 1}-${String(s.start).slice(2)}.` })),
        card('Sources',
          el('table', { class: 'table' },
            el('thead', {}, el('tr', {}, el('th', { text: 'Layer' }), el('th', { text: 'Source' }), el('th', { text: 'Period' }))),
            el('tbody', {},
              row('Weather', m.sources.climate, `${m.period.start.slice(0, 4)} to ${m.period.end.slice(0, 4)}`),
              row('Crop calendar', m.sources['crop calendar'], `NASS progress ${s.calendar.nass_years.join(' to ')}`),
              row('Soil water', m.sources['soil water'], '2001-02 to 2025-26 seasons'),
              row('Soil', m.sources.soil, 'static'),
              row('Wheat yield and area', m.sources.wheat, '1979 to 2025'),
              row('Wheat on the land', m.sources['wheat area'], '2016 to 2023'),
              row('Tiles and counties', m.sources.tiles, 'static')))),
        card('Definitions',
          el('dl', { class: 'definitions' }, s.variables.flatMap(v => [el('dt', { text: `${v.label} (${v.units})` }), el('dd', { text: v.definition })])))));
  },
};
