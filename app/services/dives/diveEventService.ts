import { supabase } from "@/services/supabase/client"

import type {
  DiveDeleteResult,
  DiveEvent,
  DiveEventInput,
  DiveEventMarker,
  DiveEventSavedLocationInput,
  MapBounds,
  ServiceResult,
} from "./types"

type DiveEventRow = {
  id: string
  title: string | null
  description: string
  event_at: string
  latitude: number
  longitude: number
  location_id?: string | null
  location_label_snapshot?: string | null
  created_by: string
  created_at: string
  updated_at: string
}

type DiveMarkerRow = {
  id: string
  title: string | null
  description: string
  event_at: string
  latitude: number
  longitude: number
  location_id: string | null
  location_label_snapshot: string | null
  creator_id: string
  creator_display_name: string
  creator_summary: string
  creator_avatar_path: string | null
  is_own: boolean
}

function normalizeError(message?: string): string {
  if (!message) return "Dive event request failed. Please try again."
  if (message.includes("Invalid coordinates"))
    return "Dive event location is outside supported bounds."
  if (message.includes("Authentication required")) return "Please sign in to manage dive events."
  if (message.includes("Terms")) return "Accept the community terms before sharing dive events."
  if (message.includes("Content contains")) return "This dive event cannot be shared."
  if (message.includes("Description must be")) return "Description must be 1-500 characters."
  if (message.includes("Title must be")) return "Title must be 80 characters or fewer."
  if (message.includes("Event date is required")) return "Event date is required."
  if (message.includes("Saved location not found")) return "Select one of your saved locations."
  if (message.includes("Dive event not found")) return "Dive event not found."
  return "Dive event request failed. Please try again."
}

function normalizeDive(row: DiveEventRow): DiveEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventAt: row.event_at,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    locationId: row.location_id ?? null,
    locationLabelSnapshot: row.location_label_snapshot ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeMarker(row: DiveMarkerRow): DiveEventMarker {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventAt: row.event_at,
    coordinate: { latitude: row.latitude, longitude: row.longitude },
    locationId: row.location_id,
    locationLabelSnapshot: row.location_label_snapshot,
    creatorId: row.creator_id,
    creatorDisplayName: row.creator_display_name || "Diver",
    creatorSummary: row.creator_summary,
    creatorAvatarPath: row.creator_avatar_path,
    isOwn: row.is_own,
  }
}

export async function getOwnDive(): Promise<ServiceResult<DiveEvent | null>> {
  const result = await listOwnDives()

  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, data: result.data[result.data.length - 1] ?? null }
}

export async function listOwnDives(): Promise<ServiceResult<DiveEvent[]>> {
  const { data, error } = await supabase.rpc("list_own_dives")

  if (error) return { ok: false, error: normalizeError(error.message) }

  return {
    ok: true,
    data: (data ?? [])
      .map(normalizeDive)
      .sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime()),
  }
}

export async function upsertOwnDive(input: DiveEventInput): Promise<ServiceResult<DiveEvent>> {
  const { data, error } = await supabase.rpc("upsert_own_dive", {
    p_lng: input.coordinate.longitude,
    p_lat: input.coordinate.latitude,
    p_event_at: input.eventAt,
    p_description: input.description,
    p_title: input.title ?? undefined,
    p_dive_id: input.diveId ?? undefined,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Dive event was not saved." }

  return { ok: true, data: normalizeDive(data[0]) }
}

export async function upsertOwnDiveFromLocation(
  input: DiveEventSavedLocationInput,
): Promise<ServiceResult<DiveEvent>> {
  const { data, error } = await supabase.rpc("upsert_own_dive_from_location", {
    p_location_id: input.locationId,
    p_event_at: input.eventAt,
    p_description: input.description,
    p_title: input.title ?? undefined,
    p_dive_id: input.diveId ?? undefined,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }
  if (!data?.[0]) return { ok: false, error: "Dive event was not saved." }

  return { ok: true, data: normalizeDive(data[0]) }
}

export async function deleteOwnDive(diveId: string): Promise<ServiceResult<DiveDeleteResult>> {
  const { data, error } = await supabase.rpc("delete_own_dive", { p_dive_id: diveId })

  if (error) return { ok: false, error: normalizeError(error.message) }

  return { ok: true, data: { deletedId: data?.[0]?.deleted_id ?? null } }
}

export async function getDivesInView(bounds: MapBounds): Promise<ServiceResult<DiveEventMarker[]>> {
  const { data, error } = await supabase.rpc("dives_in_view", {
    min_lat: bounds.minLat,
    min_long: bounds.minLong,
    max_lat: bounds.maxLat,
    max_long: bounds.maxLong,
  })

  if (error) return { ok: false, error: normalizeError(error.message) }

  return { ok: true, data: (data ?? []).map(normalizeMarker) }
}
