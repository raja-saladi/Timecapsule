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
5. Start the app: `pnpm dev`

Use the publishable (or legacy anon) key in browser-visible configuration. Never put a service-role key in a `NEXT_PUBLIC_*` variable. `SUPABASE_SERVICE_ROLE_KEY` is optional, server-only, and only used to remove partially uploaded media after a failed multi-file save. Ordinary reads and writes use the signed-in user session and RLS.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: project publishable key (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works).
- `NEXT_PUBLIC_APP_URL`: app origin used in auth emails.
- `SUPABASE_SERVICE_ROLE_KEY`: optional server-only cleanup key.

## Features and privacy

- Sign-up, sign-in, sign-out, email confirmation callback, protected dashboard, create/edit/delete, search and status filters.
- Photos and videos are type/size limited and uploaded into the private `capsule-media` bucket.
- Capsule metadata is separate from letter contents. RLS policies on capsules, letters, media metadata, recipients, and Storage allow owners to manage their own capsules. Recipient accounts can access shared capsules only at or after `unlock_at`; a short-lived signed URL endpoint rechecks the time before signing.
- Owners can manage their own capsule before it opens, including reading its letter to edit it. The release gate applies to intended recipients; the owner is the author, and account-level RLS only gives them access to their own rows.
- A recipient must sign in with the email address added to the capsule. No bearer recipient links or predictable tokens are created.
- Unlocking is checked on each server request and by database RLS/storage policies using the unlock timestamp. The app does not send scheduled delivery emails. Recipients need an account and must visit the app after the selected time.
- The service-role key is never imported by client components. The server-only admin helper is limited to orphaned media cleanup and is not used for reads.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

There is no scheduled email provider or background job configured. The UI describes recipient access becoming available; it does not promise an automatic notification.

## Deploy to Vercel

Import the repository into Vercel, use the Next.js preset, configure the environment variables above for Preview and Production, apply the migration to the target Supabase project, and add each deployment origin's `/auth/callback` URL in Supabase Auth settings. Deploy, then smoke-test sign-up, email confirmation, sign-in, capsule creation, storage upload, pre-unlock recipient denial, and post-unlock recipient access with two separate test accounts.




