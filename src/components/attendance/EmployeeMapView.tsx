import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveEmployeeLocation } from "@/hooks/useLiveEmployeeLocations";

// Custom colored markers via inline SVG
const buildIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });

const ICON_IN = buildIcon("#16a34a");
const ICON_OUT = buildIcon("#6b7280");

interface Props {
  locations: LiveEmployeeLocation[];
}

export function EmployeeMapView({ locations }: Props) {
  const center = useMemo<[number, number]>(() => {
    if (locations.length === 0) return [32.0853, 34.7818]; // Tel Aviv default
    const lat = locations.reduce((s, l) => s + l.lat, 0) / locations.length;
    const lng = locations.reduce((s, l) => s + l.lng, 0) / locations.length;
    return [lat, lng];
  }, [locations]);

  return (
    <MapContainer
      center={center}
      zoom={locations.length > 0 ? 11 : 8}
      scrollWheelZoom
      className="h-full w-full rounded-lg z-0"
      key={locations.length === 0 ? "empty" : "filled"}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((loc) => (
        <Marker
          key={loc.employee_id}
          position={[loc.lat, loc.lng]}
          icon={loc.direction === "in" ? ICON_IN : ICON_OUT}
        >
          <Popup>
            <div dir="rtl" style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 600 }}>{loc.full_name}</div>
              {loc.role && <div style={{ fontSize: 12, color: "#666" }}>{loc.role}</div>}
              {loc.department && <div style={{ fontSize: 12, color: "#666" }}>{loc.department}</div>}
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {loc.direction === "in" ? "🟢 בעבודה" : "⚪ יצא"}
                {" · "}
                {new Date(loc.punch_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
              </div>
              {loc.accuracy != null && (
                <div style={{ fontSize: 11, color: "#888" }}>דיוק: ±{Math.round(loc.accuracy)} מ׳</div>
              )}
              <a
                href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, color: "#2563eb", textDecoration: "underline", display: "block", marginTop: 4 }}
              >
                פתח ב-Google Maps
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
