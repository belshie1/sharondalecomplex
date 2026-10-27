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

-- Saving the board over the HTTPS Data API.
--
-- PostgREST merges a jsonb object key by key, so a PATCH that carried only the
-- tasks list deleted nothing else but also replaced nothing else - and a PATCH
-- that carried the whole document next to updated_at was read as a partial
-- update and removed every key the payload did not mention. Either way one
-- screen's save silently discarded another screen's data. The backend calls this
-- function instead: one statement, whatever this project's PostgREST version
-- does, and the whole document replaced as a unit.
create or replace function public.sharondale_save_board(board_id text, payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.sharondale_board (id, board, updated_at)
  values (board_id, payload, now())
  on conflict (id) do update
    set board = excluded.board,
        updated_at = excluded.updated_at;
$$;

-- Only the server (which holds the secret key and bypasses RLS) calls it; a
-- browser holding an anon key must not be able to write the board.
revoke all on function public.sharondale_save_board(text, jsonb) from public, anon, authenticated;
