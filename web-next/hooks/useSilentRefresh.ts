"use client";

import { useEffect } from "react";

export default function useSilentRefresh() {
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        if (!res.ok) {
          console.log("Refresh failed");
        } else {
          console.log("Token refreshed silently");
        }
      } catch (err) {
        console.error("Refresh error", err);
      }
    }, 1000 * 60 * 60 * 24); 

    return () => clearInterval(interval);
  }, []);
}
