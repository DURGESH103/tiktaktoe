# Tiktoe

Real-time multiplayer Tic-Tac-Toe built with Next.js 15, Supabase (Postgres, Realtime, anonymous Auth), Tailwind, and Framer Motion.

> **Status:** steps 1–7 are done: setup, database, auth, rooms, real-time play, scoring (win strike, winner modal with confetti, series score, rematch), history (stats, streaks, head-to-head, move-by-move replay), sharing (WhatsApp/copy fallbacks, link-preview cards, public profiles at `/u/<handle>`, in-game profile sheet), and polish (synthesised sound effects with mute, vibration, emoji reactions, screen-reader announcements, loading screens). The PWA comes next.

`npm test` runs the unit tests and the database tests. The database tests apply every migration to an in-memory Postgres (PGlite) and check game rules, stats, privacy and write protection.

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Authentication → Sign In / Providers** and turn on **Allow anonymous sign-ins** and **Allow manual linking**.
3. Apply the migrations in `supabase/migrations/` **in filename order**, using either option A or option B.

**Option A: SQL editor.** Open **SQL Editor → New query**, paste each file's contents, and click **Run**:

   1. `20261104000100_schema.sql`
   2. `20261104000200_rls.sql`
   3. `20261104000300_functions.sql`
   4. `20261104000400_realtime.sql`
   5. `20261104000500_public_profiles.sql`: public handles, server-side stats, profile and invite-preview lookups
   6. `20261104000600_room_messages.sql`: in-game chat (messages table, member-only access, `send_message` with validation and rate limit)
   7. `20261104000700_friends.sql`: friend requests, blocking, search, private last-seen (and blocks chat between blocked players)
   8. `20261104000800_challenges.sql`: 60-second challenges that create a game room on accept

   `supabase/ALL_MIGRATIONS.sql` combines files 1–4 for a fresh project. Run files 5–8 separately. Afterwards, `npm run check:chat` and `npm run check:friends` confirm the backend from your PC.

**Option B: Supabase CLI.** Your project ref is the `xxxx` in `https://xxxx.supabase.co`.

   ```bash
   npx supabase login
   npx supabase init            # creates supabase/config.toml; answer "N" to the VS Code / Deno prompts
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push         # applies everything in supabase/migrations
   ```

4. Copy the env template and fill in your values from **Project Settings → API Keys**:

   ```bash
   cp .env.example .env.local
   ```

### Optional: Google sign-in (for linking a guest account)

1. In Google Cloud Console, create an OAuth client of type **Web**.
2. Set the authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase, go to **Authentication → Providers → Google**, enable it, and paste in the client ID and secret.
4. In **Authentication → URL Configuration**, add your site URLs (for example `http://localhost:3000/**` and `https://your-app.vercel.app/**`) to the redirect allow list.

## 2. Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # win/draw logic unit tests
npm run typecheck
```

## 3. Test two-player sync

- **Two windows on one computer:** use a normal window and a private/incognito window. Each one gets its own anonymous player. Create a game in one window and open the link in the other.
- **Phone and computer on the same Wi-Fi:** run `npm run dev:lan`, then open `http://<your-PC-IP>:3000` on the phone. Plain `http` has no Web Share API, so the share button falls back to copying the link.
- **Easiest for phones:** deploy a Vercel preview (see below). With HTTPS, the native share sheet works.

Things worth checking:

- Moves show up on the other device within a fraction of a second.
- A move made out of turn is impossible (the board is locked), and a forced bad move gets rejected and rolled back.
- Refreshing the page mid-game restores the board.
- Switching apps for a few seconds shows "stepped away". After about 30 seconds you get "seems to have left", with the choice to **Keep waiting** or **Leave room**.
- Opening the link in a third window shows **Room is full**.

## 4. Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel. The framework (Next.js) is detected automatically.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as environment variables.
3. Add the Vercel URL to Supabase **Authentication → URL Configuration**.

## How cheating is prevented

Clients have **read-only** access to `rooms` and `games` through RLS, and only members of a room can read it. Every write goes through `security definer` Postgres functions that check `auth.uid()`:

| Function | Checks |
| --- | --- |
| `create_room()` | Caller has a profile. Generates a unique 5-character code. |
| `join_room(code)` | Idempotent for members, which is how a refresh restores state. A third player gets `ROOM_FULL`. |
| `make_move(game_id, cell)` | Locks the game row (`FOR UPDATE`), then checks seat, turn, `status = 'playing'`, and an empty cell. Win and draw are resolved on the server. |
| `request_rematch(room_id)` | Starts the next round and alternates who goes first. Idempotent if both players tap it. |
| `leave_room(room_id)` | Closes the room and any round still in progress. |
