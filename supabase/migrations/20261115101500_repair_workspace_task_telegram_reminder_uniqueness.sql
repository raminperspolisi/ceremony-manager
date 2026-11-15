WITH ranked_reminders AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, user_id, task_id
      ORDER BY created_at DESC, id DESC
    ) AS reminder_rank
  FROM private.workspace_task_telegram_reminders
)
DELETE FROM private.workspace_task_telegram_reminders AS reminder
USING ranked_reminders
WHERE reminder.id = ranked_reminders.id
  AND ranked_reminders.reminder_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_task_telegram_reminders_task_key
  ON private.workspace_task_telegram_reminders (organization_id, user_id, task_id);
