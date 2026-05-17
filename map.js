import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken =
  'pk.eyJ1Ijoiam1mZXJuYW5kbyIsImEiOiJjbXA5Y29scGgwMGVkMnNvbXJyZTdubHczIn0.iTdNAe8M77vw7pLJxwY1-A';

const STATIONS_URL =
  'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

const TRIPS_URL =
  'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

let timeFilter = -1;

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

const stationFlow = d3
  .scaleQuantize()
  .domain([0, 1])
  .range([0, 0.5, 1]);

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const svg = d3.select('#map').select('svg');

const tooltip = d3
  .select('body')
  .append('div')
  .attr('class', 'tooltip');

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);

  return date.toLocaleString('en-US', {
    timeStyle: 'short',
  });
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat();
  }

  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);

    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (v) => v.length,
    (d) => d.end_station_id,
  );

  return stations.map((station) => {
    const id = station.short_name;

    const departuresCount = departures.get(id) ?? 0;
    const arrivalsCount = arrivals.get(id) ?? 0;

    return {
      ...station,
      departures: departuresCount,
      arrivals: arrivalsCount,
      totalTraffic: departuresCount + arrivalsCount,
    };
  });
}

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);

  const { x, y } = map.project(point);

  return { cx: x, cy: y };
}

function updateSVGSize() {
  const container = document.getElementById('map');

  svg
    .attr('width', container.offsetWidth)
    .attr('height', container.offsetHeight);
}

map.on('load', async () => {
  updateSVGSize();

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6,
    },
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://data.cambridgema.gov/resource/7t2a-j5yt.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6,
    },
  });

  const jsonData = await d3.json(STATIONS_URL);

  await d3.csv(TRIPS_URL, (trip) => {
    trip.started_at = new Date(trip.started_at);
    trip.ended_at = new Date(trip.ended_at);

    const startedMinutes = minutesSinceMidnight(trip.started_at);
    const endedMinutes = minutesSinceMidnight(trip.ended_at);

    departuresByMinute[startedMinutes].push(trip);
    arrivalsByMinute[endedMinutes].push(trip);

    return trip;
  });

  const stations = jsonData.data.stations;

  const radiusScale = d3.scaleSqrt().range([0, 25]);

  let circles = svg
    .selectAll('circle')
    .data(computeStationTraffic(stations), (d) => d.short_name)
    .join('circle')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8);

  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

  function updateScatterPlot(timeFilter) {
    const filteredStations = computeStationTraffic(
      stations,
      timeFilter,
    );

    radiusScale
      .domain([
        0,
        d3.max(filteredStations, (d) => d.totalTraffic) || 1,
      ])
      .range(timeFilter === -1 ? [0, 25] : [3, 50]);

    circles = svg
      .selectAll('circle')
      .data(filteredStations, (d) => d.short_name)
      .join('circle')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .style('--departure-ratio', (d) =>
        d.totalTraffic === 0
          ? 0.5
          : stationFlow(d.departures / d.totalTraffic),
      )
      .on('mouseenter', (event, d) => {
        tooltip
          .style('opacity', 1)
          .html(`
            <strong>${d.name}</strong><br>
            ${d.totalTraffic} trips<br>
            ${d.departures} departures<br>
            ${d.arrivals} arrivals
          `);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', `${event.pageX + 12}px`)
          .style('top', `${event.pageY + 12}px`);
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', 0);
      });

    updatePositions();
  }

  const timeSlider = document.getElementById('time-slider');

  const selectedTime =
    document.getElementById('selected-time');

  const anyTimeLabel =
    document.getElementById('any-time');

  function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }

    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener(
    'input',
    updateTimeDisplay,
  );

  updateTimeDisplay();

  map.on('move', updatePositions);

  map.on('zoom', updatePositions);

  map.on('resize', () => {
    updateSVGSize();
    updatePositions();
  });
});