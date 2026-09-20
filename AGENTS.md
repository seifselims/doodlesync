# DoodleSync project guidance

## Scope and project context

These instructions apply across the repository. Follow additional `AGENTS.md`
instructions in the directory you are working in. For frontend work, also read
`apps/web/AGENTS.md` and its referenced local Next.js documentation.

DoodleSync is a multiplayer drawing-and-guessing game. Read
`docs/SKRIBBL_SYSTEM_DESIGN.md` for the intended architecture and rationale, and
`docs/IMPLEMENTATION_PLAN.md` for the actionable phase-by-phase roadmap, acceptance
criteria, current baseline, and latest handoff. These documents include planned
features; inspect the code before assuming a feature already exists.

## Implementation roadmap and agent handoff

- Use `docs/IMPLEMENTATION_PLAN.md` as the implementation progress tracker. Start
  with its latest handoff and the earliest incomplete milestone unless the user
  requests a different scope.
- At the planning baseline, the repository contains app/auth/database scaffolding,
  not multiplayer gameplay. The next milestone is foundation verification followed
  by Phase 1A: authenticated room creation, joining, and a synchronized live lobby.
  Recheck the plan and source before relying on this baseline.
- Follow the sequence: basic multiplayer → authoritative engine → reliability →
  durable results → Redis → horizontal scaling → performance → production hardening.
  Validation, authorization, and basic resource limits begin with multiplayer;
  they are not deferred to the final hardening phase.
- Reuse Better Auth identity and in-memory active rooms for the first playable
  version. Introduce Redis and multi-instance coordination only in their phases.
- After implementation work, update the plan's relevant checkboxes and latest
  handoff with delivered behavior, validation results, unresolved decisions/blockers,
  and the next concrete task. Only mark milestones complete when their exit criteria
  have been verified; distinguish implemented code from tested behavior.
- Keep this file focused on durable guidance and keep detailed task status in the
  implementation plan. Record deliberate roadmap changes there so future agents
  do not continue from conflicting assumptions.

## Workspace

- `apps/web`: Next.js App Router frontend, running locally on port 3001.
- `apps/server`: Hono HTTP backend on Node.js, running locally on port 3000.
- `packages/auth`: Better Auth configuration, initialized by the server.
- `packages/db`: PostgreSQL connection setup and Drizzle schemas.
- `packages/ui`: shared UI components and styles.
- `packages/config`: shared TypeScript configuration.

Use pnpm from the repository root. This is a pnpm/Turborepo workspace; use
`workspace:*` for internal dependencies and follow the existing dependency catalog
in `pnpm-workspace.yaml`. The backend's development and production runtime is
Node.js, even though some Bun-related files and scripts remain in the scaffold.

## Commands and validation

- `pnpm install`: install workspace dependencies.
- `pnpm run dev`: start frontend and backend.
- `pnpm run dev:web` / `pnpm run dev:server`: start one app.
- `pnpm run check-types`: type-check the workspace.
- `pnpm exec biome check <paths>`: check changed files without rewriting them.
- `pnpm run check`: run Biome with automatic writes across the repository; review
  its changes and avoid unrelated formatting churn.
- `pnpm run build`: build the workspace.
- `pnpm run db:start`: start local PostgreSQL through Docker Compose.
- `pnpm run env:generate`: regenerate environment accessors after schema changes.
- `pnpm run db:generate` / `pnpm run db:migrate`: generate and apply database
  migrations against the configured database.

Run checks appropriate to the change. For code changes, check formatting and
types; run a build when changing build configuration or app integration. Add
focused tests for game rules and meaningful failure cases as those features are
introduced. Inspect package scripts before assuming a test runner exists. Report
what was verified and any checks that could not run.

## Architecture and gameplay

- Build the single-instance game first. Start active rooms in process memory;
  introduce Redis coordination and horizontal scaling at the relevant roadmap
  stages.
- Keep Hono routes and WebSocket handlers thin. Put room operations and game rules
  in services/domain modules that can be tested independently of transport.
- The server owns room membership, permissions, game transitions, deadlines,
  guesses, and scores. Clients send intentions and render server state.
- Derive identity from the authenticated session or connection. Never trust
  client-supplied player identity, host/drawer flags, or score calculations.
- Validate incoming HTTP and WebSocket payloads with Zod. Define shared event
  contracts in `packages/shared` when introducing multiplayer functionality.
- Keep internal room state separate from public snapshots. Send word choices and
  the selected word only to the drawer until the rules allow revealing the word.
- Use explicit game states and server-owned deadlines. Enforce valid transitions
  and prevent duplicate scoring.
- Synchronize drawing operations with normalized coordinates. Bound payloads and
  event rates; avoid persisting every stroke to PostgreSQL.
- Use PostgreSQL for durable accounts and completed game results. Keep active
  gameplay state separate from durable storage.

## Implementation conventions

Follow nearby TypeScript code and the existing Biome configuration. Reuse shared
UI components through `@doodlesync/ui` and keep feature-specific UI in the web app.
Keep changes focused and preserve unrelated work.

Each app owns its `.env.schema`. Use the generated `ENV` accessor in application
code; do not manually edit generated environment files. Shared auth and database
packages receive configuration or initialized clients from their owning app.
Run environment-dependent tools from the owning app directory as documented in
`README.md`. Never commit secrets or log credentials.

For auth schema changes, use `pnpm run auth:generate`, review the generated schema,
and follow the Drizzle migration workflow. Check the configured database target
before applying schema changes; avoid destructive resets unless explicitly
requested.
