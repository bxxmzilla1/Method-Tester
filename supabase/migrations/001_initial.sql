-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query), or use the Supabase CLI.

-- Links and per-slug analytics
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  bio text not null default '',
  screenshot_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id bigserial primary key,
  link_slug text not null references public.links (slug) on delete cascade,
  ip_address text not null default '',
  country text not null default 'Unknown',
  created_at timestamptz not null default now()
);

create index if not exists visits_link_slug_idx on public.visits (link_slug);

alter table public.links enable row level security;
alter table public.visits enable row level security;

-- Public Storage bucket for screenshots (5 MB limit; adjust if needed)
insert into storage.buckets (id, name, public, file_size_limit)
values ('link-screenshots', 'link-screenshots', true, 5242880)
on conflict (id) do update set public = excluded.public;

-- Anyone can read objects (needed for <img src="...">). Uploads use the service role on the server.
drop policy if exists "Public read link screenshots" on storage.objects;
create policy "Public read link screenshots"
on storage.objects
for select
to public
using (bucket_id = 'link-screenshots');
