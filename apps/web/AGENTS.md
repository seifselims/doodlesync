<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DoodleSync frontend

- Follow `docs/UI_THEME.md` (the "arcade sketchbook" theme) for colors, type,
  surfaces, motion and toast/alert rules. Check changes in light and dark mode and
  at phone width.
- Use semantic tokens and shared components from `@doodlesync/ui`; add new
  reusable primitives there and keep game-specific UI (lobby, player rows, logo)
  in this app. Do not introduce orange/black palettes or new font families.
- Use `toast` from `sonner` for transient events (joins, leaves, copies,
  reconnects); use the shared `Alert` for blocking errors that need action.
- Buttons give feedback on press; respect `prefers-reduced-motion` and
  `prefers-reduced-transparency` in any new motion or translucent surface.

## Routing and auth

- Signed-in pages live in `src/app/(app)` and are wrapped by `RequireAuth`;
  `/login` and `/signup` live in `src/app/(auth)`. Read the user with
  `useSignedInUser()` inside `(app)` pages.
- The session cookie belongs to the API origin, so the Next.js server cannot see
  it. Gate pages on the client and rely on the API for authorization; do not add a
  `proxy.ts` session check or server-side `getSession` for page access.
- Redirect targets from `?next=` must go through `safeNextPath`.
- Browser code must read the API origin from `src/lib/server-url.ts`. In
  `next dev`, Varlock only inlines `ENV.*` in `"use client"` modules.
- Call room HTTP endpoints through `src/lib/rooms-api.ts`, which validates
  responses with shared schemas and returns typed errors.

