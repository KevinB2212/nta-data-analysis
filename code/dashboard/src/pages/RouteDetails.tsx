// route detail page - shows route info, reliability gauge, map of stops, and stop list
// user can filter reliability by day of week and hour to spot patterns

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getRoute, getRouteReliability, Route, Stop, getRouteTypeEmoji, getRouteTypeName } from '../api/client'
import { useFavorites } from '../context/FavoritesContext'
import GlassCard from '../components/GlassCard'
import Map, { MapMarker } from '../components/Map'
import ReliabilityGauge from '../components/ReliabilityGauge'

// filter options for the reliability dropdowns
const DAYS = ['', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = ['All Days', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HOURS = [
  { value: -1, label: 'All Hours' },
  ...Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: `${i.toString().padStart(2, '0')}:00`,
  })),
]

export default function RouteDetails() {
  const { routeId } = useParams<{ routeId: string }>()
  const [route, setRoute] = useState<Route | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [reliability, setReliability] = useState<{
    has_data: boolean
    reliability: { on_time_percentage: number | null; average_delay_seconds: number | null; median_delay_seconds: number | null; sample_size: number } | null
    message: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterDay, setFilterDay] = useState('')
  const [filterHour, setFilterHour] = useState(-1)
  const [filterLoading, setFilterLoading] = useState(false)
  const { isFavorite, toggleFavorite } = useFavorites()

  // load route info and reliability stats in parallel
  useEffect(() => {
    async function loadData() {
      if (!routeId) return

      try {
        const [routeData, reliabilityData] = await Promise.all([
          getRoute(routeId),
          getRouteReliability(routeId),
        ])
        setRoute(routeData.route)
        setStops(routeData.stops)
        setReliability(reliabilityData)
      } catch (err) {
        setError('Failed to load route details')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [routeId])

  // re-fetch reliability whenever the day/hour filter changes
  useEffect(() => {
    async function loadFiltered() {
      if (!routeId) return
      setFilterLoading(true)
      try {
        const params: { day_of_week?: string; hour?: number } = {}
        if (filterDay) params.day_of_week = filterDay
        if (filterHour >= 0) params.hour = filterHour
        const data = await getRouteReliability(routeId, params)
        setReliability(data)
      } catch (err) {
        console.error(err)
      } finally {
        setFilterLoading(false)
      }
    }
    loadFiltered()
  }, [routeId, filterDay, filterHour])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" />
      </div>
    )
  }

  if (error || !route) {
    return (
      <GlassCard className="max-w-xl mx-auto text-center">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
          Error
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">{error || 'Route not found'}</p>
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

  const getBadgeClass = (routeType: number) => {
    if (routeType === 3) return 'badge-bus'
    if (routeType === 2) return 'badge-rail'
    if (routeType === 0) return 'badge-tram'
    return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
  }

  const routeColor = route.route_color ? `#${route.route_color}` : '#6366f1'

  // put all stops on the map (only those that have coordinates)
  const mapMarkers: MapMarker[] = stops
    .filter(stop => stop.stop_lat && stop.stop_lon)
    .map((stop, index) => ({
      id: stop.stop_id,
      lat: stop.stop_lat!,
      lon: stop.stop_lon!,
      label: stop.stop_name || stop.stop_id,
      popup: `Stop ${index + 1}: ${stop.stop_name}`,
      type: 'stop',
    }))

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
          <div
            className="text-5xl p-4 rounded-2xl"
            style={{ backgroundColor: `${routeColor}20` }}
          >
            {getRouteTypeEmoji(route.route_type)}
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">
                {route.route_short_name || route.route_id}
              </h1>
              <button
                onClick={() => toggleFavorite({
                  route_id: route.route_id,
                  route_short_name: route.route_short_name,
                  route_long_name: route.route_long_name,
                  route_type: route.route_type,
                  route_color: route.route_color,
                  agency_name: route.agency_name,
                })}
                className={`p-3 rounded-xl transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isFavorite(route.route_id)
                    ? 'text-red-500 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50'
                    : 'text-slate-400 bg-slate-100 dark:bg-slate-700 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                }`}
                title={isFavorite(route.route_id) ? 'Remove from favorites' : 'Add to favorites'}
                aria-label={isFavorite(route.route_id) ? `Remove ${route.route_short_name || route.route_id} from favorites` : `Add ${route.route_short_name || route.route_id} to favorites`}
              >
                <svg
                  className="w-6 h-6"
                  fill={isFavorite(route.route_id) ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </button>
            </div>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-4">
              {route.route_long_name}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`badge ${getBadgeClass(route.route_type)}`}>
                {getRouteTypeName(route.route_type)}
              </span>
              {route.agency_name && (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Operated by {route.agency_name}
                </span>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            Reliability
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={filterDay}
              onChange={e => setFilterDay(e.target.value)}
              className="text-sm rounded-lg border border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300
                         px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter by day"
            >
              {DAYS.map((d, i) => (
                <option key={d} value={d}>{DAY_LABELS[i]}</option>
              ))}
            </select>
            <select
              value={filterHour}
              onChange={e => setFilterHour(Number(e.target.value))}
              className="text-sm rounded-lg border border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300
                         px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Filter by hour"
            >
              {HOURS.map(h => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            {filterLoading && <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
          </div>
        </div>
        {reliability?.has_data && reliability.reliability ? (
          <div className="flex flex-wrap items-center justify-around gap-8">
            <ReliabilityGauge
              percentage={reliability.reliability.on_time_percentage}
              size="lg"
            />
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                  {reliability.reliability.average_delay_seconds
                    ? `${Math.round(reliability.reliability.average_delay_seconds / 60)}m`
                    : '—'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Average Delay
                </div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-slate-600 dark:text-slate-400">
                  {reliability.reliability.sample_size.toLocaleString()}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Observations
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 rounded-xl bg-slate-50 dark:bg-slate-700/30">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-slate-600 dark:text-slate-400">
              {reliability?.message || 'Reliability data not yet available'}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              {(filterDay || filterHour >= 0)
                ? 'No data for this time filter. Try a different day or hour.'
                : 'Real-time data collection is needed to calculate reliability scores'}
            </p>
          </div>
        )}
      </GlassCard>

      {mapMarkers.length > 0 && (
        <GlassCard className="!p-0 overflow-hidden">
          <Map
            height="350px"
            markers={mapMarkers}
          />
        </GlassCard>
      )}

      <GlassCard>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
          Stops ({stops.length})
        </h2>
        <div className="max-h-[300px] md:max-h-[500px] overflow-y-auto space-y-1 pr-2">
          {stops.map((stop, index) => (
            <Link
              key={stop.stop_id}
              to={`/stop/${stop.stop_id}`}
              className="flex items-center gap-4 p-3 rounded-xl
                         hover:bg-slate-50 dark:hover:bg-slate-700/30
                         transition-colors duration-200 group"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center
                           text-white text-sm font-semibold shadow-md"
                style={{ backgroundColor: routeColor }}
              >
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {stop.stop_name || stop.stop_id}
                </div>
                <div className="text-xs text-slate-500">{stop.stop_id}</div>
              </div>
              <svg
                className="w-5 h-5 text-slate-300 group-hover:text-indigo-500
                           group-hover:translate-x-1 transition-all"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
