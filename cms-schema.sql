-- Run in Supabase SQL editor

create table if not exists public.cms_pages (
  id bigserial primary key,
  slug text unique not null,
  title text,
  hero_eyebrow text,
  hero_title text,
  hero_lead text,
  seo_description text,
  content_html text,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cms_pages_updated_at on public.cms_pages;
create trigger trg_cms_pages_updated_at
before update on public.cms_pages
for each row execute function public.set_updated_at();

alter table public.cms_pages enable row level security;

-- Public can read only published pages
drop policy if exists "public read published pages" on public.cms_pages;
create policy "public read published pages"
on public.cms_pages
for select
to anon, authenticated
using (published = true);

-- Authenticated users can manage pages
drop policy if exists "authenticated manage pages" on public.cms_pages;
create policy "authenticated manage pages"
on public.cms_pages
for all
to authenticated
using (true)
with check (true);

-- Storage bucket for images
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Public read media
drop policy if exists "public read media" on storage.objects;
create policy "public read media"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'media');

-- Authenticated users upload/update/delete media
drop policy if exists "authenticated manage media" on storage.objects;
create policy "authenticated manage media"
on storage.objects
for all
to authenticated
using (bucket_id = 'media')
with check (bucket_id = 'media');
