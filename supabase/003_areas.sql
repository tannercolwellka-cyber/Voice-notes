-- Areas update. Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Lets a note belong to several areas, like {Health, Cooking}.

alter table public.notes add column if not exists areas text[] not null default '{}';
