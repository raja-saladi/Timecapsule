-- Time Capsule initial schema. Run with Supabase CLI or paste into SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capsules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  unlock_at timestamptz not null,
  time_zone text not null,
  visibility text not null default 'private' check (visibility in ('private','recipient')),
  recipient_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists capsules_owner_unlock_idx on public.capsules(user_id, unlock_at);
create index if not exists capsules_unlock_idx on public.capsules(unlock_at);

create table if not exists public.capsule_contents (
  capsule_id uuid primary key references public.capsules(id) on delete cascade,
  letter text,
  updated_at timestamptz not null default now()
);

create table if not exists public.capsule_recipients (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  recipient_email text not null check (position('@' in recipient_email) > 1),
  created_at timestamptz not null default now(),
  unique(capsule_id, recipient_email)
);
create index if not exists capsule_recipients_email_idx on public.capsule_recipients(lower(recipient_email));
-- SECURITY DEFINER avoids recursive RLS when a capsule policy checks recipient membership.
create or replace function public.is_capsule_recipient(target_capsule uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.capsule_recipients r where r.capsule_id=target_capsule and lower(r.recipient_email)=lower(auth.jwt()->>'email'));
$$;
revoke all on function public.is_capsule_recipient(uuid) from public;
grant execute on function public.is_capsule_recipient(uuid) to authenticated;

create table if not exists public.capsule_media (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes > 0 and size_bytes <= 31457280),
  created_at timestamptz not null default now()
);
create index if not exists capsule_media_capsule_idx on public.capsule_media(capsule_id);

-- Explicit table grants; row policies below remain the authorization boundary.
grant select,insert,update,delete on public.profiles,public.capsules,public.capsule_contents,public.capsule_recipients,public.capsule_media to authenticated;
revoke all on public.profiles,public.capsules,public.capsule_contents,public.capsule_recipients,public.capsule_media from anon;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger capsules_touch_updated_at before update on public.capsules for each row execute procedure public.touch_updated_at();
create trigger capsule_contents_touch_updated_at before update on public.capsule_contents for each row execute procedure public.touch_updated_at();
alter table public.profiles enable row level security;
alter table public.capsules enable row level security;
alter table public.capsule_contents enable row level security;
alter table public.capsule_recipients enable row level security;
alter table public.capsule_media enable row level security;

create policy "profiles_select_self" on public.profiles for select to authenticated using (id=auth.uid());
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id=auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "capsules_select_owner_or_released_recipient" on public.capsules for select to authenticated using (
  user_id=auth.uid() or (visibility='recipient' and unlock_at<=now() and public.is_capsule_recipient(capsules.id))
);
create policy "capsules_insert_owner_future" on public.capsules for insert to authenticated with check (user_id=auth.uid() and unlock_at>now());
create policy "capsules_update_owner_future" on public.capsules for update to authenticated using (user_id=auth.uid() and unlock_at>now()) with check (user_id=auth.uid() and unlock_at>now());
create policy "capsules_delete_owner_future" on public.capsules for delete to authenticated using (user_id=auth.uid() and unlock_at>now());

create policy "contents_select_owner_or_released_recipient" on public.capsule_contents for select to authenticated using (
  exists(select 1 from public.capsules c where c.id=capsule_contents.capsule_id and
    (c.user_id=auth.uid() or (c.visibility='recipient' and c.unlock_at<=now() and public.is_capsule_recipient(c.id)))
  )
);
create policy "contents_insert_owner_future" on public.capsule_contents for insert to authenticated with check (
  exists(select 1 from public.capsules c where c.id=capsule_contents.capsule_id and c.user_id=auth.uid() and c.unlock_at>now())
);
create policy "contents_update_owner_future" on public.capsule_contents for update to authenticated using (
  exists(select 1 from public.capsules c where c.id=capsule_contents.capsule_id and c.user_id=auth.uid() and c.unlock_at>now())
) with check (
  exists(select 1 from public.capsules c where c.id=capsule_contents.capsule_id and c.user_id=auth.uid() and c.unlock_at>now())
);
create policy "contents_delete_owner_future" on public.capsule_contents for delete to authenticated using (
  exists(select 1 from public.capsules c where c.id=capsule_contents.capsule_id and c.user_id=auth.uid() and c.unlock_at>now())
);

create policy "recipients_select_owner_or_self" on public.capsule_recipients for select to authenticated using (
  (lower(recipient_email)=lower(auth.jwt()->>'email') and exists(select 1 from public.capsules c where c.id=capsule_recipients.capsule_id and c.visibility='recipient' and c.unlock_at<=now())) or exists(select 1 from public.capsules c where c.id=capsule_recipients.capsule_id and c.user_id=auth.uid())
);
create policy "recipients_insert_owner_future" on public.capsule_recipients for insert to authenticated with check (
  exists(select 1 from public.capsules c where c.id=capsule_recipients.capsule_id and c.user_id=auth.uid() and c.unlock_at>now() and c.visibility='recipient')
);
create policy "recipients_delete_owner_future" on public.capsule_recipients for delete to authenticated using (
  exists(select 1 from public.capsules c where c.id=capsule_recipients.capsule_id and c.user_id=auth.uid() and c.unlock_at>now())
);

create policy "media_select_owner_or_released_recipient" on public.capsule_media for select to authenticated using (
  owner_id=auth.uid() or exists(select 1 from public.capsules c where c.id=capsule_media.capsule_id and c.visibility='recipient' and c.unlock_at<=now() and public.is_capsule_recipient(c.id))
);
create policy "media_insert_owner_future" on public.capsule_media for insert to authenticated with check (
  owner_id=auth.uid() and exists(select 1 from public.capsules c where c.id=capsule_media.capsule_id and c.user_id=auth.uid() and c.unlock_at>now())
);
create policy "media_delete_owner_future" on public.capsule_media for delete to authenticated using (
  owner_id=auth.uid() and exists(select 1 from public.capsules c where c.id=capsule_media.capsule_id and c.unlock_at>now())
);

-- Creating this bucket does not make it public; signed URLs are short-lived.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('capsule-media','capsule-media',false,31457280,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "capsule_storage_upload_owner_future" on storage.objects for insert to authenticated with check (
  bucket_id='capsule-media' and split_part(name,'/',1)=auth.uid()::text and exists(
    select 1 from public.capsules c where c.id::text=split_part(name,'/',2) and c.user_id=auth.uid() and c.unlock_at>now()
  )
);
create policy "capsule_storage_read_after_unlock" on storage.objects for select to authenticated using (
  bucket_id='capsule-media' and exists(
    select 1 from public.capsules c where c.id::text=split_part(name,'/',2) and c.unlock_at<=now() and
    (c.user_id=auth.uid() or (c.visibility='recipient' and public.is_capsule_recipient(c.id)))
  )
);
create policy "capsule_storage_delete_owner_future" on storage.objects for delete to authenticated using (
  bucket_id='capsule-media' and split_part(name,'/',1)=auth.uid()::text and exists(
    select 1 from public.capsules c where c.id::text=split_part(name,'/',2) and c.user_id=auth.uid() and c.unlock_at>now()
  )
);

-- Create a private profile automatically for each new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''));
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
