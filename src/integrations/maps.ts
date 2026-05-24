import { env } from '../config/env'

export interface DistanceResult {
  distanceKm: number
  durationMinutes: number
  distanceText: string
  durationText: string
}

export async function getDistanceAndDuration(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<DistanceResult> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return estimateDistance(originLat, originLng, destLat, destLng)
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&key=${env.GOOGLE_MAPS_API_KEY}`
    const response = await fetch(url)
    const data = await response.json() as {
      rows: Array<{ elements: Array<{ distance: { value: number; text: string }; duration: { value: number; text: string }; status: string }> }>
    }
    const element = data.rows[0]?.elements[0]
    if (element?.status === 'OK') {
      return {
        distanceKm: element.distance.value / 1000,
        durationMinutes: Math.ceil(element.duration.value / 60),
        distanceText: element.distance.text,
        durationText: element.duration.text,
      }
    }
  } catch (err) {
    console.error('Google Maps API error:', err)
  }

  return estimateDistance(originLat, originLng, destLat, destLng)
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

function estimateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): DistanceResult {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distanceKm = R * c

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes: Math.round((distanceKm / 40) * 60),
    distanceText: `${distanceKm.toFixed(1)} km`,
    durationText: `${Math.round((distanceKm / 40) * 60)} mins`,
  }
}
