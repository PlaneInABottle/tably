import { supabase } from "@/services/supabase/client"

import type {
  Coordinate,
  LocationDeleteResult,
  LocationUpdateResult,
  MapBounds,
  MapUserMarker,
  ServiceResult,
} from "./types"

type UpdateLocationRow = {
  user_id: string
  latitude: number
  longitude: number
  show_location: boolean
  updated_at: string
}

type DeleteLocationRow = {
  user_id: string
  show_location: boolean
  updated_at: string
}

type UserInViewRow = {
  user_id: string
  display_name: string
  summary: string
  avatar_path: string | null
  latitude: number
  longitude: number
  is_self: boolean
}

function normalizeError(message?: string): string {
  if (!message) return "Map request failed. Please try again."
  if (message.includes("Invalid coordinates"))
    return "Selected location is outside supported bounds."
  if (message.includes("Authentication required")) return "Please sign in to use the map."
  if (message.includes("blocked")) return "This diver is blocked."
  return "Map request failed. Please try again."
}

function normalizeLocationUpdate(row: UpdateLocationRow): LocationUpdateResult {
  return {
    userId: row.user_id,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    showLocation: row.show_location,
    updatedAt: row.updated_at,
  }
}

function normalizeLocationDelete(row: DeleteLocationRow): LocationDeleteResult {
  return {
    userId: row.user_id,
    showLocation: row.show_location,
    updatedAt: row.updated_at,
  }
}

function normalizeMarker(row: UserInViewRow): MapUserMarker {
  return {
    userId: row.user_id,
    displayName: row.display_name || "Diver",
    summary: row.summary,
    avatarPath: row.avatar_path,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    isSelf: row.is_self,
  }
}

export async function updateOwnLocation(
  coordinate: Coordinate,
): Promise<ServiceResult<LocationUpdateResult>> {
  const { data, error } = await supabase.rpc("update_own_location", {
    p_lng: coordinate.longitude,
    p_lat: coordinate.latitude,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Location was not saved." }

  return { ok: true, data: normalizeLocationUpdate(data[0]) }
}

export async function deleteOwnLocation(): Promise<ServiceResult<LocationDeleteResult>> {
  const { data, error } = await supabase.rpc("delete_own_location")

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Location was not deleted." }

  return { ok: true, data: normalizeLocationDelete(data[0]) }
}

export async function getUsersInView(bounds: MapBounds): Promise<ServiceResult<MapUserMarker[]>> {
  const { data, error } = await supabase.rpc("users_in_view", {
    min_lat: bounds.minLat,
    min_long: bounds.minLong,
    max_lat: bounds.maxLat,
    max_long: bounds.maxLong,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }

  return { ok: true, data: (data ?? []).map(normalizeMarker) }
}
