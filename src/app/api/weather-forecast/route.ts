import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Global Weather via Open-Meteo
 * Free weather API, no key required
 * Docs: https://open-meteo.com/en/docs
 *
 * Provides: current conditions, 7-day forecast, severe weather alerts
 * Covers: temperature, precipitation, wind, humidity, pressure, UV index
 */

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

interface WeatherPoint {
  lat: number;
  lng: number;
  name: string;
  temp: number;
  humidity: number;
  wind_speed: number;
  wind_dir: number;
  precip: number;
  pressure: number;
  uv_index: number;
  weather_code: number;
  weather_desc: string;
  alert: string | null;
}

// WMO Weather interpretation codes
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

// Major cities for weather monitoring
const MONITOR_CITIES = [
  { name: 'Washington DC', lat: 38.907, lng: -77.036 },
  { name: 'London', lat: 51.507, lng: -0.127 },
  { name: 'Paris', lat: 48.856, lng: 2.352 },
  { name: 'Berlin', lat: 52.520, lng: 13.405 },
  { name: 'Moscow', lat: 55.755, lng: 37.617 },
  { name: 'Beijing', lat: 39.904, lng: 116.407 },
  { name: 'Tokyo', lat: 35.676, lng: 139.650 },
  { name: 'Seoul', lat: 37.566, lng: 126.978 },
  { name: 'New Delhi', lat: 28.613, lng: 77.209 },
  { name: 'Singapore', lat: 1.352, lng: 103.819 },
  { name: 'Dubai', lat: 25.204, lng: 55.270 },
  { name: 'Sydney', lat: -33.868, lng: 151.209 },
  { name: 'São Paulo', lat: -23.550, lng: -46.633 },
  { name: 'Cairo', lat: 30.044, lng: 31.235 },
  { name: 'Lagos', lat: 6.524, lng: 3.379 },
  { name: 'Mumbai', lat: 19.076, lng: 72.877 },
  { name: 'Bangkok', lat: 13.756, lng: 100.501 },
  { name: 'Istanbul', lat: 41.008, lng: 28.978 },
  { name: 'Tehran', lat: 35.689, lng: 51.389 },
  { name: 'Kyiv', lat: 50.450, lng: 30.523 },
  { name: 'Gaza', lat: 31.416, lng: 34.333 },
  { name: 'Khartoum', lat: 15.500, lng: 32.560 },
  { name: 'Sanaa', lat: 15.369, lng: 44.191 },
  { name: 'Baghdad', lat: 33.315, lng: 44.366 },
  { name: 'Riyadh', lat: 24.713, lng: 46.675 },
  { name: 'Ankara', lat: 39.933, lng: 32.859 },
  { name: 'Buenos Aires', lat: -34.603, lng: -58.381 },
  { name: 'Mexico City', lat: 19.432, lng: -99.133 },
  { name: 'Los Angeles', lat: 34.052, lng: -118.243 },
  { name: 'New York', lat: 40.712, lng: -74.006 },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const mode = searchParams.get('mode') || 'global'; // 'global' or 'point'

    if (mode === 'point' && lat && lng) {
      // Single point query
      const weather = await fetchPointWeather(lat, lng);
      return NextResponse.json({
        weather,
        source: 'Open-Meteo',
        timestamp: new Date().toISOString(),
      });
    }

    // Global mode: fetch weather for all monitor cities
    const weatherPoints: WeatherPoint[] = [];

    // Batch requests in groups of 5 to avoid rate limiting
    for (let i = 0; i < MONITOR_CITIES.length; i += 5) {
      const batch = MONITOR_CITIES.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(city => fetchPointWeather(city.lat, city.lng, city.name))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          weatherPoints.push(result.value);
        }
      }
    }

    // Identify severe weather alerts
    const alerts = weatherPoints.filter(w =>
      w.weather_code >= 95 || // Thunderstorm
      w.wind_speed > 80 || // Hurricane force
      w.precip > 50 || // Heavy precipitation
      w.uv_index > 11 // Extreme UV
    );

    return NextResponse.json({
      weather: weatherPoints,
      alerts,
      total_cities: weatherPoints.length,
      total_alerts: alerts.length,
      source: 'Open-Meteo',
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    });
  } catch (error) {
    console.error('Open-Meteo API error:', error);
    return NextResponse.json({
      weather: [],
      alerts: [],
      error: 'Weather data unavailable',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

async function fetchPointWeather(lat: number, lng: number, name?: string): Promise<WeatherPoint | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,uv_index',
      timezone: 'auto',
    });

    const res = await fetch(`${OPEN_METEO_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 600 },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const current = data.current;
    if (!current) return null;

    const code = current.weather_code;
    const desc = WMO_CODES[code] || 'Unknown';

    let alert: string | null = null;
    if (code >= 95) alert = 'SEVERE: Thunderstorm';
    else if (current.wind_speed_10m > 80) alert = 'SEVERE: Hurricane-force winds';
    else if (current.precipitation > 50) alert = 'SEVERE: Heavy precipitation';
    else if (current.uv_index > 11) alert = 'EXTREME: UV index';
    else if (current.temperature_2m > 45) alert = 'EXTREME: Heat';
    else if (current.temperature_2m < -30) alert = 'EXTREME: Cold';

    return {
      lat,
      lng,
      name: name || `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
      temp: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      wind_speed: current.wind_speed_10m,
      wind_dir: current.wind_direction_10m,
      precip: current.precipitation,
      pressure: current.surface_pressure,
      uv_index: current.uv_index,
      weather_code: code,
      weather_desc: desc,
      alert,
    };
  } catch {
    return null;
  }
}
