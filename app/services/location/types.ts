export type Coordinate = {
  latitude: number
  longitude: number
}

export type MapBounds = {
  minLat: number
  maxLat: number
  minLong: number
  maxLong: number
}

export type MapUserMarker = {
  userId: string
  displayName: string
  summary: string
  avatarPath: string | null
  coordinate: Coordinate
  isSelf: boolean
}

export type LocationUpdateResult = {
  userId: string
  coordinate: Coordinate
  showLocation: boolean
  updatedAt: string
}

export type LocationDeleteResult = {
  userId: string
  showLocation: boolean
  updatedAt: string
}

export type SavedLocation = {
  id: string
  label: string
  coordinate: Coordinate
  isActive: boolean
  isPublicMapLocation: boolean
  createdAt: string
  updatedAt: string
}

export type SavedLocationInput = {
  label: string
  coordinate: Coordinate
}

export type SavedLocationDeleteResult = {
  deletedId: string
  wasPublic: boolean
}

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; error: string }
