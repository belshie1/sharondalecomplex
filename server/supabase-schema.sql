-- Sharondale board storage on Supabase.
--
-- The app creates this itself on first boot (server/supabase-db.mjs), so this
-- file is only for doing it by hand - or for reviewing exactly what is created.
-- Run it in the Supabase dashboard: SQL Editor -> New query -> Run.
--
-- Because the backend talks to Postgres with its own credentials, Row Level
-- Security must be ON and have no permissive policy: then the anon/public keys
-- can read nothing, and only the service_role key (held by the server, never by
-- the browser) can see or change the board. That is the same rule as the access
-- code: the public API of this database is your own /api, not Supabase's.

create table if not exists public.sharondale_board (
  id         text primary key,
  board      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.sharondale_board enable row level security;

-- Deliberately no policy for anon or authenticated: no browser key may read the
-- board. The service_role key bypasses RLS, which is how the server works.

-- The board row is created by the server on first boot; this is here so a
-- manual setup ends in a usable state rather than an empty table.
insert into public.sharondale_board (id, board)
values ('sharondale', '{"tasks":[],"complaints":[],"shopping":[],"recurring":[],"people":[],"phonebook":[],"requests":[]}'::jsonb)
on conflict (id) do nothing;
