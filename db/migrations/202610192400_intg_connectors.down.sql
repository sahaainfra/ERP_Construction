-- Reverses 202610192400_intg_connectors. Drops only the tables and indexes that migration created.
DROP TABLE IF EXISTS intg_dlq;
DROP TABLE IF EXISTS intg_messages;
DROP TABLE IF EXISTS intg_mappings;
DROP TABLE IF EXISTS intg_credentials_ref;
DROP TABLE IF EXISTS intg_connectors;
