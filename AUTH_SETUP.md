# Auth setup (do this once)

Your `.env` file already has your Supabase URL + publishable key filled in, so
you can skip straight to step 1 below.

## 1. Run the database migration
1. Open your Supabase project → **SQL Editor** → **New query**
2. Paste the entire contents of `supabase/migration.sql`
3. Click **Run**

This creates the `profiles` table (with roles: admin / editor / viewer),
auto-creates a profile for every new signup (defaulting to `viewer`), sets up
Row Level Security so users can only see/edit what they're allowed to, and
adds server-side login-lockout functions (5 failed attempts → 15 min lock).

## 2. Turn on email confirmation
Dashboard → **Authentication → Sign In / Providers → Email**
Make sure **"Confirm email"** is switched ON (it's on by default). This is what
makes signup send a real verification link before the account can log in.

## 3. (Recommended) Tighten password rules
Dashboard → **Authentication → Policies** (or **Auth settings**)
Set **Minimum password length** to at least 8. The app also enforces its own
strength meter client-side, but the server-side minimum is the real floor.

## 4. Make yourself the first admin
Everyone who signs up starts as a **viewer** — including you. After you sign
up and verify your email once, go back to the SQL Editor and run:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Then reload the app. You'll see a **USERS** button in the top bar to manage
everyone else's roles from then on.

## 5. Run it
```
npm install
npm run dev
```

## What's real vs. what to know
- **Password hashing, email verification delivery, rate limiting on the auth
  endpoints, and TOTP 2FA** are all handled server-side by Supabase — this is
  genuine, not simulated. Your frontend never sees or stores a raw password.
- **Role enforcement for login/signup/who-can-become-admin** is enforced by
  Postgres Row Level Security — a user editing the frontend JS cannot grant
  themselves admin.
- **Role enforcement *inside* the VNS screens** (upload, edit fields, add
  screens) is UI-level only, because the app's own content (images, obstacle
  data, etc.) is local-only with no backend of its own — there's nothing on a
  server to protect yet. If you later persist that content to Supabase too,
  the same RLS approach extends naturally to it.
