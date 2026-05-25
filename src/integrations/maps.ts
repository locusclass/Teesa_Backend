// Distance/duration via OSRM (OpenStreetMap routing) — no API key required.
// Public demo server: router.project-osrm.org
// For high-volume production use, self-host OSRM or switch to OpenRouteService.

export interface DistanceResult {
  distanceKm: number
  durationMinutes: number
  distanceText: string
  durationText: string
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

export async function getDistanceAndDuration(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<DistanceResult> {
  try {
    // OSRM uses lng,lat order (opposite of Google Maps)
    const url = `${OSRM_BASE}/${originLng},${originLat};${destLng},${destLat}?overview=false`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TeesaApp/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    const data = await response.json() as {
      code: string
      routes: Array<{ distance: number; duration: number }>
    }
    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0]
      const distanceKm = Math.round((route.distance / 1000) * 10) / 10
      const durationMinutes = Math.ceil(route.duration / 60)
      return {
        distanceKm,
        durationMinutes,
        distanceText: `${distanceKm} km`,
        durationText: `${durationMinutes} min`,
      }
    }
  } catch {
    // Network error or timeout — fall through to Haversine estimate
  }

  return haversineEstimate(originLat, originLng, destLat, destLng)
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

function haversineEstimate(lat1: number, lng1: number, lat2: number, lng2: number): DistanceResult {
  const distanceKm = haversineDistance(lat1, lng1, lat2, lng2)
  return {
    distanceKm,
    durationMinutes: Math.round((distanceKm / 40) * 60),
    distanceText: `${distanceKm} km`,
    durationText: `${Math.round((distanceKm / 40) * 60)} min`,
  }
}
