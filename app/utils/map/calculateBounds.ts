import type { MapBounds } from "@/services/location/types"

export type MapRegionInput = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

export type BoundsResult = { ok: true; bounds: MapBounds } | { ok: false; error: string }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isFiniteRegion(region: MapRegionInput): boolean {
  return [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta].every(
    Number.isFinite,
  )
}

export function calculateBounds(region: MapRegionInput): BoundsResult {
  if (!isFiniteRegion(region) || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) {
    return { ok: false, error: "Map region is invalid." }
  }

  const halfLatDelta = region.latitudeDelta / 2
  const halfLongDelta = region.longitudeDelta / 2
  const minLat = clamp(region.latitude - halfLatDelta, -90, 90)
  const maxLat = clamp(region.latitude + halfLatDelta, -90, 90)
  const minLong = region.longitude - halfLongDelta
  const maxLong = region.longitude + halfLongDelta

  if (minLong < -180 || maxLong > 180) {
    return { ok: false, error: "Map search across the date line is not supported yet." }
  }

  return {
    ok: true,
    bounds: {
      minLat,
      maxLat,
      minLong: clamp(minLong, -180, 180),
      maxLong: clamp(maxLong, -180, 180),
    },
  }
}
