begin;

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  badge text not null default '' check (char_length(badge) <= 30),
  name text not null check (char_length(name) between 1 and 100),
  price_krw integer not null default 0 check (price_krw between 0 and 100000000),
  image_url text not null check (char_length(image_url) between 1 and 2000),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  description text not null default '' check (char_length(description) <= 1000),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products drop column if exists donation_note;
alter table public.products drop column if exists inquiry_note;

create table if not exists public.product_catalog_settings (
  id smallint primary key default 1 check (id = 1),
  donation_note text not null default '' check (char_length(donation_note) <= 1000),
  inquiry_note text not null default '' check (char_length(inquiry_note) <= 1000),
  updated_at timestamptz not null default now()
);

create index if not exists products_public_order_idx
  on public.products (sort_order asc, created_at asc)
  where is_published = true;

create or replace function public.set_products_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_products_updated_at();

drop trigger if exists product_catalog_settings_set_updated_at on public.product_catalog_settings;
create trigger product_catalog_settings_set_updated_at
before update on public.product_catalog_settings
for each row execute function public.set_products_updated_at();

alter table public.products enable row level security;
alter table public.product_catalog_settings enable row level security;

revoke all on table public.products from anon, authenticated;
revoke all on table public.product_catalog_settings from anon, authenticated;
grant all on table public.products to service_role;
grant all on table public.product_catalog_settings to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.product_catalog_settings (
  id,
  donation_note,
  inquiry_note
) values (
  1,
  '수익분기점 달성 이후 수익의 10%를 기부합니다. 기부 소식은 추후 생성될 자사 홈페이지 채널을 통해 전달합니다.',
  '결제 시스템과 장바구니 기능은 준비 중에 있으니 관련 문의는 홈페이지 하단 Instagram 또는 Email을 이용해 주세요. 감사합니다.'
)
on conflict (id) do nothing;

insert into public.products (
  id,
  slug,
  badge,
  name,
  price_krw,
  image_url,
  alt_text,
  description,
  sort_order,
  is_published
) values
(
  '00000000-0000-4000-8000-000000000001',
  'basic-ballpoint',
  '베이직',
  '볼펜',
  1400,
  '/images/products/basic-ballpoint.webp',
  '검정, 초록, 파랑, 버건디 색상의 HOPE 로고 볼펜 네 자루',
  '일상에서 가볍게 꺼내 쓰기 좋은 HOPE 베이직 볼펜입니다.',
  10,
  true
),
(
  '00000000-0000-4000-8000-000000000002',
  'limited-mother-of-pearl-fountain-pen',
  '한정판',
  '자개 만년필',
  80000,
  '/images/products/limited-fountain-pen.webp',
  '검은색 바디와 금색 펜촉으로 구성된 HOPE 한정판 자개 만년필',
  '깊은 광택과 섬세한 디테일을 담은 HOPE 한정판 자개 만년필입니다.',
  20,
  true
)
on conflict (slug) do update set
  badge = excluded.badge,
  name = excluded.name,
  price_krw = excluded.price_krw,
  image_url = excluded.image_url,
  alt_text = excluded.alt_text,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published;

commit;
