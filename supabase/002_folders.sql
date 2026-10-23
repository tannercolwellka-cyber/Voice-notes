-- Step 2 update. Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Adds folders to notes. Notes you already have stay where they are, with no folder.

alter table public.notes add column if not exists folder text not null default '';
