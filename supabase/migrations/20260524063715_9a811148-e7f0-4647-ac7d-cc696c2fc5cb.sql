
DROP POLICY IF EXISTS "Users can insert their own AI usage" ON public.user_daily_ai_usage;
DROP POLICY IF EXISTS "Users can update their own AI usage" ON public.user_daily_ai_usage;

DROP POLICY IF EXISTS "Users can insert their own lifetime counters" ON public.user_lifetime_counters;
DROP POLICY IF EXISTS "Users can update their own lifetime counters" ON public.user_lifetime_counters;
