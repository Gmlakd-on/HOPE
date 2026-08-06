begin;

-- Remove the previous signature that included p_nickname.
-- IF EXISTS prevents failure when the old function is already absent.
drop function if exists public.submit_wish_atomic(
  text,
  text,
  public.wish_visibility,
  public.wish_locale,
  text,
  integer,
  integer
);

alter table public.wishes
  drop column if exists nickname;

create or replace function public.submit_wish_atomic(
  p_message text,
  p_visibility public.wish_visibility,
  p_locale public.wish_locale,
  p_submitter_hash text,
  p_max_submissions integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent_count integer := 0;
  v_now timestamptz;
  v_wish public.wishes%rowtype;
begin
  if p_submitter_hash is null
    or pg_catalog.btrim(p_submitter_hash) = ''
  then
    raise exception using
      errcode = '22023',
      message = 'p_submitter_hash is required';
  end if;

  if p_max_submissions < 1
    or p_max_submissions > 100
  then
    raise exception using
      errcode = '22023',
      message = 'p_max_submissions must be between 1 and 100';
  end if;

  if p_window_seconds < 1
    or p_window_seconds > 86400
  then
    raise exception using
      errcode = '22023',
      message = 'p_window_seconds must be between 1 and 86400';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_submitter_hash, 0)
  );

  v_now := pg_catalog.clock_timestamp();

  select count(*)
    into v_recent_count
    from public.wishes
   where submitter_hash = p_submitter_hash
     and created_at >= (
       v_now - pg_catalog.make_interval(secs => p_window_seconds)
     );

  if v_recent_count >= p_max_submissions then
    return pg_catalog.jsonb_build_object(
      'accepted',
      false
    );
  end if;

  insert into public.wishes (
    message,
    visibility,
    locale,
    submitter_hash,
    created_at,
    updated_at
  )
  values (
    p_message,
    p_visibility,
    p_locale,
    p_submitter_hash,
    v_now,
    v_now
  )
  returning *
    into v_wish;

  return pg_catalog.jsonb_build_object(
    'accepted',
    true,
    'wish',
    pg_catalog.to_jsonb(v_wish)
  );
end;
$$;

revoke all on function public.submit_wish_atomic(
  text,
  public.wish_visibility,
  public.wish_locale,
  text,
  integer,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.submit_wish_atomic(
  text,
  public.wish_visibility,
  public.wish_locale,
  text,
  integer,
  integer
) to service_role;

comment on function public.submit_wish_atomic(
  text,
  public.wish_visibility,
  public.wish_locale,
  text,
  integer,
  integer
) is
  'Atomically rate-limits and stores an anonymous pending wish.';

commit;