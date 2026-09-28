"use client";

import { ENV } from "@/env";

// Varlock inlines public ENV values in every file for production builds, but in
// `next dev` (Turbopack) only inside "use client" modules. Browser code must read
// the API origin from here, or dev requests go to the web origin instead.
export const SERVER_URL = ENV.NEXT_PUBLIC_SERVER_URL;
