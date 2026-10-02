-- ============================================================================
-- Staging column for AI-extracted action items.
--
-- Claude's action-item extraction returns free-text assignee names and
-- relative deadlines ("by next Thursday") — tasks.assignee_id is a uuid and
-- tasks.deadline is a date, so these can't be inserted as task rows without
-- fabricating a name match or parsing a relative date, either of which is a
-- real risk on a governance record. Stage the raw extraction here instead;
-- a secretary resolves each item to a real assignee/deadline before it
-- becomes a tasks row (see src/lib/types/domain.ts's ExtractedActionItem
-- comment: "before it becomes a task row"). UI for that resolution step is
-- Phase 6, not part of this migration.
-- ============================================================================

alter table minutes
  add column ai_action_items jsonb not null default '[]'::jsonb;
