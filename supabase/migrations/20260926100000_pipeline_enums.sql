-- SUN MEDIA — full production pipeline and shooting attendance states.
-- Enum values are added in their own migration: a new value cannot be used in the same
-- transaction that creates it, and later migrations reference them in functions.

-- IDEA → SCRIPT → READY_FOR_SHOOT → SHOOTING → SHOT → EDITING → INTERNAL_REVIEW → CLIENT_REVIEW
-- → REVISION → APPROVED → SCHEDULED → PUBLISHED (CANCELLED from anywhere)
alter type public.content_status add value if not exists 'ready_for_shoot' after 'script';
alter type public.content_status add value if not exists 'shot' after 'shooting';

-- Shooting attendance: ARRIVED / ABSENT / LATE / EXCUSED (pending = not marked yet)
alter type public.shooting_attendance_status add value if not exists 'excused' after 'absent';
