-- SUN MEDIA — accounts can be Active, Disabled or Suspended (temporary block, e.g. during an inquiry).
-- Kept in its own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.account_status add value if not exists 'suspended';
