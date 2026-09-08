-- Lock the Sales OS tables behind row-level security.
--
-- DO NOT RUN THIS YET. It will take production down until the prerequisite
-- below is done, because the app currently authenticates to Postgres as `anon`
-- and these policies are the only reason that works.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- `sales_calls`, `leads` and `sales_call_intel` each have RLS enabled with a
-- policy of `using (true) with check (true)` granted to `public`. That means
-- RLS provides no protection at all: any holder of the anon key has full read
-- and write access to every lead, call and client record.
--
-- Today that key never reaches a browser — nothing client-side references it,
-- and tests/supabase-key-exposure.test.mjs keeps it that way. So this is
-- defence in depth, not an open door. But the key is named with a NEXT_PUBLIC_
-- prefix, so a single careless import in a client component would publish it,
-- and at that moment the open policy becomes the whole problem.
--
-- ---------------------------------------------------------------------------
-- Prerequisite (Andrew)
-- ---------------------------------------------------------------------------
-- 1. Supabase dashboard → Project Settings → API → copy the `service_role` key
--    for project ewbdnypcdrupbwjqbrpw.
-- 2. Set SUPABASE_CALLS_SERVICE_KEY to that value in Vercel (Production,
--    Preview and Development) and in ~/Projects/sales-dashboard/.env.local.
--    It is currently an `anon` key, despite the name.
-- 3. Redeploy, and confirm the app still reads and writes normally. The server
--    is then authenticating as service_role, which bypasses RLS entirely.
-- 4. Only then run this file.
--
-- Verify the key really is service_role before step 4:
--   node -e "console.log(JSON.parse(Buffer.from(process.env.SUPABASE_CALLS_SERVICE_KEY.split('.')[1],'base64')).role)"
-- It must print `service_role`. If it prints `anon`, stop.
--
-- ---------------------------------------------------------------------------
-- The change
-- ---------------------------------------------------------------------------
begin;

drop policy if exists "allow_all" on public.sales_calls;
drop policy if exists "Service role full access" on public.leads;
drop policy if exists "allow_all" on public.sales_call_intel;

-- RLS stays enabled with no policy, which denies anon and authenticated
-- outright. service_role bypasses RLS, so the app is unaffected.
alter table public.sales_calls enable row level security;
alter table public.leads enable row level security;
alter table public.sales_call_intel enable row level security;

-- `settings` has RLS switched off entirely, so a policy alone would not help.
alter table public.settings enable row level security;

commit;

-- ---------------------------------------------------------------------------
-- Rollback, if the app breaks
-- ---------------------------------------------------------------------------
-- begin;
--   create policy "allow_all" on public.sales_calls for all using (true) with check (true);
--   create policy "Service role full access" on public.leads for all using (true) with check (true);
--   create policy "allow_all" on public.sales_call_intel for all using (true) with check (true);
--   alter table public.settings disable row level security;
-- commit;
