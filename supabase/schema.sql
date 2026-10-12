-- ════════════════════════════════════════════════════════════════════════════
-- Platewise · Supabase schema
-- Run once in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Tables
--   users        1:1 profile row for each auth.users row (auto-created by trigger)
--   daily_goals  versioned targets: the row with the latest effective_from <= a day applies to that day
--   meals        one row per logged meal, macros estimated by Gemini (or edited by the user)
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Shared helper: keep updated_at fresh ───────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ─── 1. users ───────────────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text,
  display_name    text,
  -- Optional body metrics, used only by the TDEE calculator in the goals screen
  sex             text check (sex in ('male', 'female')),
  age_years       smallint check (age_years between 13 and 120),
  height_cm       numeric(5, 1) check (height_cm between 100 and 250),
  weight_kg       numeric(5, 1) check (weight_kg between 30 and 400),
  activity_level  text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

-- Create the profile row whenever someone signs up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill profiles for accounts that existed before this script ran.
insert into public.users (id, email, display_name)
select id, email, split_part(email, '@', 1)
from auth.users
on conflict (id) do nothing;


-- ─── 2. daily_goals ─────────────────────────────────────────────────────────
create table if not exists public.daily_goals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references public.users (id) on delete cascade,
  -- Targets apply from this (local) date until a newer row supersedes them,
  -- so changing goals mid-week never rewrites how earlier days are scored.
  effective_from       date not null default current_date,
  tdee_kcal            integer not null check (tdee_kcal between 1000 and 6000),
  calorie_target_kcal  integer not null check (calorie_target_kcal between 800 and 6000),
  protein_g            integer not null check (protein_g between 0 and 500),
  carbs_g              integer not null check (carbs_g between 0 and 1000),
  fat_g                integer not null check (fat_g between 0 and 400),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, effective_from)
);

drop trigger if exists daily_goals_touch_updated_at on public.daily_goals;
create trigger daily_goals_touch_updated_at
  before update on public.daily_goals
  for each row execute function public.touch_updated_at();


-- ─── 3. meals ───────────────────────────────────────────────────────────────
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  description  text not null check (char_length(description) between 2 and 500),
  meal_name    text not null check (char_length(meal_name) between 1 and 80),
  meal_type    text not null default 'snack' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  eaten_at     timestamptz not null default now(),
  calories     integer not null check (calories between 0 and 10000),
  protein_g    numeric(6, 1) not null check (protein_g between 0 and 1000),
  carbs_g      numeric(6, 1) not null check (carbs_g between 0 and 2000),
  fat_g        numeric(6, 1) not null check (fat_g between 0 and 1000),
  -- Per-component breakdown returned by Gemini: [{ name, portion, Calories, Protein, Carbs, Fats }]
  items        jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  confidence   text check (confidence in ('low', 'medium', 'high')),
  ai_notes     text,
  ai_model     text,
  source       text not null default 'ai' check (source in ('ai', 'edited')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Scan-from-plate (added later; `add column if not exists` keeps re-runs and upgrades safe).
-- input_type: how the meal was logged. photo_thumb: a tiny (~10 KB) data-URL preview; the
-- full photo is analysed and then discarded, so nothing large is ever stored.
alter table public.meals add column if not exists input_type text not null default 'text';
alter table public.meals add column if not exists photo_thumb text;
alter table public.meals drop constraint if exists meals_input_type_check;
alter table public.meals add constraint meals_input_type_check check (input_type in ('text', 'photo'));
alter table public.meals drop constraint if exists meals_photo_thumb_check;
alter table public.meals add constraint meals_photo_thumb_check
  check (photo_thumb is null or (photo_thumb like 'data:image/%' and char_length(photo_thumb) <= 60000));

create index if not exists meals_user_eaten_at_idx on public.meals (user_id, eaten_at desc);

drop trigger if exists meals_touch_updated_at on public.meals;
create trigger meals_touch_updated_at
  before update on public.meals
  for each row execute function public.touch_updated_at();


-- ─── Row Level Security: every user sees and edits only their own rows ──────
alter table public.users       enable row level security;
alter table public.daily_goals enable row level security;
alter table public.meals       enable row level security;

drop policy if exists "users: read own profile"   on public.users;
drop policy if exists "users: update own profile" on public.users;
create policy "users: read own profile" on public.users
  for select to authenticated using ((select auth.uid()) = id);
create policy "users: update own profile" on public.users
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "daily_goals: owner has full access" on public.daily_goals;
create policy "daily_goals: owner has full access" on public.daily_goals
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "meals: owner has full access" on public.meals;
create policy "meals: owner has full access" on public.meals
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Explicit Data API grants (RLS above still restricts rows). Anonymous visitors get nothing.
revoke all on public.users, public.daily_goals, public.meals from anon;
grant select, update                 on public.users       to authenticated;
grant select, insert, update, delete on public.daily_goals to authenticated;
grant select, insert, update, delete on public.meals       to authenticated;
