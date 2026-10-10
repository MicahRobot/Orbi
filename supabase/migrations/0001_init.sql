-- Orbi: learner profiles and practice attempts. Paste into the Supabase SQL editor once per project
-- (or run `supabase db push` with the Supabase CLI). Also turn on Authentication → Sign In / Providers →
-- "Allow anonymous sign-ins": learners start practicing without creating an account.
-- Shapes mirror Profile and AttemptRecord in shared/contracts/types.ts.

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  l1 text not null check (l1 in ('en', 'es', 'fr', 'ja', 'ko', 'vi', 'other')),
  calibration jsonb,
  updated_at timestamptz not null default now()
);

create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id text not null,
  passed boolean not null,
  score int not null check (score between 0 and 100),
  issue_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index attempts_user_time on public.attempts (user_id, created_at);

-- Each learner (anonymous users included: they get the authenticated role) sees and writes only their own rows.
alter table public.profiles enable row level security;
alter table public.attempts enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own attempts" on public.attempts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
