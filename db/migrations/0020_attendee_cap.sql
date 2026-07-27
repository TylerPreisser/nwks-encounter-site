-- 0020_attendee_cap.sql
-- Per-event attendee cap: when confirmed attendee registrations reach this limit,
-- the public "Register as an Attendee" flow shows a themed "currently full" notice
-- and the backend rejects further attendee sign-ups. NULL limit = no cap.
-- attendee_full_message is the editable message shown when full.

ALTER TABLE events ADD COLUMN attendee_limit INTEGER;
ALTER TABLE events ADD COLUMN attendee_full_message TEXT;

UPDATE events
SET attendee_full_message = 'This upcoming Encounter is currently full. Please check back soon, or reach out to us to be added to the waitlist.'
WHERE attendee_full_message IS NULL;
