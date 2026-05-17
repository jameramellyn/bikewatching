// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1Ijoiam1mZXJuYW5kbyIsImEiOiJjbXA5Y29scGgwMGVkMnNvbXJyZTdubHczIn0.iTdNAe8M77vw7pLJxwY1-A';

const INPUT_BLUEBIKES_STATIONS_URL =
  'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

const INPUT_BLUEBIKES_TRIPS_URL =
  'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

const bikeLaneStyle = {
  'line-color': '#32D400',
  'line-width': 5,
  'line-opacity': 0.6,
};

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const svg = d3.select('#map').select('svg');

function updateSVGSize() {
  const container = document.getElementById('map');

  svg
    .attr('width', container.offsetWidth)
    .attr('height', container.offsetHeight);
}

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

updateSVGSize();

map.on('load', async () => {
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: bikeLaneStyle,
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://data.cambridgema.gov/resource/7t2a-j5yt.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: bikeLaneStyle,
  });

  let jsonData;
  let trips;

  try {
    jsonData = await d3.json(INPUT_BLUEBIKES_STATIONS_URL);
    trips = await d3.csv(INPUT_BLUEBIKES_TRIPS_URL);

    console.log('Loaded station JSON:', jsonData);
    console.log('Loaded trip CSV:', trips);
  } catch (error) {
    console.error('Error loading data:', error);
    return;
  }

  let stations = jsonData.data.stations;

  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  stations = stations.map((station) => {
    const id = station.short_name;

    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;

    return station;
  });

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  const circles = svg
    .selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('fill', 'steelblue')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8)
    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    });

  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

  updatePositions();

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', () => {
    updateSVGSize();
    updatePositions();
  });
  map.on('moveend', updatePositions);
});