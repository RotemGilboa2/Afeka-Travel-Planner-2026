"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LatLngExpression } from "leaflet";
import dynamic from "next/dynamic";
import useSilentRefresh from "@/hooks/useSilentRefresh";

const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then((mod) => mod.Polyline), { ssr: false });

type DayPlan = { dayIndex: number; distanceKm: number; };

export default function PlanPage() {
  useSilentRefresh();
  const router = useRouter();

  const [city, setCity] = useState("Tel Aviv");
  const [tripType, setTripType] = useState<"bike" | "trek">("bike");
  const [days, setDays] = useState(2);
  const [route, setRoute] = useState<LatLngExpression[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [daysPlan, setDaysPlan] = useState<DayPlan[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [weather, setWeather] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiText, setAiText] = useState<any | null>(null);
  const [center, setCenter] = useState<LatLngExpression>([32.0853, 34.7818]);

  useEffect(() => { if (tripType === "bike" && days < 2) setDays(2); }, [tripType, days]);

  const logout = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    router.replace("/login");
    router.refresh();
  };

  async function fetchCityImage(cityName: string) {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cityName)}`);
      const data = await res.json();
      setImageUrl(data.thumbnail?.source || null);
    } catch { setImageUrl(null); }
  }

    async function geocodeCity(cityName: string) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`,
          {
            headers: {
              "User-Agent": "AfekaTravelProject_2026_Student_App"
            }
          }
        );
        
        if (!res.ok) throw new Error("Server blocked request");
        
        const data = await res.json();
        if (!data || data.length === 0) {
          alert("No city with that name found");
          return null;
        }
        
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      } catch (err) {
        console.error("Geocoding failed:", err);
        alert("The map service temporarily blocked the request. Try connecting from your phone (Hotspot) or wait a minute.");
        return null;
      }
  }

  async function fetchWeather(lat: number, lng: number) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const endDate = new Date(); endDate.setDate(endDate.getDate() + 3);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${formatDate(tomorrow)}&end_date=${formatDate(endDate)}`);
    const data = await res.json();
    if (!data.daily) return;
    setWeather(data.daily.time.map((date: string, i: number) => ({ date, max: data.daily.temperature_2m_max[i], min: data.daily.temperature_2m_min[i] })));
  }

  function generateRandomDestination(lat: number, lng: number, radiusKm: number) {
    const angle = Math.random() * 2 * Math.PI;
    const deltaLat = (radiusKm / 111) * Math.cos(angle);
    const deltaLng = (radiusKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    return { lat: lat + deltaLat, lng: lng + deltaLng };
  }

  const generateRoute = async () => {
    setLoading(true); setRoute([]); setDistanceKm(null); setDaysPlan([]); setImageUrl(null); setWeather([]); setAiText(null);
    const geo = await geocodeCity(city);
    if (!geo) { setLoading(false); return; }
    setCenter([geo.lat, geo.lng]);
    await fetchCityImage(city);
    await fetchWeather(geo.lat, geo.lng);

    const profile = tripType === "bike" ? "cycling" : "foot";
    let currentLat = geo.lat; 
    let currentLng = geo.lng;
    let allRoutes: LatLngExpression[] = []; 
    let totalDistanceMeters = 0;
    const perDay: DayPlan[] = [];

    for (let i = 0; i < days; i++) {
      let valid = false; 
      let attempts = 0;
      
      while (!valid && attempts < 15) { 
        attempts++;
        
        let url = "";

        if (tripType === "trek") {
          
          const radius = 2 + Math.random() * 1.5; 
          const waypoint = generateRandomDestination(geo.lat, geo.lng, radius);
          
          const start = `${geo.lng},${geo.lat}`;
          const mid = `${waypoint.lng},${waypoint.lat}`;
          const end = `${geo.lng},${geo.lat}`;  
          
          
          url = `https://router.project-osrm.org/route/v1/${profile}/${start};${mid};${end}?overview=full&geometries=geojson`;
        } else {
          const radius = 40;
          const destination = generateRandomDestination(currentLat, currentLng, radius);
          const start = `${currentLng},${currentLat}`; 
          const end = `${destination.lng},${destination.lat}`;
          url = `https://router.project-osrm.org/route/v1/${profile}/${start};${end}?overview=full&geometries=geojson`;
        }

        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes?.length) continue;
        
        const dKm = data.routes[0].distance / 1000;
        
        if (tripType === "trek" ? (dKm < 5 || dKm > 10) : (dKm < 30 || dKm > 70)) continue;
        const coords = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]] as LatLngExpression);
        allRoutes = [...allRoutes, ...coords];
        totalDistanceMeters += data.routes[0].distance;
        perDay.push({ dayIndex: i + 1, distanceKm: dKm });
        
        if (tripType === "bike") {
          const lastCoord = coords[coords.length - 1];
          currentLat = lastCoord[0]; 
          currentLng = lastCoord[1];
        }
        
        valid = true;
      }
    }

    setRoute(allRoutes); setDaysPlan(perDay); setDistanceKm(totalDistanceMeters / 1000);

    try {
      const aiRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/trip`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, tripType, days, daysPlan: perDay }),
      });
      const aiData = await aiRes.json();
      if (aiData.ok) { setAiText(JSON.parse(aiData.text)); }
    } catch (err) { console.error("AI error", err); }
    setLoading(false);
  };

  const approveRoute = async () => {
    if (!distanceKm || route.length < 2) return;
    
    const descriptionToSave = aiText 
      ? `${aiText.title}\n${aiText.summary}\n\n${aiText.days?.map((d: any) => `Day ${d.day}: ${d.description}`).join("\n\n")}`
      : "";

    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/routes`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city, tripType, days, totalDistanceKm: distanceKm,
        geometry: route.map((p: any) => [p[0], p[1]]),
        daysPlan, imageUrl, aiDescription: descriptionToSave
      }),
    });
    alert("The route was saved successfully 🎉");
  };

  return (
    <div className="p-6">
      <div className="flex justify-end mb-4"><button onClick={logout} className="bg-red-600 text-white px-4 py-2 rounded">Logout</button></div>
      <h1 className="text-3xl font-bold mb-4">Planning routes🌍</h1>
      <div className="flex gap-4 mb-4 flex-wrap">
        <input className="border p-2" value={city} onChange={(e) => setCity(e.target.value)} />
        <select className="border p-2" value={tripType} onChange={(e) => setTripType(e.target.value as "bike" | "trek")}>
          <option value="bike">Bike</option>
          <option value="trek">Trek</option>
        </select>
        <select className="border p-2" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {tripType === "bike" ? (<><option value={2}>2 days</option><option value={3}>3 days</option></>) : (<><option value={1}>1 day</option><option value={2}>2 days</option><option value={3}>3 days</option></>)}
        </select>
        <button onClick={generateRoute} className="bg-green-600 text-white px-4 py-2" disabled={loading}>{loading ? "loading..." : "Generate Route"}</button>
      </div>

      {weather.length > 0 && (
        <div className="mb-4">
          <h2 className="font-bold mb-2">Forecast for the next 3 days:</h2>
          {weather.map((day, i) => <div key={i}>{day.date} → 🌡 {day.min}°C - {day.max}°C</div>)}
        </div>
      )}

      {imageUrl && <div className="mb-6"><img src={imageUrl} alt={city} className="w-full h-64 object-cover rounded-lg shadow-md" /></div>}

      {aiText && (
        <div className="mb-6 p-4 bg-gray-100 rounded">
          <h2 className="text-xl font-bold mb-2">{aiText.title}</h2>
          <p className="mb-4">{aiText.summary}</p>
          {aiText.days?.map((d: any) => (<div key={d.day} className="mb-2"><strong>Day {d.day}</strong> – {d.distance}<br />{d.description}</div>))}
        </div>
      )}

      {distanceKm && (
        <>
          <p className="mb-2 font-semibold">Total Distance: {distanceKm.toFixed(2)} km</p>
          {daysPlan.map((d) => <p key={d.dayIndex}>day {d.dayIndex}: {d.distanceKm.toFixed(2)} km</p>)}
          <button onClick={approveRoute} className="bg-blue-600 text-white px-4 py-2 mt-4">Save Route ❤️</button>
        </>
      )}

      <div style={{ height: "500px" }}>
        <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {route.length > 0 && <Polyline positions={route} />}
        </MapContainer>
      </div>
    </div>
  );
}