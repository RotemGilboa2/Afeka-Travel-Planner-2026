"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">

      <h1 className="text-4xl font-bold mb-10">
       Afeka Travel Planner 2026
      </h1>

      <div className="flex flex-col gap-4 w-64">

        <button
          onClick={() => router.push("/plan")}
          className="bg-green-600 text-white p-3 rounded hover:bg-green-700"
        >
         Plan a Route
        </button>

        <button
          onClick={() => router.push("/history")}
          className="bg-blue-600 text-white p-3 rounded hover:bg-blue-700"
        >
         Route History
        </button>

        <button
          onClick={() => router.push("/login")}
          className="bg-gray-600 text-white p-3 rounded hover:bg-gray-700"
        >
          Login
        </button>

        <button
          onClick={() => router.push("/register")}
          className="bg-gray-800 text-white p-3 rounded hover:bg-gray-900"
        >
          Register
        </button>

      </div>

    </div>
  );
}
