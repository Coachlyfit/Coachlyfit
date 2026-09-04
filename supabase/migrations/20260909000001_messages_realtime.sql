-- Adds messages to Supabase's realtime publication so postgres_changes
-- subscriptions can fire on insert -- nothing was in supabase_realtime
-- before this (message-thread.tsx has always polled). RLS still applies
-- to realtime the same way it applies to a regular select: a subscriber
-- only receives change events for rows their own session could read
-- (messages' coach_rw/client_rw policies), so this adds live delivery
-- without loosening who can see what.
alter publication supabase_realtime add table public.messages;
