"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import type { LatLngExpression } from "leaflet";
import dynamic from "next/dynamic";
import useSilentRefresh from "@/hooks/useSilentRefresh";

const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then((mod) => mod.Polyline), { ssr: false });

type RouteItem = {
  _id: string;
  city: string;
  tripType: "bike" | "trek";
  days: number;
  totalDistanceKm?: number;
  distanceKm?: number;
  createdAt: string;
  imageUrl?: string | null;
  geometry?: [number, number][];
  daysPlan?: { dayIndex: number; distanceKm: number }[];
  aiDescription?: string; 
};

type WeatherInfo = { min: number; max: number };

export default function HistoryPage() {
  useSilentRefresh();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherInfo>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<RouteItem | null>(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  async function fetchRoutes() {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/routes`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch routes");
      const data: RouteItem[] = await res.json();
      setRoutes(data);
      
      data.forEach((route) => {
        fetchWeatherForTomorrow(route);
      });
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWeatherForTomorrow(route: RouteItem) {
    try {
      if (!route.geometry || route.geometry.length === 0) {
        return; 
      }

      const lat = route.geometry[0][0];
      const lon = route.geometry[0][1];

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split("T")[0];
      
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`);
      const weatherData = await weatherRes.json();
      
      if (!weatherData.daily) return;
      
      setWeatherMap((prev) => ({
        ...prev,
        [route.city]: { 
          min: weatherData.daily.temperature_2m_min[0], 
          max: weatherData.daily.temperature_2m_max[0] 
        },
      }));
    } catch (err) { 
      console.error(`Weather error for ${route.city}:`, err); 
    }
  }

  const getDistanceKm = (route: RouteItem) => {
    const v = route.totalDistanceKm ?? route.distanceKm;
    return Number.isFinite(v as number) ? (v as number) : null;
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen text-left" dir="ltr">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-black mb-10 text-gray-800 border-l-8 border-blue-600 pl-4 italic">Afeka Route History 2026 📜</h1>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-500 font-bold">Pulling routes from the archive...</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {routes.map((route) => {
            const dist = getDistanceKm(route);
            const weather = weatherMap[route.city];
            return (
              <div key={route._id} className="bg-white shadow-lg hover:shadow-2xl transition-all rounded-3xl overflow-hidden border border-gray-100 group">
                <div className="relative h-44 w-full overflow-hidden">
                  {route.imageUrl ? <img src={route.imageUrl} alt={route.city} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : <div className="bg-gray-200 w-full h-full flex items-center justify-center text-gray-400 italic">No Image</div>}
                  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-4 py-1 rounded-full text-xs font-black shadow-sm">{route.tripType === "bike" ? "Bike 🚴" : "Trek 🥾"}</div>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">{route.city}</h2>
                    <span className="text-[10px] font-bold text-gray-400 tracking-tighter">{new Date(route.createdAt).toLocaleDateString("en-US")}</span>
                  </div>
                  <div className="space-y-3 mb-6 text-sm">
                    <div className="flex items-center justify-between text-gray-600 border-b border-gray-50 pb-2"><span>Duration:</span><span className="font-bold">{route.days} Days</span></div>
                    <div className="flex items-center justify-between text-gray-600 border-b border-gray-50 pb-2"><span>Total Distance:</span><span className="font-bold text-blue-600 font-mono">{dist ? `${dist.toFixed(2)} km` : "---"}</span></div>
                  </div>
                  {weather ? (
                    <div className="bg-orange-50/50 border border-orange-100 p-3 rounded-2xl mb-6 text-center">
                      <p className="text-[10px] font-black text-orange-800 uppercase mb-1 underline">Forecast For Tomorrow</p>
                      <p className="text-lg font-black text-orange-900">{weather.min}°C - {weather.max}°C</p>
                    </div>
                  ) : <div className="h-12 bg-gray-50 animate-pulse rounded-2xl mb-6"></div>}
                  <button onClick={() => setSelectedRoute(route)} className="w-full bg-slate-900 text-white py-3 rounded-2xl font-bold hover:bg-blue-600 transition-colors shadow-lg">View Route Details</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal */}
        {selectedRoute && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[2.5rem] max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-300">
              
              <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="text-2xl font-black text-slate-800">Route Summary: {selectedRoute.city}</h2>
                  <p className="text-slate-500 text-sm">Data restored from MongoDB</p>
                </div>
                <button onClick={() => setSelectedRoute(null)} className="text-slate-400 hover:text-red-500 text-4xl font-light">&times;</button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 grid md:grid-cols-2 gap-6">
                
                {/* Map Section */}
                <div className="h-80 md:h-full min-h-[300px] rounded-3xl overflow-hidden border-4 border-slate-100 shadow-inner">
                  {selectedRoute.geometry && selectedRoute.geometry.length > 0 ? (
                    <MapContainer 
                      center={selectedRoute.geometry[0] as LatLngExpression} 
                      zoom={11} 
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Polyline positions={selectedRoute.geometry as LatLngExpression[]} color="blue" weight={5} />
                    </MapContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gray-100 text-gray-400 italic">No map data has been saved for this route.</div>
                  )}
                </div>

                {/* Text Section */}
                <div className="space-y-6">
                  <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg">
                    <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest">Updated Forecast</p>
                    <p className="text-2xl font-black">{weatherMap[selectedRoute.city]?.min}°C - {weatherMap[selectedRoute.city]?.max}°C</p>
                  </div>

                  <div>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 italic">Daily Breakdown</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedRoute.daysPlan?.map((d) => (
                        <div key={d.dayIndex} className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 text-xs">
                          <span className="font-bold">Day {d.dayIndex}:</span> {d.distanceKm.toFixed(2)} km
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 italic">Saved AI Suggestions</h3>
                    <div 
                      className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto"
                    >
                      {selectedRoute.aiDescription || "No saved description found."}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t flex justify-center">
                <button onClick={() => setSelectedRoute(null)} className="bg-slate-900 text-white px-12 py-3 rounded-2xl font-bold hover:bg-blue-600 transition-all shadow-lg">Close Window</button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}