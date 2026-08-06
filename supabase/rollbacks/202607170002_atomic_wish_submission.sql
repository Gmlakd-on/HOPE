begin;

grant insert on table public.wishes to service_role;

drop function if exists public.submit_wish_atomic(
  text,
  text,
  public.wish_visibility,
  public.wish_locale,
  text,
  integer,
  integer
);

commit;
