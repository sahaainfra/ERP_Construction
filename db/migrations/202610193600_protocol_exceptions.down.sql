-- Reverses 202610193600_protocol_exceptions. Drops only the tables that migration created, in dependency order.
DROP TABLE IF EXISTS protocol_exception_consumptions;
DROP TABLE IF EXISTS protocol_config_items;
DROP TABLE IF EXISTS protocol_exceptions;
