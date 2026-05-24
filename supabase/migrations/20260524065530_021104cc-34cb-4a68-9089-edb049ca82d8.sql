
CREATE OR REPLACE FUNCTION public.increment_ai_usage_if_under_limit(
  p_identifier text,
  p_identifier_type text,
  p_feature text,
  p_usage_date date,
  p_limit integer
)
RETURNS TABLE (allowed boolean, new_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.user_daily_ai_usage AS u
    (identifier, identifier_type, feature, usage_date, count)
  VALUES (p_identifier, p_identifier_type, p_feature, p_usage_date, 1)
  ON CONFLICT (identifier, identifier_type, feature, usage_date)
  DO UPDATE SET
    count = u.count + 1,
    updated_at = now()
  WHERE u.count < p_limit
  RETURNING u.count INTO v_count;

  IF v_count IS NULL THEN
    SELECT u.count INTO v_count FROM public.user_daily_ai_usage u
    WHERE u.identifier = p_identifier
      AND u.identifier_type = p_identifier_type
      AND u.feature = p_feature
      AND u.usage_date = p_usage_date;
    RETURN QUERY SELECT false, COALESCE(v_count, p_limit);
  ELSE
    RETURN QUERY SELECT true, v_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_ai_usage(
  p_identifier text,
  p_identifier_type text,
  p_feature text,
  p_usage_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_daily_ai_usage
  SET count = GREATEST(count - 1, 0),
      updated_at = now()
  WHERE identifier = p_identifier
    AND identifier_type = p_identifier_type
    AND feature = p_feature
    AND usage_date = p_usage_date;
END;
$$;

-- Ensure ON CONFLICT target exists
CREATE UNIQUE INDEX IF NOT EXISTS user_daily_ai_usage_unique_idx
  ON public.user_daily_ai_usage (identifier, identifier_type, feature, usage_date);

REVOKE ALL ON FUNCTION public.increment_ai_usage_if_under_limit(text,text,text,date,integer) FROM public;
REVOKE ALL ON FUNCTION public.decrement_ai_usage(text,text,text,date) FROM public;
