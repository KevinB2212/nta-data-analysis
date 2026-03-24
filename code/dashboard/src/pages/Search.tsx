// search/plan journey page - the main feature of the app
// user picks origin + destination (by typing stop name or clicking map)
// then we show journey options ranked by reliability

import { useState, useCallback, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchJourneys, getRouteReliability, JourneysResult, Journey, getRouteTypeEmoji, Stop } from '../api/client'
import GlassCard from '../components/GlassCard'
import Map, { MapMarker } from '../components/Map'
import ReliabilityGauge from '../components/ReliabilityGauge'

// card for each journey result - shows route info, stops, and reliability gauge
function JourneyCard({ journey, origin, destination }: {
  journey: Journey
  origin?: { lat: number; lon: number } | null
  destination?: { lat: number; lon: number } | null
}) {
  const navigate = useNavigate()
  const isTransfer = journey.type === 'transfer'
  const [legReliability, setLegReliability] = useState<Record<string, number | null>>({})

  // for transfers, load reliability for each leg separately so we can show both
  useEffect(() => {
    if (journey.legs.length <= 1) return
    journey.legs.forEach(leg => {
      getRouteReliability(leg.route.route_id)
        .then(data => {
          if (data.has_data && data.reliability?.on_time_percentage != null) {
            setLegReliability(prev => ({ ...prev, [leg.route.route_id]: data.reliability!.on_time_percentage }))
          }
        })
        .catch(() => {})
    })
  }, [journey.legs])

  function handleClick() {
    navigate('/trip', {
      state: { journey, origin, destination },
    })
  }

  return (
    <GlassCard hover className="space-y-3 cursor-pointer" onClick={handleClick}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            isTransfer
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          }`}>
            {isTransfer ? 'Transfer' : 'Direct'}
          </span>
          {journey.estimated_duration_mins != null && journey.estimated_duration_mins > 0 && (
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              ~{Math.round(journey.estimated_duration_mins)} min
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isTransfer && Object.keys(legReliability).length > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              {journey.legs.map((leg, i) => (
                <span key={leg.route.route_id} className="flex items-center gap-1">
                  {i > 0 && <span className="mx-0.5">×</span>}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {leg.route.route_short_name || leg.route.route_id}
                  </span>
                  <span>
                    {legReliability[leg.route.route_id] != null
                      ? `${Math.round(legReliability[leg.route.route_id]!)}%`
                      : '—'}
                  </span>
                </span>
              ))}
              <span className="mx-1">=</span>
            </div>
          )}
          <ReliabilityGauge
            percentage={journey.reliability?.on_time_percentage ?? null}
            size="sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        {journey.legs.map((leg, legIndex) => (
          <div key={legIndex}>
            {legIndex > 0 && journey.transfer_stop && (
              <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
                <div className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-600"></div>
                <span className="flex items-center gap-1">
                  <span>Walk to</span>
                  <span className="font-medium">{journey.transfer_stop.stop_name}</span>
                </span>
                <div className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-600"></div>
              </div>
            )}

            <div
              className="flex items-center gap-3 p-2 rounded-lg"
            >
              <span className="text-2xl">{getRouteTypeEmoji(leg.route.route_type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {leg.route.route_short_name || leg.route.route_id}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {leg.route.agency_name}
                  </span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500">●</span> {leg.from_stop.stop_name}
                  {leg.from_stop.walk_distance_km !== undefined && leg.from_stop.walk_distance_km > 0 && (
                    <span className="text-xs text-slate-400 ml-1">
                      ({(leg.from_stop.walk_distance_km * 1000).toFixed(0)}m walk)
                    </span>
                  )}
                  <span className="mx-2">→</span>
                  <span className="text-red-500">●</span> {leg.to_stop.stop_name}
                  {leg.to_stop.walk_distance_km !== undefined && leg.to_stop.walk_distance_km > 0 && (
                    <span className="text-xs text-slate-400 ml-1">
                      ({(leg.to_stop.walk_distance_km * 1000).toFixed(0)}m walk)
                    </span>
                  )}
                </div>
              </div>
              {isTransfer && legReliability[leg.route.route_id] != null && (
                <ReliabilityGauge
                  percentage={legReliability[leg.route.route_id]}
                  size="sm"
                  showLabel={false}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

export default function Search() {
  const [originQuery, setOriginQuery] = useState('')
  const [destQuery, setDestQuery] = useState('')
  const [originCoords, setOriginCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [destCoords, setDestCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [originSuggestions, setOriginSuggestions] = useState<Stop[]>([])
  const [destSuggestions, setDestSuggestions] = useState<Stop[]>([])
  const [results, setResults] = useState<JourneysResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectingFor, setSelectingFor] = useState<'origin' | 'destination' | null>(null)
  const [originHighlight, setOriginHighlight] = useState(-1)
  const [destHighlight, setDestHighlight] = useState(-1)
  const originInputRef = useRef<HTMLInputElement>(null)
  const destInputRef = useRef<HTMLInputElement>(null)

  // calls the backend journey search when user clicks "Find Routes"
  async function handleSearch() {
    if (!originCoords || !destCoords) {
      setError('Please select both origin and destination stops')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await searchJourneys(
        originCoords.lat,
        originCoords.lon,
        destCoords.lat,
        destCoords.lon,
        0.5,
        true
      )
      setResults(data)
    } catch (err) {
      setError('Failed to search routes. Is the API running?')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // live search as user types - hits the stops endpoint with the query string
  async function searchStops(query: string, setResults: (stops: Stop[]) => void) {
    if (query.length < 2) {
      setResults([])
      return
    }

    try {
      const response = await fetch(`/api/stops?search=${encodeURIComponent(query)}&limit=5`)
      const data = await response.json()
      setResults(data.stops || [])
    } catch (err) {
      console.error('Failed to search stops:', err)
    }
  }

  function selectOrigin(stop: Stop) {
    setOriginQuery(stop.stop_name || stop.stop_id)
    setOriginCoords({ lat: stop.stop_lat!, lon: stop.stop_lon! })
    setOriginSuggestions([])
  }

  function selectDest(stop: Stop) {
    setDestQuery(stop.stop_name || stop.stop_id)
    setDestCoords({ lat: stop.stop_lat!, lon: stop.stop_lon! })
    setDestSuggestions([])
  }

  // when the user clicks on the map, set coords for whichever field they're picking
  const handleMapClick = useCallback((lat: number, lon: number) => {
    if (selectingFor === 'origin') {
      setOriginCoords({ lat, lon })
      setOriginQuery(`${lat.toFixed(4)}, ${lon.toFixed(4)}`)
      setSelectingFor(null)
    } else if (selectingFor === 'destination') {
      setDestCoords({ lat, lon })
      setDestQuery(`${lat.toFixed(4)}, ${lon.toFixed(4)}`)
      setSelectingFor(null)
    }
  }, [selectingFor])

  // build markers array for the map - shows origin (green) and dest (red)
  const mapMarkers: MapMarker[] = []
  if (originCoords) {
    mapMarkers.push({
      id: 'origin',
      lat: originCoords.lat,
      lon: originCoords.lon,
      label: 'Origin',
      type: 'origin',
    })
  }
  if (destCoords) {
    mapMarkers.push({
      id: 'destination',
      lat: destCoords.lat,
      lon: destCoords.lon,
      label: 'Destination',
      type: 'destination',
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold gradient-text">Plan Your Journey</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard>
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                From
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    ref={originInputRef}
                    type="text"
                    className="input-glass pr-10"
                    placeholder="Search for a stop..."
                    value={originQuery}
                    aria-label="Origin stop"
                    aria-autocomplete="list"
                    aria-expanded={originSuggestions.length > 0}
                    onChange={(e) => {
                      setOriginQuery(e.target.value)
                      setOriginHighlight(-1)
                      searchStops(e.target.value, setOriginSuggestions)
                    }}
                    onKeyDown={(e) => {
                      if (originSuggestions.length === 0) return
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setOriginHighlight(prev => Math.min(prev + 1, originSuggestions.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setOriginHighlight(prev => Math.max(prev - 1, 0))
                      } else if (e.key === 'Enter' && originHighlight >= 0) {
                        e.preventDefault()
                        selectOrigin(originSuggestions[originHighlight])
                      } else if (e.key === 'Escape') {
                        setOriginSuggestions([])
                        setOriginHighlight(-1)
                      }
                    }}
                  />
                  {originCoords && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  {originSuggestions.length > 0 && (
                    <div className="dropdown-glass" role="listbox" aria-label="Origin stop suggestions">
                      {originSuggestions.map((stop, idx) => (
                        <div
                          key={stop.stop_id}
                          onClick={() => selectOrigin(stop)}
                          role="option"
                          aria-selected={idx === originHighlight}
                          className={`dropdown-item ${idx === originHighlight ? 'bg-indigo-50 dark:bg-slate-700/50' : ''}`}
                        >
                          <span className="font-medium">{stop.stop_name}</span>
                          <span className="text-xs text-slate-500 ml-2">{stop.stop_id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectingFor(selectingFor === 'origin' ? null : 'origin')}
                  className={`btn-glass !px-4 ${selectingFor === 'origin' ? 'ring-2 ring-emerald-500' : ''}`}
                  title="Select origin on map"
                  aria-label="Select origin on map"
                >
                  <span aria-hidden="true">📍</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                To
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    ref={destInputRef}
                    type="text"
                    className="input-glass pr-10"
                    placeholder="Search for a stop..."
                    value={destQuery}
                    aria-label="Destination stop"
                    aria-autocomplete="list"
                    aria-expanded={destSuggestions.length > 0}
                    onChange={(e) => {
                      setDestQuery(e.target.value)
                      setDestHighlight(-1)
                      searchStops(e.target.value, setDestSuggestions)
                    }}
                    onKeyDown={(e) => {
                      if (destSuggestions.length === 0) return
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setDestHighlight(prev => Math.min(prev + 1, destSuggestions.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setDestHighlight(prev => Math.max(prev - 1, 0))
                      } else if (e.key === 'Enter' && destHighlight >= 0) {
                        e.preventDefault()
                        selectDest(destSuggestions[destHighlight])
                      } else if (e.key === 'Escape') {
                        setDestSuggestions([])
                        setDestHighlight(-1)
                      }
                    }}
                  />
                  {destCoords && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  {destSuggestions.length > 0 && (
                    <div className="dropdown-glass" role="listbox" aria-label="Destination stop suggestions">
                      {destSuggestions.map((stop, idx) => (
                        <div
                          key={stop.stop_id}
                          onClick={() => selectDest(stop)}
                          role="option"
                          aria-selected={idx === destHighlight}
                          className={`dropdown-item ${idx === destHighlight ? 'bg-indigo-50 dark:bg-slate-700/50' : ''}`}
                        >
                          <span className="font-medium">{stop.stop_name}</span>
                          <span className="text-xs text-slate-500 ml-2">{stop.stop_id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectingFor(selectingFor === 'destination' ? null : 'destination')}
                  className={`btn-glass !px-4 ${selectingFor === 'destination' ? 'ring-2 ring-red-500' : ''}`}
                  title="Select destination on map"
                  aria-label="Select destination on map"
                >
                  <span aria-hidden="true">📍</span>
                </button>
              </div>
            </div>

            {selectingFor && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-sm text-indigo-700 dark:text-indigo-300">
                Click on the map to select your {selectingFor}
              </div>
            )}

            <button
              className="btn-primary w-full"
              onClick={handleSearch}
              disabled={loading || !originCoords || !destCoords}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Searching...
                </span>
              ) : (
                'Find Routes'
              )}
            </button>
          </div>
        </GlassCard>

        <GlassCard className="!p-0 overflow-hidden min-h-[300px] lg:min-h-[400px]">
          <Map
            height="100%"
            markers={mapMarkers}
            onClick={selectingFor ? handleMapClick : undefined}
            className={selectingFor ? 'cursor-crosshair' : ''}
          />
        </GlassCard>
      </div>

      {error && (
        <GlassCard className="!bg-red-50 dark:!bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </GlassCard>
      )}

      {results && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            {results.journeys.length} Journey{results.journeys.length !== 1 ? 's' : ''} Found
            {results.direct_count > 0 && results.transfer_count > 0 && (
              <span className="text-sm font-normal text-slate-500 ml-2">
                ({results.direct_count} direct, {results.transfer_count} with transfer)
              </span>
            )}
          </h2>

          {results.journeys.length === 0 ? (
            <GlassCard className="text-center">
              <p className="text-slate-600 dark:text-slate-400">
                No routes found between these stops.
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Try searching for different stops or increasing the search radius.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-4">
              {results.journeys.map((journey, index) => (
                <JourneyCard key={index} journey={journey} origin={originCoords} destination={destCoords} />
              ))}
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <GlassCard className="text-center py-12">
          <div className="text-4xl mb-4">🗺️</div>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">
            Pick where you're coming from and going to
          </p>
          <p className="text-sm text-slate-500">
            Routes are ranked by reliability using live data from the NTA
          </p>
        </GlassCard>
      )}
    </div>
  )
}
