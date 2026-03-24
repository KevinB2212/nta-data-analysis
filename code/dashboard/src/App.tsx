import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useTheme } from './context/ThemeContext'
import Home from './pages/Home'
import Search from './pages/Search'
import RouteDetails from './pages/RouteDetails'
import StopDetails from './pages/StopDetails'
import TripSummary from './pages/TripSummary'

// dark/light mode toggle button in the header
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-xl bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm
                 hover:bg-white/80 dark:hover:bg-slate-600/80
                 transition-all duration-300 text-xl"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}

// nav link that highlights when you're on that page
function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-xl font-medium transition-all duration-300
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900
        ${isActive
          ? 'bg-white/80 dark:bg-slate-700/80 text-indigo-600 dark:text-indigo-400 shadow-md'
          : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
        }`}
    >
      {children}
    </Link>
  )
}

// main app layout - header, page content, footer
// the gradient-bg div is just a subtle background effect
function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed inset-0 -z-10 gradient-bg opacity-10 dark:opacity-20" />

      <header className="sticky top-0 z-50 glass-subtle mx-4 mt-4 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="text-3xl transform group-hover:scale-110 transition-transform duration-300">
              🚌
            </span>
            <span className="text-2xl font-bold gradient-text">Jump</span>
          </Link>

          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 mr-4">
              <NavLink to="/">Home</NavLink>
              <NavLink to="/search">Plan Journey</NavLink>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* each page is a separate route - react router handles navigation */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/trip" element={<TripSummary />} />
            <Route path="/route/:routeId" element={<RouteDetails />} />
            <Route path="/stop/:stopId" element={<StopDetails />} />
          </Routes>
        </div>
      </main>

      <footer className="glass-subtle mx-4 mb-4 px-6 py-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            Jump App - Ireland Transport Reliability Analysis
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Data from National Transport Authority (NTA)
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
