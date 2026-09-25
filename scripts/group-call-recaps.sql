-- Group call recaps: which series a call belongs to, the chapters, the links
-- shared in the chat, and where every recording of it lives.
-- Additive only. Existing rows keep working with the defaults.
alter table public.client_calls
  add column if not exists call_type text,
  add column if not exists starts_at timestamptz,
  add column if not exists highlights jsonb not null default '[]'::jsonb,
  add column if not exists chapters jsonb not null default '[]'::jsonb,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists recordings jsonb not null default '[]'::jsonb,
  add column if not exists spotlights jsonb not null default '[]'::jsonb;

alter table public.client_calls drop constraint if exists client_calls_call_type_check;
alter table public.client_calls add constraint client_calls_call_type_check
  check (call_type is null or call_type in ('laser', 'ai', 'mastermind', 'referral'));

create index if not exists client_calls_call_date_idx on public.client_calls (call_date desc);
