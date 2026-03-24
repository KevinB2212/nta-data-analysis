// lets users save their frequently used routes to a favorites list
// stored in localStorage so it sticks around even if they close the browser

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface FavoriteRoute {
  route_id: string
  route_short_name: string | null
  route_long_name: string | null
  route_type: number
  route_color: string | null
  agency_name: string | null
  added_at: number
}

interface FavoritesContextType {
  favorites: FavoriteRoute[]
  addFavorite: (route: Omit<FavoriteRoute, 'added_at'>) => void
  removeFavorite: (routeId: string) => void
  isFavorite: (routeId: string) => boolean
  toggleFavorite: (route: Omit<FavoriteRoute, 'added_at'>) => void
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined)

const STORAGE_KEY = 'jump-favorite-routes'

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteRoute[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites))
  }, [favorites])

  const addFavorite = (route: Omit<FavoriteRoute, 'added_at'>) => {
    setFavorites(prev => {
      if (prev.some(f => f.route_id === route.route_id)) {
        return prev
      }
      return [...prev, { ...route, added_at: Date.now() }]
    })
  }

  const removeFavorite = (routeId: string) => {
    setFavorites(prev => prev.filter(f => f.route_id !== routeId))
  }

  const isFavorite = (routeId: string) => {
    return favorites.some(f => f.route_id === routeId)
  }

  const toggleFavorite = (route: Omit<FavoriteRoute, 'added_at'>) => {
    if (isFavorite(route.route_id)) {
      removeFavorite(route.route_id)
    } else {
      addFavorite(route)
    }
  }

  return (
    <FavoritesContext.Provider value={{ favorites, addFavorite, removeFavorite, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider')
  }
  return context
}
