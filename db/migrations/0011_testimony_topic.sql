-- 0011_testimony_topic.sql
-- Add nullable topic column to testimonies table.
-- ASCII-only SQL; no CHECK constraint so the picklist can evolve freely.

ALTER TABLE testimonies ADD COLUMN topic TEXT;
