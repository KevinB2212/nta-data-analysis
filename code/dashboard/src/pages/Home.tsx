// homepage - shows system overview stats, map, operators list, and popular routes
// loads data from /analytics/overview and /routes on mount

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSystemOverview, getRoutes, SystemOverview, Route, getRouteTypeEmoji } from '../api/client'
import { useFavorites } from '../context/FavoritesContext'
import GlassCard from '../components/GlassCard'
import Map from '../components/Map'

// the big 5 irish transport operators - shown first before the smaller ones
const MAJOR_OPERATORS = [
  'Bus Átha Cliath – Dublin Bus',
  'Bus Éireann',
  'Iarnród Éireann / Irish Rail',
  'LUAS',
  'Go-Ahead Ireland',
]

// picks the right emoji based on operator name
const getOperatorIcon = (name: string): string => {
  const lower = name.toLowerCase()
  if (lower.includes('rail') || lower.includes('iarnród')) return '🚆'
  if (lower.includes('luas') || lower.includes('tram')) return '🚊'
  if (lower.includes('local link')) return '🚐'
  if (lower.includes('ferry') || lower.includes('island')) return '⛴️'
  if (lower.includes('coach') || lower.includes('express') || lower.includes('aircoach')) return '🚍'
  return '🚌'
}

const getOperatorColor = (name: string): string => {
  const lower = name.toLowerCase()
  if (lower.includes('dublin bus')) return 'from-yellow-400 to-yellow-500'
  if (lower.includes('bus éireann')) return 'from-red-400 to-red-500'
  if (lower.includes('rail') || lower.includes('iarnród')) return 'from-green-400 to-green-500'
  if (lower.includes('luas')) return 'from-purple-400 to-purple-500'
  if (lower.includes('go-ahead')) return 'from-blue-400 to-blue-500'
  if (lower.includes('local link')) return 'from-teal-400 to-teal-500'
  return 'from-slate-400 to-slate-500'
}

// some operator names are really long in the GTFS data, shorten them for display
const cleanOperatorName = (name: string): string => {
  if (name.toLowerCase().includes('bus éireann')) {
    return 'Bus Éireann'
  }
  if (name.includes('Bus Átha Cliath')) {
    return 'Dublin Bus'
  }
  if (name.toLowerCase().includes('go-ahead')) {
    return 'Go-Ahead Ireland'
  }
  return name
}

function FavoriteButton({ route, className = '' }: { route: Route; className?: string }) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const favorite = isFavorite(route.route_id)

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleFavorite({
          route_id: route.route_id,
          route_short_name: route.route_short_name,
          route_long_name: route.route_long_name,
          route_type: route.route_type,
          route_color: route.route_color,
          agency_name: route.agency_name,
        })
      }}
      className={`p-2 rounded-lg transition-all duration-200 ${
        favorite
          ? 'text-red-500 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50'
          : 'text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700'
      } ${className}`}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={favorite ? `Remove ${route.route_short_name || route.route_id} from favorites` : `Add ${route.route_short_name || route.route_id} to favorites`}
    >
      <svg
        className="w-5 h-5"
        fill={favorite ? 'currentColor' : 'none'}
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
  )
}

export default function Home() {
  const [overview, setOverview] = useState<SystemOverview | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllOperators, setShowAllOperators] = useState(false)
  const { favorites, removeFavorite } = useFavorites()

  // fetch overview stats and first 10 routes in parallel when page loads
  useEffect(() => {
    async function loadData() {
      try {
        const [overviewData, routesData] = await Promise.all([
          getSystemOverview(),
          getRoutes({ limit: 10 }),
        ])
        setOverview(overviewData)
        setRoutes(routesData.routes)
      } catch (err) {
        setError('Failed to load data. Is the API running?')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <GlassCard className="max-w-xl mx-auto text-center">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
          Connection Error
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
        <p className="text-sm text-slate-500 mb-4">
          Make sure the API is running at{' '}
          <code className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
            http://localhost:8000
          </code>
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Retry
        </button>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="text-center py-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="gradient-text">Welcome to Jump</span>
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
          Ireland's public transport reliability at your fingertips
        </p>
        <Link
          to="/search"
          className="btn-primary inline-flex items-center gap-2"
        >
          <span>Plan a Journey</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </section>

      {favorites.length > 0 && (
        <GlassCard className="border-2 border-red-200/50 dark:border-red-800/30">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">❤️</span>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
              Your Favorites
            </h2>
            <span className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full ml-auto">
              {favorites.length} saved
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favorites.map((fav) => (
              <Link
                key={fav.route_id}
                to={`/route/${fav.route_id}`}
                className="flex items-center gap-3 p-3 rounded-xl
                           bg-gradient-to-r from-red-50 to-pink-50
                           dark:from-red-900/20 dark:to-pink-900/20
                           border border-red-100 dark:border-red-800/30
                           hover:shadow-md hover:-translate-y-0.5
                           transition-all duration-300 group"
              >
                <span className="text-2xl">{getRouteTypeEmoji(fav.route_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {fav.route_short_name || fav.route_id}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {fav.route_long_name}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    removeFavorite(fav.route_id)
                  }}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100
                             dark:hover:bg-red-900/50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-red-500"
                  title="Remove from favorites"
                  aria-label={`Remove ${fav.route_short_name || fav.route_id} from favorites`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              </Link>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="overflow-hidden !p-0">
        <Map height="350px" />
      </GlassCard>

      {overview && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="stat-value">{overview.static_data.routes.toLocaleString()}</div>
            <div className="stat-label">Routes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{overview.static_data.stops.toLocaleString()}</div>
            <div className="stat-label">Stops</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{overview.static_data.trips.toLocaleString()}</div>
            <div className="stat-label">Trips</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{overview.realtime_data.delay_events_count.toLocaleString()}</div>
            <div className="stat-label">Delay Events Tracked</div>
          </div>
        </section>
      )}

      {overview && (
        <GlassCard>
          <div className="flex items-center gap-3 mb-4">
            <span className={`w-3 h-3 rounded-full ${overview.realtime_data.available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
              Data Pipeline
            </h2>
            <span className={`ml-auto text-sm font-medium px-3 py-1 rounded-full ${
              overview.realtime_data.available
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
            }`}>
              {overview.realtime_data.available ? 'Live' : 'Offline'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
              <div className="text-sm text-slate-500 dark:text-slate-400">Feed Snapshots</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{overview.realtime_data.feed_snapshots_count.toLocaleString()}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
              <div className="text-sm text-slate-500 dark:text-slate-400">Delay Events</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{overview.realtime_data.delay_events_count.toLocaleString()}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30">
              <div className="text-sm text-slate-500 dark:text-slate-400">Last Updated</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                {(() => {
                  const ts = overview.realtime_data.latest_event_at
                    || (overview.recent_ingestions.length > 0
                      ? overview.recent_ingestions[0].finished_at || overview.recent_ingestions[0].started_at
                      : null)
                  if (!ts) return 'N/A'
                  const d = new Date(ts)
                  const now = new Date()
                  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
                  if (diffMin < 1) return 'Just now'
                  if (diffMin < 60) return `${diffMin}m ago`
                  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
                  return `${Math.floor(diffMin / 1440)}d ago`
                })()}
              </div>
            </div>
          </div>

          {overview.recent_ingestions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                Recent Pipeline Runs
              </h3>
              <div className="space-y-2">
                {overview.recent_ingestions.map((run, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-slate-50/50 dark:bg-slate-700/20">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      run.status === 'success' ? 'bg-emerald-500' :
                      run.status === 'running' ? 'bg-amber-500 animate-pulse' :
                      'bg-red-500'
                    }`} />
                    <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">
                      {run.run_type.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      run.status === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      run.status === 'running' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {run.status}
                    </span>
                    <span className="ml-auto text-slate-400 dark:text-slate-500">
                      {new Date(run.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {overview && (
        <GlassCard>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
            Transport Types
          </h2>
          <div className="flex flex-wrap gap-3">
            {overview.static_data.route_types.map((rt) => (
              <div
                key={rt.type_id}
                className="flex items-center gap-3 px-4 py-3
                           bg-gradient-to-r from-slate-50 to-slate-100
                           dark:from-slate-700/50 dark:to-slate-700/30
                           rounded-xl border border-slate-200/50 dark:border-slate-600/30
                           hover:shadow-md transition-all duration-300"
              >
                <span className="text-2xl">{getRouteTypeEmoji(rt.type_id)}</span>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {rt.type_name}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {rt.count} routes
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {overview && (() => {
        const agencies = overview.static_data.agencies

        const seenMajor = new Set<string>()
        const majorAgencies = agencies.filter(a => {
          const cleaned = cleanOperatorName(a.agency_name)
          if (MAJOR_OPERATORS.some(op => a.agency_name.includes(op.split(' ')[0]))) {
            if (seenMajor.has(cleaned)) return false
            seenMajor.add(cleaned)
            return true
          }
          return false
        })
        const localLinkAgencies = agencies.filter(a =>
          a.agency_name.toLowerCase().includes('local link')
        )
        const otherAgencies = agencies.filter(a =>
          !MAJOR_OPERATORS.some(op => a.agency_name.includes(op.split(' ')[0])) &&
          !a.agency_name.toLowerCase().includes('local link')
        )

        return (
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                Transport Operators
              </h2>
              <span className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
                {agencies.length} operators
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {majorAgencies.slice(0, 6).map((agency) => (
                <div
                  key={agency.agency_id}
                  className="relative overflow-hidden rounded-xl p-4
                             bg-gradient-to-br from-white to-slate-50
                             dark:from-slate-700 dark:to-slate-800
                             border border-slate-200/50 dark:border-slate-600/30
                             hover:shadow-lg hover:-translate-y-0.5
                             transition-all duration-300 group"
                >
                  <div className={`absolute top-0 right-0 w-20 h-20
                                   bg-gradient-to-br ${getOperatorColor(agency.agency_name)}
                                   opacity-10 rounded-bl-full`} />
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{getOperatorIcon(agency.agency_name)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {cleanOperatorName(agency.agency_name)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Major Operator
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {localLinkAgencies.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>🚐</span> TFI Local Link Services
                </h3>
                <div className="flex flex-wrap gap-2">
                  {localLinkAgencies.map((agency) => (
                    <span
                      key={agency.agency_id}
                      className="px-3 py-1.5 bg-teal-50 dark:bg-teal-900/30
                                 text-teal-700 dark:text-teal-300
                                 rounded-lg text-sm font-medium
                                 border border-teal-200/50 dark:border-teal-700/50
                                 hover:bg-teal-100 dark:hover:bg-teal-900/50
                                 transition-colors duration-200"
                    >
                      {agency.agency_name.replace('TFI Local Link ', '')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button
                onClick={() => setShowAllOperators(!showAllOperators)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400
                           uppercase tracking-wider mb-3 hover:text-indigo-600 dark:hover:text-indigo-400
                           transition-colors duration-200"
              >
                <span>🚍</span>
                Other Operators ({otherAgencies.length})
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${showAllOperators ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div className={`overflow-hidden transition-all duration-500 ${
                showAllOperators ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
              }`}>
                <div className="flex flex-wrap gap-2 pt-2">
                  {otherAgencies.map((agency) => (
                    <span
                      key={agency.agency_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5
                                 bg-slate-50 dark:bg-slate-700/50
                                 text-slate-600 dark:text-slate-300
                                 rounded-lg text-sm
                                 border border-slate-200/50 dark:border-slate-600/30
                                 hover:bg-indigo-50 hover:text-indigo-700
                                 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300
                                 transition-colors duration-200"
                    >
                      <span className="text-base">{getOperatorIcon(agency.agency_name)}</span>
                      {agency.agency_name}
                    </span>
                  ))}
                </div>
              </div>

              {!showAllOperators && (
                <div className="flex flex-wrap gap-2">
                  {otherAgencies.slice(0, 8).map((agency) => (
                    <span
                      key={agency.agency_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5
                                 bg-slate-50 dark:bg-slate-700/50
                                 text-slate-600 dark:text-slate-300
                                 rounded-lg text-sm
                                 border border-slate-200/50 dark:border-slate-600/30"
                    >
                      <span className="text-base">{getOperatorIcon(agency.agency_name)}</span>
                      {agency.agency_name}
                    </span>
                  ))}
                  {otherAgencies.length > 8 && (
                    <span className="px-3 py-1.5 text-slate-500 dark:text-slate-400 text-sm">
                      +{otherAgencies.length - 8} more...
                    </span>
                  )}
                </div>
              )}
            </div>
          </GlassCard>
        )
      })()}

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            Popular Routes
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Click ❤️ to save favorites
          </span>
        </div>
        <div className="space-y-2">
          {routes.map((route, index) => (
            <div
              key={route.route_id}
              className="flex items-center gap-4 p-4 rounded-xl
                         bg-slate-50/80 dark:bg-slate-700/30
                         hover:bg-white dark:hover:bg-slate-700/50
                         border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800
                         transition-all duration-300 group"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <Link
                to={`/route/${route.route_id}`}
                className="flex items-center gap-4 flex-1 min-w-0"
              >
                <span className="text-2xl transform group-hover:scale-110 transition-transform">
                  {getRouteTypeEmoji(route.route_type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {route.route_short_name || route.route_id}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                    {route.route_long_name}
                  </div>
                </div>
              </Link>
              <FavoriteButton route={route} />
              <Link to={`/route/${route.route_id}`}>
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
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
