-- SUN MEDIA — AI content agent: lower image cost without lowering the bar (lib/agents/cost.ts).
--
--   * agent_profiles.cost_mode: economy | balanced (default) | premium — where each frame's background comes from
--     (brand template, the post's own picture re-framed, or a new AI picture). Existing clients move to balanced.
--   * agent_settings: max_images_per_item (paid pictures one post may use, regenerations and edits included),
--     max_job_cost_usd (estimated cost one job may reach without the admin's approval), daily_budget_usd.
--   * agent_items.allow_over_budget: the admin's explicit "make it anyway" for one post that hit a limit.
--   * app_settings 'assistant.pricing': OpenAI list prices for Sunny's models (developers.openai.com/api/docs/pricing,
--     2026-11-13), added only where the owner has not set a price — the owner's own values always win.

alter table public.agent_profiles
  add column if not exists cost_mode text not null default 'balanced' check (cost_mode in ('economy', 'balanced', 'premium'));

alter table public.agent_settings
  add column if not exists max_images_per_item integer not null default 8 check (max_images_per_item between 1 and 100),
  add column if not exists max_job_cost_usd numeric(10, 2) check (max_job_cost_usd is null or max_job_cost_usd >= 0),
  add column if not exists daily_budget_usd numeric(10, 2) check (daily_budget_usd is null or daily_budget_usd >= 0);

alter table public.agent_items
  add column if not exists allow_over_budget boolean not null default false;

update public.app_settings
set value = jsonb '{
  "gpt-6-luna": {"input": 0.1, "cached": 0.01, "output": 0.5},
  "gpt-6.1-terra": {"input": 1, "cached": 0.05, "output": 5}
}' || (case when jsonb_typeof(value) = 'object' then value else '{}'::jsonb end)
where key = 'assistant.pricing';
