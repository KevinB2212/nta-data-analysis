// trip summary page - shows full breakdown after clicking a journey result
// displays each leg with from/to stops, a map, and detailed reliability stats
// gets here via navigate('/trip', { state: { journey } }) from the search page

import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Journey, getRouteTypeEmoji, getRouteTypeName, getRouteReliability } from '../api/client'
import GlassCard from '../components/GlassCard'
import Map, { MapMarker } from '../components/Map'
import ReliabilityGauge from '../components/ReliabilityGauge'

interface LegReliabilityData {
  on_time_percentage: number | null
  average_delay_seconds: number | null
  median_delay_seconds: number | null
  sample_size: number
}

export default function TripSummary() {
  const location = useLocation()
  const navigate = useNavigate()
  const journey = location.state?.journey as Journey | undefined
  const [legData, setLegData] = useState<Record<string, LegReliabilityData | null>>({})
  const [loading, setLoading] = useState(true)

  // load reliability for each leg in the journey so we can show per-leg stats
  useEffect(() => {
    if (!journey) return

    async function loadLegReliability() {
      const results: Record<string, LegReliabilityData | null> = {}
      await Promise.all(
        journey!.legs.map(async (leg) => {
          try {
            const data = await getRouteReliability(leg.route.route_id)
            results[leg.route.route_id] = data.has_data ? data.reliability : null
          } catch {
            results[leg.route.route_id] = null
          }
        })
      )
      setLegData(results)
      setLoading(false)
    }
    loadLegReliability()
  }, [journey])

  if (!journey) {
    return (
      <GlassCard className="max-w-xl mx-auto text-center">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
          No trip selected
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Go back to the search page and pick a journey to see details here.
        </p>
        <button onClick={() => navigate('/search')} className="btn-primary">
          Plan Journey
        </button>
      </GlassCard>
    )
  }

  const isTransfer = journey.type === 'transfer'
  const firstLeg = journey.legs[0]
  const lastLeg = journey.legs[journey.legs.length - 1]

  // set up map markers - origin, destination, and transfer point if applicable
  const markers: MapMarker[] = []
  if (firstLeg.from_stop) {
    markers.push({
      id: 'origin',
      lat: 0,
      lon: 0,
      label: firstLeg.from_stop.stop_name,
      type: 'origin',
    })
  }
  if (lastLeg.to_stop) {
    markers.push({
      id: 'destination',
      lat: 0,
      lon: 0,
      label: lastLeg.to_stop.stop_name,
      type: 'destination',
    })
  }
  if (journey.transfer_stop) {
    markers.push({
      id: 'transfer',
      lat: journey.transfer_stop.stop_lat,
      lon: journey.transfer_stop.stop_lon,
      label: journey.transfer_stop.stop_name,
      popup: 'Transfer here',
      type: 'stop',
    })
  }

  // grab the actual coordinates from the search page's state so we can show them on the map
  const originCoords = location.state?.origin as { lat: number; lon: number } | undefined
  const destCoords = location.state?.destination as { lat: number; lon: number } | undefined
  if (originCoords && markers[0]) {
    markers[0].lat = originCoords.lat
    markers[0].lon = originCoords.lon
  }
  if (destCoords && markers.length > 1) {
    const destMarker = markers.find(m => m.id === 'destination')
    if (destMarker) {
      destMarker.lat = destCoords.lat
      destMarker.lon = destCoords.lon
    }
  }

  const validMarkers = markers.filter(m => m.lat !== 0 && m.lon !== 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to results
      </button>

      <GlassCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                isTransfer
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              }`}>
                {isTransfer ? 'Transfer' : 'Direct'}
              </span>
              {journey.estimated_duration_mins != null && journey.estimated_duration_mins > 0 && (
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                  ~{Math.round(journey.estimated_duration_mins)} min
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold text-slate-700 dark:text-slate-300">
              {firstLeg.from_stop.stop_name} <span className="text-indigo-500 mx-2">&#8594;</span> {lastLeg.to_stop.stop_name}
            </h1>
          </div>
          <ReliabilityGauge
            percentage={journey.reliability?.on_time_percentage ?? null}
            size="lg"
          />
        </div>
      </GlassCard>

      {validMarkers.length > 0 && (
        <GlassCard className="!p-0 overflow-hidden">
          <Map height="250px" markers={validMarkers} />
        </GlassCard>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {isTransfer ? `${journey.legs.length} Legs` : 'Route Details'}
        </h2>

        {journey.legs.map((leg, index) => {
          const rel = legData[leg.route.route_id]
          return (
            <div key={index}>
              {index > 0 && journey.transfer_stop && (
                <div className="flex items-center gap-3 py-3 px-4">
                  <div className="flex-1 border-t-2 border-dashed border-slate-300 dark:border-slate-600" />
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">Transfer at {journey.transfer_stop.stop_name}</span>
                  </div>
                  <div className="flex-1 border-t-2 border-dashed border-slate-300 dark:border-slate-600" />
                </div>
              )}

              <GlassCard>
                <div className="flex items-start gap-4">
                  <div className="text-4xl mt-1">
                    {getRouteTypeEmoji(leg.route.route_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <Link
                          to={`/route/${leg.route.route_id}`}
                          className="text-2xl font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          {leg.route.route_short_name || leg.route.route_id}
                        </Link>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {leg.route.route_long_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                            {getRouteTypeName(leg.route.route_type)}
                          </span>
                          {leg.route.agency_name && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {leg.route.agency_name}
                            </span>
                          )}
                        </div>
                      </div>
                      {!loading && (
                        <ReliabilityGauge
                          percentage={rel?.on_time_percentage ?? null}
                          size="sm"
                        />
                      )}
                    </div>

                    {/* vertical line connecting origin to destination dots */}
                    <div className="relative pl-6 space-y-4">
                      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-emerald-500 to-red-500" />

                      <div className="flex items-start gap-3">
                        <div className="absolute left-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 shadow" />
                        <div>
                          <Link
                            to={`/stop/${leg.from_stop.stop_id}`}
                            className="font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {leg.from_stop.stop_name}
                          </Link>
                          {leg.from_stop.walk_distance_km != null && leg.from_stop.walk_distance_km > 0 && (
                            <p className="text-xs text-slate-500">
                              {(leg.from_stop.walk_distance_km * 1000).toFixed(0)}m walk from origin
                            </p>
                          )}
                        </div>
                      </div>

                      {leg.num_stops != null && leg.num_stops > 0 && (
                        <div className="pl-2 text-sm text-slate-500 dark:text-slate-400">
                          {leg.num_stops} stop{leg.num_stops !== 1 ? 's' : ''}
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <div className="absolute left-0 w-5 h-5 rounded-full bg-red-500 border-2 border-white dark:border-slate-800 shadow" />
                        <div>
                          <Link
                            to={`/stop/${leg.to_stop.stop_id}`}
                            className="font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            {leg.to_stop.stop_name}
                          </Link>
                          {leg.to_stop.walk_distance_km != null && leg.to_stop.walk_distance_km > 0 && (
                            <p className="text-xs text-slate-500">
                              {(leg.to_stop.walk_distance_km * 1000).toFixed(0)}m walk to destination
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {!loading && rel && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                              {rel.on_time_percentage != null ? `${Math.round(rel.on_time_percentage)}%` : '--'}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">On-time</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                              {rel.average_delay_seconds != null ? `${Math.round(rel.average_delay_seconds / 60)}m` : '--'}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">Avg delay</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                              {rel.sample_size?.toLocaleString() || '--'}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">Observations</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </GlassCard>
            </div>
          )
        })}
      </div>

      {isTransfer && journey.reliability && (
        <GlassCard>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3">
            Combined Journey Reliability
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            How likely the full journey is to be on time
          </p>
          <div className="flex items-center justify-around">
            <ReliabilityGauge
              percentage={journey.reliability.on_time_percentage}
              size="lg"
            />
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {Math.round(journey.reliability.average_delay_seconds / 60)}m
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Total avg delay</div>
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
