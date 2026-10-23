-- Run this once in Supabase: SQL Editor > New query > paste > Run.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '',
  body text not null default '',
  source text not null default 'typed',   -- 'voice' or 'typed'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_created on public.notes (user_id, created_at desc);

-- Keep updated_at current on every edit.
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- Only the signed-in owner can see or change their notes.
alter table public.notes enable row level security;

create policy "own notes" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Push changes to every open device in real time.
alter publication supabase_realtime add table public.notes;
