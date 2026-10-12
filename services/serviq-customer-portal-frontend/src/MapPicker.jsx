import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Button, Stack, Typography } from '@mui/material'
import MyLocationIcon from '@mui/icons-material/MyLocation'

// Leaflet + OpenStreetMap — free tiles, no API key. The customer drops a
// pin; the parent stores lat/lng inside the address JSONB and reverse
// geocodes it into the text fields.

const DEFAULT_CENTER = [14.5995, 120.9842] // Metro Manila — the demo service area

// CSS pin — avoids Leaflet's missing-image-asset problem under Vite.
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;background:#7c3aed;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

function ClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) })
  return null
}

// Follow pin moves (including "use my location") and fix tile sizing —
// the dialog animates open after the map mounts, so a late invalidateSize
// is required or tiles render blank/misaligned.
function MapDynamics({ position }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 300)
    return () => clearTimeout(t)
  }, [map])
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 15))
  }, [position, map])
  return null
}

export default function MapPicker({ position, onPick }) {
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState(null)

  const locate = () => {
    if (!navigator.geolocation) return setGeoError('Geolocation is not supported by this browser.')
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onPick({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setLocating(false)
        setGeoError('Could not get your location — tap the map to drop a pin instead.')
      },
      { timeout: 10000 },
    )
  }

  return (
    <Stack spacing={1}>
      <div style={{ height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(30,27,75,.15)' }}>
        <MapContainer
          center={position || DEFAULT_CENTER}
          zoom={position ? 15 : 12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onPick} />
          <MapDynamics position={position} />
          {position && <Marker position={position} icon={pinIcon} />}
        </MapContainer>
      </div>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button
          size="small"
          startIcon={<MyLocationIcon />}
          onClick={locate}
          disabled={locating}
        >
          {locating ? 'Locating…' : 'Use my location'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {position
            ? `Pin: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
            : 'Tap the map to drop a pin at the service location.'}
        </Typography>
      </Stack>
      {geoError && <Typography variant="caption" color="error">{geoError}</Typography>}
    </Stack>
  )
}
