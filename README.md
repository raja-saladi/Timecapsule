# Time Capsule

A responsive Next.js App Router application for saving private letters and media to a future date. The landing experience includes a procedural React Three Fiber capsule, with a CSS fallback and reduced-motion support.

## Requirements

- Node.js 20.9 or newer (Node 24 recommended)
- pnpm 9+
- A Supabase project for authentication, PostgreSQL, and private Storage

The checked-in package versions were current stable releases when scaffolded on October 23, 2026. React 19 is paired with React Three Fiber 9. See the official [Next.js release notes](https://nextjs.org/blog) and [React Three Fiber compatibility notes](https://github.com/pmndrs/react-three-fiber).

## Local setup

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.
3. Apply the SQL migration:
   ```sh
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref YOUR_PROJECT_REF
   pnpm dlx supabase db push
   ```
   Alternatively, paste `supabase/migrations/202610230001_initial_schema.sql` into the Supabase SQL Editor.
4. In Supabase Auth settings, enable email/password, set the site URL to your local app origin, and add `http://localhost:3000/auth/callback` to allowed redirect URLs.
5. Set NEXT_PUBLIC_RENDER_API_URL=http://localhost:10000 in .env.local, copy backend/.env.example to backend/.env, then start the API with pnpm api:start in one terminal. In a second terminal, start the app with pnpm dev. The API also needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and FRONTEND_ORIGINS=http://localhost:3000 in its environment.

Use the publishable (or legacy anon) key in browser-visible configuration. Never put a service-role key in a NEXT_PUBLIC variable. Render uses each signed-in user access token and Supabase RLS for writes and storage; no service-role key is needed. Vercel reads also use the user signed-in Supabase session.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: project publishable key (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works).
- `NEXT_PUBLIC_APP_URL`: app origin used in auth emails.
- NEXT_PUBLIC_RENDER_API_URL: Render API origin used for capsule writes and private media links.
- Render variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, FRONTEND_ORIGINS.

## Features and privacy

- Sign-up, sign-in, sign-out, email confirmation callback, protected dashboard, create/edit/delete, search and status filters.
- Photos and videos are type/size limited and uploaded into the private `capsule-media` bucket.
- Capsule metadata is separate from letter contents. RLS policies on capsules, letters, media metadata, recipients, and Storage allow owners to manage their own capsules. Recipient accounts can access shared capsules only at or after `unlock_at`; the Render API rechecks the time and returns a short-lived signed URL.
- Owners can manage their own capsule before it opens, including reading its letter to edit it. The release gate applies to intended recipients; the owner is the author, and account-level RLS only gives them access to their own rows.
- A recipient must sign in with the email address added to the capsule. No bearer recipient links or predictable tokens are created.
- Unlocking is checked on each server request and by database RLS/storage policies using the unlock timestamp. The app does not send scheduled delivery emails. Recipients need an account and must visit the app after the selected time.
- The Render API does not use a service-role key; user-scoped Supabase tokens and RLS enforce capsule ownership and release policies.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

There is no scheduled email provider or background job configured. The UI describes recipient access becoming available; it does not promise an automatic notification.

## Deploy

Deploy the Next.js app to Vercel from the GitHub repository. Deploy the API as a Render Blueprint using render.yaml. On Render, set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and FRONTEND_ORIGINS (comma-separated exact Vercel production and preview origins). The API uses each signed-in user's access token and Supabase RLS; it does not need a service-role key.

On Vercel, set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_APP_URL, and NEXT_PUBLIC_RENDER_API_URL to the Render service URL. Apply the SQL migration to the Supabase project. In Supabase Auth settings, set the production site URL and add each Vercel deployment's /auth/callback URL to allowed redirects, then deploy and smoke-test sign-in, capsule create/edit/delete, private media upload, and unlock behavior.
