import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — GDELT Global Events API
 * Fetches real-time global events from GDELT Project
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 * No API key required
 *
 * GDELT monitors news media in 100+ languages and codes events
 * using the CAMEO (Conflict and Mediation Event Observations) ontology
 */

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_GEO_API = 'https://api.gdeltproject.org/api/v2/geo/geo';

interface GDELTEvent {
  id: string;
  title: string;
  url: string;
  domain: string;
  date: string;
  lat: number;
  lng: number;
  location: string;
  country: string;
  tone: number; // -100 (negative) to +100 (positive)
  event_code: string;
  event_type: string;
  goldstein_scale: number; // -10 (conflict) to +10 (cooperation)
  num_mentions: number;
  num_sources: number;
  num_articles: number;
}

// CAMEO event code prefixes
const CAMEO_TYPES: Record<string, string> = {
  '01': 'MAKE PUBLIC STATEMENT',
  '02': 'APPEAL',
  '03': 'EXPRESS INTENT TO COOPERATE',
  '04': 'CONSULT',
  '05': 'ENGAGE IN DIPLOMATIC COOPERATION',
  '06': 'ENGAGE IN MATERIAL COOPERATION',
  '07': 'PROVIDE AID',
  '08': 'YIELD',
  '09': 'INVESTIGATE',
  '10': 'DEMAND',
  '11': 'DISAPPROVE',
  '12': 'REJECT',
  '13': 'THREATEN',
  '14': 'PROTEST',
  '15': 'EXHIBIT FORCE POSTURE',
  '16': 'REDUCE RELATIONS',
  '17': 'COERCE',
  '18': 'ASSAULT',
  '19': 'FIGHT',
  '20': 'USE UNCONVENTIONAL MASS VIOLENCE',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || 'global events';
    const mode = searchParams.get('mode') || 'events'; // 'events' or 'geo'
    const timespan = searchParams.get('timespan') || '24h';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 250);
    const format = 'json';

    if (mode === 'geo') {
      // GDELT Geo API - returns events with coordinates
      const geoUrl = `${GDELT_GEO_API}?query=${encodeURIComponent(query)}&format=${format}&timespan=${timespan}&maxrecords=${limit}`;
      const res = await fetch(geoUrl, {
        signal: AbortSignal.timeout(15000),
        next: { revalidate: 300 },
      });

      if (!res.ok) {
        throw new Error(`GDELT Geo API returned ${res.status}`);
      }

      const text = await res.text();
      const events = parseGDELTGeo(text);

      return NextResponse.json({
        events,
        total: events.length,
        source: 'GDELT Geo',
        timestamp: new Date().toISOString(),
      });
    }

    // GDELT Doc API - returns news articles with event coding
    const docUrl = `${GDELT_DOC_API}?query=${encodeURIComponent(query)}&format=${format}&timespan=${timespan}&maxrecords=${limit}&mode=artlist&sort=hybridrel`;

    const res = await fetch(docUrl, {
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      throw new Error(`GDELT Doc API returned ${res.status}`);
    }

    const data = await res.json();
    const articles = data.articles || [];

    const events: GDELTEvent[] = articles.map((article: any, idx: number) => ({
      id: `gdelt-${idx}`,
      title: article.title || '',
      url: article.url || '',
      domain: article.domain || '',
      date: article.seendate || article.date || new Date().toISOString(),
      lat: parseFloat(article.lat) || 0,
      lng: parseFloat(article.lon) || 0,
      location: article.location || '',
      country: article.country || '',
      tone: parseFloat(article.tone) || 0,
      event_code: article.eventcode || '',
      event_type: CAMEO_TYPES[article.eventcode?.substring(0, 2)] || 'UNKNOWN',
      goldstein_scale: parseFloat(article.goldsteinscale) || 0,
      num_mentions: parseInt(article.nummentions) || 0,
      num_sources: parseInt(article.numsources) || 0,
      num_articles: parseInt(article.numarticles) || 0,
    })).filter(e => e.lat !== 0 && e.lng !== 0); // Only events with coordinates

    // Aggregate stats
    const stats = {
      total: events.length,
      countries: [...new Set(events.map(e => e.country).filter(Boolean))].length,
      avg_tone: events.length > 0
        ? Math.round(events.reduce((sum, e) => sum + e.tone, 0) / events.length * 10) / 10
        : 0,
      event_types: {} as Record<string, number>,
    };

    for (const e of events) {
      const type = e.event_type || 'UNKNOWN';
      stats.event_types[type] = (stats.event_types[type] || 0) + 1;
    }

    return NextResponse.json({
      events,
      stats,
      source: 'GDELT',
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('GDELT API error:', error);
    // Return fallback data
    return NextResponse.json({
      events: getFallbackGDELT(),
      total: getFallbackGDELT().length,
      source: 'fallback',
      error: 'GDELT API unavailable',
      timestamp: new Date().toISOString(),
    });
  }
}

function parseGDELTGeo(text: string): GDELTEvent[] {
  try {
    const data = JSON.parse(text);
    const features = data.features || [];
    return features.map((f: any, idx: number) => ({
      id: `gdelt-geo-${idx}`,
      title: f.properties?.name || 'GDELT Event',
      url: f.properties?.url || '',
      domain: '',
      date: f.properties?.date || new Date().toISOString(),
      lat: f.geometry?.coordinates?.[1] || 0,
      lng: f.geometry?.coordinates?.[0] || 0,
      location: f.properties?.name || '',
      country: f.properties?.country || '',
      tone: 0,
      event_code: '',
      event_type: 'GEO_EVENT',
      goldstein_scale: 0,
      num_mentions: 0,
      num_sources: 0,
      num_articles: 0,
    }));
  } catch {
    return [];
  }
}

function getFallbackGDELT(): GDELTEvent[] {
  return [
    { id: 'fb-1', title: 'Diplomatic talks on trade agreement', url: '', domain: 'reuters.com', date: new Date().toISOString(), lat: 38.9, lng: -77.0, location: 'Washington DC', country: 'US', tone: 2.5, event_code: '03', event_type: 'EXPRESS INTENT TO COOPERATE', goldstein_scale: 3.0, num_mentions: 45, num_sources: 12, num_articles: 28 },
    { id: 'fb-2', title: 'Military exercises near border region', url: '', domain: 'bbc.com', date: new Date().toISOString(), lat: 50.45, lng: 30.52, location: 'Kyiv', country: 'UA', tone: -5.2, event_code: '15', event_type: 'EXHIBIT FORCE POSTURE', goldstein_scale: -4.0, num_mentions: 89, num_sources: 23, num_articles: 56 },
    { id: 'fb-3', title: 'Protests over economic policy', url: '', domain: 'aljazeera.com', date: new Date().toISOString(), lat: 15.5, lng: 32.56, location: 'Khartoum', country: 'SD', tone: -7.8, event_code: '14', event_type: 'PROTEST', goldstein_scale: -2.0, num_mentions: 34, num_sources: 8, num_articles: 19 },
  ];
}
