import type { Coordinate, MapBounds, ServiceResult } from "@/services/location/types"

export type { Coordinate, MapBounds, ServiceResult }

export const DIVE_DESCRIPTION_MAX_LENGTH = 500
export const DIVE_TITLE_MAX_LENGTH = 80

export type DiveEvent = {
  id: string
  title: string | null
  description: string
  eventAt: string
  coordinate: Coordinate
  locationId: string | null
  locationLabelSnapshot: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DiveEventInput = {
  title?: string | null
  description: string
  eventAt: string
  coordinate: Coordinate
  diveId?: string | null
}

export type DiveEventMarker = {
  id: string
  title: string | null
  description: string
  eventAt: string
  coordinate: Coordinate
  locationId: string | null
  locationLabelSnapshot: string | null
  creatorId: string
  creatorDisplayName: string
  creatorSummary: string
  creatorAvatarPath: string | null
  isOwn: boolean
}

export type DiveDeleteResult = {
  deletedId: string | null
}

export type DiveEventSavedLocationInput = {
  title?: string | null
  description: string
  eventAt: string
  locationId: string
  diveId?: string | null
}
