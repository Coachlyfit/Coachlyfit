-- Server-side drafts, a real "last updated" and soft delete for form
-- templates. Until now an unpublished edit lived only in the coach's
-- browser (localStorage), so the forms list could not show a draft's
-- question count, a new form could not be created with starter questions
-- without publishing them, and a draft never followed the coach to another
-- device.
--
-- No policy changes: coach_write on form_templates (20260731000007) already
-- covers these columns.
alter table public.form_templates
  -- Same shape as form_template_versions.schema. Null means "nothing
  -- unpublished": publishing clears it.
  add column draft_schema jsonb
    check (draft_schema is null or jsonb_typeof(draft_schema -> 'fields') = 'array'),
  add column updated_at timestamptz not null default now(),
  -- Soft delete, same convention as programs/exercises/diet_plans
  -- (20260910000001). A hard delete is not possible once a template has been
  -- published: its versions are immutable (form_template_versions_immutable
  -- rejects DELETE) and assignments/submissions reference them.
  add column archived_at timestamptz;

update public.form_templates t
set updated_at = coalesce(
  (select max(v.published_at) from public.form_template_versions v where v.template_id = t.id),
  t.created_at
);

create index form_templates_archived_at_idx on public.form_templates (archived_at) where archived_at is not null;
