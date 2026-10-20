-- Supabase advisor: function_search_path_mutable. Both trigger functions already use
-- schema-qualified names, so pinning an empty search_path changes no behaviour.
ALTER FUNCTION public.nolt_prevent_locked_pack_mutation() SET search_path = '';
ALTER FUNCTION public.nolt_prevent_locked_pack_item() SET search_path = '';
