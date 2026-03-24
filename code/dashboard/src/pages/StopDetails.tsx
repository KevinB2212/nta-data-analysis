// stop detail page - shows the stop on a map plus all routes that pass through it
// each route gets a reliability gauge so you can compare them at a glance

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getStop, getStopReliability, Stop, Route, StopReliability, getRouteTypeEmoji } from '../api/client'
import GlassCard from '../components/GlassCard'
import Map, { MapMarker } from '../components/Map'
import ReliabilityGauge from '../components/ReliabilityGauge'

export default function StopDetails() {
  const { stopId } = useParams<{ stopId: string }>()
  const [stop, setStop] = useState<Stop | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [stopReliability, setStopReliability] = useState<StopReliability | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!stopId) return

      // fetch stop info and reliability in parallel - catch reliability separately
      // since it might not have data yet (depends on realtime collection)
      try {
        const [data, relData] = await Promise.all([
          getStop(stopId),
          getStopReliability(stopId).catch(() => null),
        ])
        setStop(data.stop)
        setRoutes(data.routes)
        setStopReliability(relData)
      } catch (err) {
        setError('Failed to load stop details')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [stopId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" />
      </div>
    )
  }

  if (error || !stop) {
    return (
      <GlassCard className="max-w-xl mx-auto text-center">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
          Error
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">{error || 'Stop not found'}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Retry
          </button>
          <Link to="/" className="btn-secondary inline-block">
            Back to Home
          </Link>
        </div>
      </GlassCard>
    )
  }

  const mapMarkers: MapMarker[] = stop.stop_lat && stop.stop_lon
    ? [{
        id: stop.stop_id,
        lat: stop.stop_lat,
        lon: stop.stop_lon,
        label: stop.stop_name || stop.stop_id,
        type: 'stop',
      }]
    : []

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      <GlassCard>
        <div className="flex items-start gap-4">
          <div className="text-4xl p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
            📍
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">
              {stop.stop_name || stop.stop_id}
            </h1>
            <div className="space-y-1 text-slate-600 dark:text-slate-400">
              <p className="flex items-center gap-2">
                <span className="text-slate-500">ID:</span>
                <code className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-sm">
                  {stop.stop_id}
                </code>
              </p>
              {stop.stop_code && (
                <p className="flex items-center gap-2">
                  <span className="text-slate-500">Code:</span>
                  <code className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-sm">
                    {stop.stop_code}
                  </code>
                </p>
              )}
              {stop.stop_lat && stop.stop_lon && (
                <p className="flex items-center gap-2">
                  <span className="text-slate-500">Coordinates:</span>
                  <span className="text-sm">
                    {stop.stop_lat.toFixed(5)}, {stop.stop_lon.toFixed(5)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {stop.stop_lat && stop.stop_lon && (
        <GlassCard className="!p-0 overflow-hidden">
          <Map
            height="350px"
            markers={mapMarkers}
            center={[stop.stop_lat, stop.stop_lon]}
            zoom={16}
          />
          <div className="p-4 bg-white/50 dark:bg-slate-800/50 border-t border-slate-200/50 dark:border-slate-700/50">
            <a
              href={`https://www.google.com/maps?q=${stop.stop_lat},${stop.stop_lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View on Google Maps
            </a>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Routes at this stop ({routes.length})
        </h2>
        {routes.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <div className="text-4xl mb-2">🚏</div>
            <p>No routes found for this stop</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* show each route with its reliability data if we have any */}
            {routes.map((route) => {
              const rel = stopReliability?.routes.find(r => r.route_id === route.route_id)?.reliability
              return (
                <Link
                  key={route.route_id}
                  to={`/route/${route.route_id}`}
                  className="flex items-center gap-4 p-4 rounded-xl
                             bg-slate-50/80 dark:bg-slate-700/30
                             hover:bg-white dark:hover:bg-slate-700/50
                             border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800
                             transition-all duration-300 group"
                >
                  <span className="text-2xl">{getRouteTypeEmoji(route.route_type)}</span>
                  <div
                    className="px-3 py-1 rounded-lg text-white font-bold text-center min-w-[4rem]"
                    style={{ backgroundColor: route.route_color ? `#${route.route_color}` : '#6366f1' }}
                  >
                    {route.route_short_name || route.route_id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {route.route_long_name}
                    </div>
                    {route.agency_name && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {route.agency_name}
                      </div>
                    )}
                  </div>
                  <ReliabilityGauge
                    percentage={rel?.on_time_percentage ?? null}
                    size="sm"
                    showLabel={false}
                  />
                  <svg
                    className="w-5 h-5 text-slate-400 group-hover:text-indigo-500
                               group-hover:translate-x-1 transition-all"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
