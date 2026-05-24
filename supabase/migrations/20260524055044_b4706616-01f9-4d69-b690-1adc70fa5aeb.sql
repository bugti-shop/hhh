
-- Tighten RLS on sensitive tables

-- subscriptions: remove public read (only edge functions use service role)
DROP POLICY IF EXISTS "Public can read subscriptions by email" ON public.subscriptions;
CREATE POLICY "No direct read access to subscriptions"
  ON public.subscriptions FOR SELECT
  USING (false);

-- onboarding_responses: remove broad authenticated read (admin uses edge function with service role)
DROP POLICY IF EXISTS "Anyone can read onboarding responses" ON public.onboarding_responses;
CREATE POLICY "No direct read access to onboarding responses"
  ON public.onboarding_responses FOR SELECT
  USING (false);

-- user_entitlements: restrict reads to the owning authenticated user
DROP POLICY IF EXISTS "Public can read entitlements" ON public.user_entitlements;
CREATE POLICY "Users can read their own entitlement"
  ON public.user_entitlements FOR SELECT
  TO authenticated
  USING (
    app_user_id = auth.uid()::text
    OR app_user_id = (auth.jwt() ->> 'email')
  );

-- user_daily_ai_usage: lock down anonymous access; only owner (by auth uid or email) may read/insert/update
DROP POLICY IF EXISTS "Anyone can read daily AI usage" ON public.user_daily_ai_usage;
DROP POLICY IF EXISTS "Anyone can insert daily AI usage" ON public.user_daily_ai_usage;
DROP POLICY IF EXISTS "Anyone can update daily AI usage" ON public.user_daily_ai_usage;

CREATE POLICY "Users can read their own AI usage"
  ON public.user_daily_ai_usage FOR SELECT
  TO authenticated
  USING (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  );

CREATE POLICY "Users can insert their own AI usage"
  ON public.user_daily_ai_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  );

CREATE POLICY "Users can update their own AI usage"
  ON public.user_daily_ai_usage FOR UPDATE
  TO authenticated
  USING (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  )
  WITH CHECK (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  );

-- user_lifetime_counters: same pattern
DROP POLICY IF EXISTS "Anyone can read lifetime counters" ON public.user_lifetime_counters;
DROP POLICY IF EXISTS "Anyone can insert lifetime counters" ON public.user_lifetime_counters;
DROP POLICY IF EXISTS "Anyone can update lifetime counters" ON public.user_lifetime_counters;

CREATE POLICY "Users can read their own lifetime counters"
  ON public.user_lifetime_counters FOR SELECT
  TO authenticated
  USING (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  );

CREATE POLICY "Users can insert their own lifetime counters"
  ON public.user_lifetime_counters FOR INSERT
  TO authenticated
  WITH CHECK (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  );

CREATE POLICY "Users can update their own lifetime counters"
  ON public.user_lifetime_counters FOR UPDATE
  TO authenticated
  USING (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  )
  WITH CHECK (
    (identifier_type = 'email' AND identifier = (auth.jwt() ->> 'email'))
    OR (identifier_type = 'user' AND identifier = auth.uid()::text)
  );
