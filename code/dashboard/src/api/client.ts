// all api calls go through vite's proxy (/api -> localhost:8000)
const API_BASE = '/api'

// generic fetch wrapper - handles errors so we dont repeat try/catch everywhere
async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

// --- types that match what the backend sends back ---

export interface Route {
  route_id: string
  agency_id: string | null
  route_short_name: string | null
  route_long_name: string | null
  route_type: number
  route_color: string | null
  agency_name: string | null
}

export interface Stop {
  stop_id: string
  stop_code: string | null
  stop_name: string | null
  stop_lat: number | null
  stop_lon: number | null
  distance_km?: number
}

// what comes back from the route search endpoint - one option per possible route
export interface RouteOption {
  route: {
    route_id: string
    route_short_name: string | null
    route_long_name: string | null
    route_type: number
    route_color: string | null
    agency_name: string | null
    trip_headsign: string | null
  }
  origin_stop: {
    stop_id: string
    stop_name: string
    walk_distance_km: number
  }
  destination_stop: {
    stop_id: string
    stop_name: string
    walk_distance_km: number
  }
  num_stops: number
  sample_departure: string | null
  sample_arrival: string | null
  reliability: {
    on_time_percentage: number
    average_delay_seconds: number
  } | null
}

export interface SearchResult {
  origin: { lat: number; lon: number }
  destination: { lat: number; lon: number }
  origin_stops_searched: number
  dest_stops_searched: number
  route_options: RouteOption[]
}

export interface JourneyLeg {
  leg_number: number
  route: {
    route_id: string
    route_short_name: string | null
    route_long_name: string | null
    route_type: number
    route_color: string | null
    agency_name: string | null
    trip_headsign?: string | null
  }
  from_stop: {
    stop_id: string
    stop_name: string
    walk_distance_km?: number
  }
  to_stop: {
    stop_id: string
    stop_name: string
    walk_distance_km?: number
  }
  num_stops?: number
}

// a journey can be direct (one bus) or transfer (bus -> walk -> another bus/luas)
export interface Journey {
  type: 'direct' | 'transfer'
  estimated_duration_mins?: number | null
  legs: JourneyLeg[]
  transfer_stop?: {
    stop_id: string
    stop_name: string
    stop_lat: number
    stop_lon: number
  }
  reliability: {
    on_time_percentage: number
    average_delay_seconds: number
  } | null
}

export interface JourneysResult {
  origin: { lat: number; lon: number }
  destination: { lat: number; lon: number }
  origin_stops_searched: number
  dest_stops_searched: number
  journeys: Journey[]
  direct_count: number
  transfer_count: number
}

export interface SystemOverview {
  static_data: {
    routes: number
    stops: number
    trips: number
    agencies: { agency_id: string; agency_name: string }[]
    route_types: { type_id: number; type_name: string; count: number }[]
  }
  realtime_data: {
    available: boolean
    feed_snapshots_count: number
    delay_events_count: number
    latest_event_at: string | null
  }
  recent_ingestions: {
    run_type: string
    status: string
    started_at: string
    finished_at: string | null
  }[]
}

// --- api call functions ---

export async function getRoutes(params?: {
  route_type?: number
  limit?: number
  offset?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.route_type !== undefined) {
    searchParams.set('route_type', params.route_type.toString())
  }
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.offset) searchParams.set('offset', params.offset.toString())

  const query = searchParams.toString()
  return fetchApi<{ routes: Route[]; total: number }>(
    `/routes${query ? `?${query}` : ''}`
  )
}

export async function getRoute(routeId: string) {
  return fetchApi<{ route: Route; stops: Stop[] }>(`/routes/${routeId}`)
}

export async function getStops(params?: {
  search?: string
  lat?: number
  lon?: number
  radius_km?: number
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.search) searchParams.set('search', params.search)
  if (params?.lat !== undefined) searchParams.set('lat', params.lat.toString())
  if (params?.lon !== undefined) searchParams.set('lon', params.lon.toString())
  if (params?.radius_km) searchParams.set('radius_km', params.radius_km.toString())
  if (params?.limit) searchParams.set('limit', params.limit.toString())

  const query = searchParams.toString()
  return fetchApi<{ stops: Stop[] }>(`/stops${query ? `?${query}` : ''}`)
}

export async function getStop(stopId: string) {
  return fetchApi<{ stop: Stop; routes: Route[] }>(`/stops/${stopId}`)
}

export async function searchRoutes(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  radiusKm: number = 0.5
): Promise<SearchResult> {
  const params = new URLSearchParams({
    origin_lat: originLat.toString(),
    origin_lon: originLon.toString(),
    dest_lat: destLat.toString(),
    dest_lon: destLon.toString(),
    radius_km: radiusKm.toString(),
  })
  return fetchApi<SearchResult>(`/search/routes?${params}`)
}

// the main search - sends origin/dest coords to backend, gets back journey options
export async function searchJourneys(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  radiusKm: number = 0.5,
  includeTransfers: boolean = true
): Promise<JourneysResult> {
  const params = new URLSearchParams({
    origin_lat: originLat.toString(),
    origin_lon: originLon.toString(),
    dest_lat: destLat.toString(),
    dest_lon: destLon.toString(),
    radius_km: radiusKm.toString(),
    include_transfers: includeTransfers.toString(),
  })
  return fetchApi<JourneysResult>(`/search/journeys?${params}`)
}

export async function getNearbyStops(lat: number, lon: number, radiusKm: number = 0.5) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius_km: radiusKm.toString(),
  })
  return fetchApi<{ stops: Stop[] }>(`/search/stops-nearby?${params}`)
}

export async function getSystemOverview() {
  return fetchApi<SystemOverview>('/analytics/overview')
}

export async function getRouteReliability(routeId: string, params?: {
  day_of_week?: string
  hour?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.day_of_week) searchParams.set('day_of_week', params.day_of_week)
  if (params?.hour !== undefined) searchParams.set('hour', params.hour.toString())
  const query = searchParams.toString()
  return fetchApi<{
    route_id: string
    route_name: string
    has_data: boolean
    reliability: {
      on_time_percentage: number | null
      average_delay_seconds: number | null
      median_delay_seconds: number | null
      sample_size: number
    } | null
    message: string
    filters: { day_of_week: string | null; hour: number | null }
  }>(`/analytics/route/${routeId}/reliability${query ? `?${query}` : ''}`)
}

export interface StopReliability {
  stop_id: string
  stop_name: string
  routes: {
    route_id: string
    route_name: string
    route_type: number
    reliability: {
      on_time_percentage: number
      average_delay_seconds: number
      sample_size: number
    } | null
  }[]
}

export async function getStopReliability(stopId: string) {
  return fetchApi<StopReliability>(`/analytics/stop/${stopId}/reliability`)
}

// GTFS route_type codes - these are standard across all GTFS feeds worldwide
export function getRouteTypeName(routeType: number): string {
  const types: Record<number, string> = {
    0: 'Tram',
    1: 'Metro',
    2: 'Rail',
    3: 'Bus',
    4: 'Ferry',
    5: 'Cable Car',
    6: 'Gondola',
    7: 'Funicular',
  }
  return types[routeType] || 'Unknown'
}

export function getRouteTypeEmoji(routeType: number): string {
  const emojis: Record<number, string> = {
    0: '🚊',
    1: '🚇',
    2: '🚆',
    3: '🚌',
    4: '⛴️',
    5: '🚡',
    6: '🚠',
    7: '🚞',
  }
  return emojis[routeType] || '🚍'
}
