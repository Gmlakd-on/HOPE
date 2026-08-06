begin;

create type public.wish_visibility as enum ('public', 'private');
create type public.wish_status as enum ('pending', 'approved', 'rejected');
create type public.wish_locale as enum ('ko', 'en');

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 3 and 300),
  nickname text check (nickname is null or char_length(nickname) <= 40),
  visibility public.wish_visibility not null default 'private',
  status public.wish_status not null default 'pending',
  locale public.wish_locale not null default 'ko',
  submitter_hash text,
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint approved_at_consistency check (
    (status = 'approved' and approved_at is not null)
    or (status <> 'approved' and approved_at is null)
  )
);

create index wishes_public_feed_idx
  on public.wishes (approved_at desc)
  where status = 'approved' and visibility = 'public';

create index wishes_submitter_rate_limit_idx
  on public.wishes (submitter_hash, created_at desc)
  where submitter_hash is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger wishes_set_updated_at
before update on public.wishes
for each row execute function public.set_updated_at();

create or replace function public.set_wish_approval_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at = now();
  elsif new.status <> 'approved' then
    new.approved_at = null;
  end if;
  return new;
end;
$$;

create trigger wishes_set_approval_timestamp
before update of status on public.wishes
for each row execute function public.set_wish_approval_timestamp();

alter table public.wishes enable row level security;

-- The browser never talks to the Data API directly. All access goes through
-- the server-only Supabase secret key in /api/wishes.
revoke all on table public.wishes from anon, authenticated;

grant all on table public.wishes to service_role;

grant usage on type public.wish_visibility to service_role;
grant usage on type public.wish_status to service_role;
grant usage on type public.wish_locale to service_role;

comment on table public.wishes is 'Submitted wishes. Only approved public rows may be returned by the application API.';
comment on column public.wishes.submitter_hash is 'HMAC-SHA256 of the request IP for short-window abuse prevention; raw IP is never stored.';

commit;
