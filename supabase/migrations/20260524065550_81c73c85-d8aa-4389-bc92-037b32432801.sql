
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage_if_under_limit(text,text,text,date,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_ai_usage(text,text,text,date) FROM PUBLIC, anon, authenticated;
