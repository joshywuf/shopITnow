-- Run this once in Supabase: SQL Editor > New query > paste > Run

-- Delivery details saved on each order
alter table orders
  add column if not exists ship_name text,
  add column if not exists ship_address text,
  add column if not exists ship_phone text;

-- Admins can remove orders
create policy "admin deletes orders" on orders for delete using (is_admin());
