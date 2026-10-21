-- Reverses 202610193200_wf_sla_delegation. Drops only what that migration added.
DROP TABLE IF EXISTS wf_delegations;
ALTER TABLE wf_action_log DROP COLUMN IF EXISTS on_behalf_of;
ALTER TABLE wf_tasks DROP COLUMN IF EXISTS reminded_90;
ALTER TABLE wf_tasks DROP COLUMN IF EXISTS reminded_50;
ALTER TABLE wf_tasks DROP COLUMN IF EXISTS due_at;
ALTER TABLE wf_instances DROP CONSTRAINT IF EXISTS wf_instances_emergency_deadline;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS regularised_by;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS regularised_at;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS emergency_due_at;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS emergency;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS change_summary;
ALTER TABLE wf_instances DROP COLUMN IF EXISTS amendment_of;
