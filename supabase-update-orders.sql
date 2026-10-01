-- Run this once in Supabase: SQL Editor > New query > paste > Run
-- Only verified customers (or admins) can place orders. This is enforced in the database,
-- so it cannot be skipped by editing the website code.

drop policy if exists "customer places order" on orders;
create policy "verified customer places order" on orders for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and (verification = 'verified' or role = 'admin'))
  );
