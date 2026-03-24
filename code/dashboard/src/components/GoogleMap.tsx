// google maps component - shows markers for stops/origin/dest and route polylines
// supports click-to-select (for picking origin/destination on the map)
// has a custom dark mode style that matches our UI theme

import { useCallback, useState } from 'react'
import {
  GoogleMap as GoogleMapComponent,
  useJsApiLoader,
  Marker,
  Polyline,
  InfoWindow,
} from '@react-google-maps/api'

// default center on Dublin city, since thats where most of the transport data is
const DUBLIN_CENTER = { lat: 53.3498, lng: -6.2603 }
const DEFAULT_ZOOM = 13

export interface MapMarker {
  id: string
  lat: number
  lon: number
  label?: string
  type?: 'origin' | 'destination' | 'stop' | 'default'
  popup?: string
}

export interface MapRoute {
  coordinates: [number, number][]
  color?: string
}

interface GoogleMapProps {
  markers?: MapMarker[]
  routes?: MapRoute[]
  center?: [number, number]
  zoom?: number
  height?: string
  onClick?: (lat: number, lon: number) => void
  className?: string
}

// green for origin, red for destination, purple for stops
const markerColors = {
  origin: '#22c55e',
  destination: '#ef4444',
  stop: '#6366f1',
  default: '#3b82f6',
}

const darkModeStyles = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }],
  },
]

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

export default function GoogleMap({
  markers = [],
  routes = [],
  center,
  zoom = DEFAULT_ZOOM,
  height = '400px',
  onClick,
  className = '',
}: GoogleMapProps) {
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [, setMap] = useState<google.maps.Map | null>(null)

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  })

  // when the map loads, auto-zoom to fit all markers (with 50px padding)
  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map)

    if (markers.length > 1) {
      const bounds = new google.maps.LatLngBounds()
      markers.forEach((marker) => {
        bounds.extend({ lat: marker.lat, lng: marker.lon })
      })
      map.fitBounds(bounds, 50)
    }
  }, [markers])

  const onUnmount = useCallback(() => {
    setMap(null)
  }, [])

  const handleClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (onClick && e.latLng) {
      onClick(e.latLng.lat(), e.latLng.lng())
    }
  }, [onClick])

  const isDarkMode = document.documentElement.classList.contains('dark')

  const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: isDarkMode ? darkModeStyles : undefined,
  }

  if (loadError) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl ${className}`}
        style={{ height }}
      >
        <div className="text-center text-slate-500 dark:text-slate-400">
          <p>Failed to load Google Maps</p>
          <p className="text-sm mt-1">Check your API key configuration</p>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl ${className}`}
        style={{ height }}
      >
        <div className="spinner" />
      </div>
    )
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl ${className}`}
        style={{ height }}
      >
        <div className="text-center text-slate-500 dark:text-slate-400 p-4">
          <p className="font-medium">Google Maps API Key Required</p>
          <p className="text-sm mt-2">
            Add <code className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to your <code>.env</code> file
          </p>
        </div>
      </div>
    )
  }

  const mapCenter = center
    ? { lat: center[0], lng: center[1] }
    : markers.length === 1
    ? { lat: markers[0].lat, lng: markers[0].lon }
    : DUBLIN_CENTER

  return (
    <div className={`map-container ${className}`} style={{ height }}>
      <GoogleMapComponent
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={mapCenter}
        zoom={zoom}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={handleClick}
        options={mapOptions}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={{ lat: marker.lat, lng: marker.lon }}
            onClick={() => setSelectedMarker(marker)}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: markerColors[marker.type || 'default'],
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3,
            }}
          />
        ))}

        {selectedMarker && (
          <InfoWindow
            position={{ lat: selectedMarker.lat, lng: selectedMarker.lon }}
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div className="p-1">
              {selectedMarker.label && (
                <strong className="block">{selectedMarker.label}</strong>
              )}
              {selectedMarker.popup && (
                <p className="text-sm mt-1">{selectedMarker.popup}</p>
              )}
            </div>
          </InfoWindow>
        )}

        {routes.map((route, index) => (
          <Polyline
            key={index}
            path={route.coordinates.map(([lat, lng]) => ({ lat, lng }))}
            options={{
              strokeColor: route.color || '#6366f1',
              strokeWeight: 4,
              strokeOpacity: 0.8,
            }}
          />
        ))}
      </GoogleMapComponent>
    </div>
  )
}
