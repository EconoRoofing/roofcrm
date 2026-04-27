-- 045_calendar_event_id_on_followups_and_certs.sql
--
-- Stage 2 of calendar sync: add tracking columns so follow-ups and cert
-- renewals can hold the Google Calendar event ID their lifecycle is bound
-- to. Mirrors the existing `jobs.calendar_event_id` pattern.
--
-- Both columns nullable — existing rows haven't been synced (and won't be
-- backfilled). Only new mutations going forward will populate these.
--
-- No index. Lookup is always by the table's PK; we never query by event ID.

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS calendar_event_id text;

ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS calendar_event_id text;
