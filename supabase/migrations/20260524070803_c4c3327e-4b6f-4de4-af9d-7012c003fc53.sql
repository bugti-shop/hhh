
-- Restrict Realtime channel subscriptions: only authenticated users may join
-- their own `entitlement-<uid|email>` private channel.
DROP POLICY IF EXISTS "Users can read their own entitlement realtime channel" ON realtime.messages;
DROP POLICY IF EXISTS "Users can join their own entitlement channel" ON realtime.messages;

CREATE POLICY "Users can join their own entitlement channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'entitlement-' || (auth.uid())::text
  OR realtime.topic() = 'entitlement-' || COALESCE(auth.jwt() ->> 'email', '')
);
