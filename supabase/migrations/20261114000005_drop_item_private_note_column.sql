-- Removes program_items.coach_note_private. Run AFTER 20261114000004 (which
-- copied every note into program_item_notes) and after the app version that
-- reads and writes program_item_notes is deployed: an older build still selects
-- or inserts this column and would fail once it is gone.
--
-- This is the step that actually closes the leak: until the column is dropped, a
-- client calling the API directly can still `select coach_note_private`.
-- Destructive (drops a column), so it is kept separate and not applied
-- automatically.
alter table public.program_items drop column coach_note_private;
