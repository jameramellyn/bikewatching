import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'YOUR_TOKEN_HERE';

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

const tooltip = d3
  .select('body')
  .append('div')
  .attr('class', 'tooltip');

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTime = document.getElementById('any-time');

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

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(minutes) {
  if (minutes === -1) return '';

  const date = new Date(2000, 0, 1, 0, minutes);
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function filterTripsByTime(trips, selectedMinutes) {
  if (selectedMinutes === -1) return trips;

  return trips.filter((trip) => {
    const started = minutesSinceMidnight(trip.started_at);
    const ended = minutesSinceMidnight(trip.ended_at);

    return (
      Math.abs(started - selectedMinutes) <= 60 ||
      Math.abs(ended - selectedMinutes) <= 60
    );
  });
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

    trips = await d3.csv(INPUT_BLUEBIKES_TRIPS_URL, (d) => ({
      ...d,
      started_at: new Date(d.started_at),
      ended_at: new Date(d.ended_at),
    }));
  } catch (error) {
    console.error('Error loading data:', error);
    return;
  }

  let stations = jsonData.data.stations;

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, 1000])
    .range([0, 25]);

  const circles = svg
    .selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('fill', 'steelblue')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8);

  function updateTraffic() {
    const selectedMinutes = +timeSlider.value;

    selectedTime.textContent = formatTime(selectedMinutes);
    anyTime.style.display = selectedMinutes === -1 ? 'block' : 'none';

    const filteredTrips = filterTripsByTime(trips, selectedMinutes);

    const departures = d3.rollup(
      filteredTrips,
      (v) => v.length,
      (d) => d.start_station_id,
    );

    const arrivals = d3.rollup(
      filteredTrips,
      (v) => v.length,
      (d) => d.end_station_id,
    );

    stations.forEach((station) => {
      const id = station.short_name;

      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
    });

    radiusScale.domain([0, d3.max(stations, (d) => d.totalTraffic) || 1]);

    circles
      .data(stations)
      .join('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

  circles
    .on('mouseover', (event, d) => {
      tooltip
        .style('opacity', 1)
        .html(
          `<strong>${d.name}</strong><br>
          ${d.totalTraffic} trips<br>
          ${d.departures} departures<br>
          ${d.arrivals} arrivals`,
        );
    })
    .on('mousemove', (event) => {
      tooltip
        .style('left', `${event.pageX + 12}px`)
        .style('top', `${event.pageY - 28}px`);
    })
    .on('mouseleave', () => {
      tooltip.style('opacity', 0);
    });

  timeSlider.addEventListener('input', updateTraffic);

  updateTraffic();
  updatePositions();

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', () => {
    updateSVGSize();
    updatePositions();
  });
});