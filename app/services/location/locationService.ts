import { supabase } from "@/services/supabase/client"

import type {
  SavedLocation,
  SavedLocationDeleteResult,
  SavedLocationInput,
  ServiceResult,
} from "./types"

type SavedLocationRow = {
  id: string
  label: string
  latitude: number
  longitude: number
  is_active: boolean
  is_public_map_location: boolean
  created_at: string
  updated_at: string
}

type DeleteLocationRow = {
  deleted_id: string
  was_public: boolean
}

function normalizeError(message?: string): string {
  if (!message) return "Saved location request failed. Please try again."
  if (message.includes("Authentication required")) return "Please sign in to manage locations."
  if (message.includes("Invalid coordinates"))
    return "Selected location is outside supported bounds."
  if (message.includes("Location label")) return "Location label must be 1-80 characters."
  if (message.includes("Saved location not found")) return "Saved location was not found."
  return "Saved location request failed. Please try again."
}

function normalizeLocation(row: SavedLocationRow): SavedLocation {
  return {
    id: row.id,
    label: row.label,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    isActive: row.is_active,
    isPublicMapLocation: row.is_public_map_location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeDelete(row: DeleteLocationRow): SavedLocationDeleteResult {
  return {
    deletedId: row.deleted_id,
    wasPublic: row.was_public,
  }
}

export async function listOwnSavedLocations(): Promise<ServiceResult<SavedLocation[]>> {
  const { data, error } = await supabase.rpc("list_own_profile_locations")

  if (error) return { ok: false, error: normalizeError(error.message) }

  return { ok: true, data: (data ?? []).map(normalizeLocation) }
}

export async function createSavedLocation(
  input: SavedLocationInput,
): Promise<ServiceResult<SavedLocation>> {
  const { data, error } = await supabase.rpc("create_profile_location", {
    p_label: input.label,
    p_lng: input.coordinate.longitude,
    p_lat: input.coordinate.latitude,
    p_share_on_map: false,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Saved location was not created." }

  return { ok: true, data: normalizeLocation(data[0]) }
}

export async function updateSavedLocation(
  id: string,
  input: SavedLocationInput,
): Promise<ServiceResult<SavedLocation>> {
  const { data, error } = await supabase.rpc("update_profile_location", {
    p_id: id,
    p_label: input.label,
    p_lng: input.coordinate.longitude,
    p_lat: input.coordinate.latitude,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Saved location was not updated." }

  return { ok: true, data: normalizeLocation(data[0]) }
}

export async function shareSavedLocationOnMap(id: string): Promise<ServiceResult<SavedLocation>> {
  const { data, error } = await supabase.rpc("share_profile_location_on_map", { p_id: id })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Saved location was not shared." }

  return { ok: true, data: normalizeLocation(data[0]) }
}

export async function unshareSavedLocationFromMap(): Promise<ServiceResult<void>> {
  const { error } = await supabase.rpc("unshare_profile_location_from_map")

  if (error) return { ok: false, error: normalizeError(error.message) }

  return { ok: true, data: undefined }
}

export async function deleteSavedLocation(
  id: string,
): Promise<ServiceResult<SavedLocationDeleteResult>> {
  const { data, error } = await supabase.rpc("delete_profile_location", { p_id: id })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Saved location was not deleted." }

  return { ok: true, data: normalizeDelete(data[0]) }
}
