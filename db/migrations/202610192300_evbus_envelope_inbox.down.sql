-- Reverses 202610192300_evbus_envelope_inbox. Drops only what that migration created.
DROP TABLE IF EXISTS evt_inbox;

ALTER TABLE sys.outbox
  DROP COLUMN IF EXISTS aggregate_key,
  DROP COLUMN IF EXISTS correlation_id,
  DROP COLUMN IF EXISTS causation_id;
