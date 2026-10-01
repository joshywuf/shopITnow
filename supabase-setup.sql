-- Run this once in Supabase: SQL Editor > New query > paste > Run

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  role text not null default 'customer'
);

create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  price numeric(10,2) not null,
  stock int not null default 0,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists orders (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users,
  user_email text,
  items jsonb not null,
  total numeric(10,2) not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;

-- Helper: is the current user an admin?
create or replace function is_admin() returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- Create a profile automatically when someone signs up
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- profiles: read your own; admins read all (nobody can change roles from the website)
create policy "read own profile" on profiles for select using (id = auth.uid() or is_admin());

-- products: everyone can browse, only admins can change
create policy "anyone can view products" on products for select using (true);
create policy "admin adds products" on products for insert with check (is_admin());
create policy "admin edits products" on products for update using (is_admin());
create policy "admin deletes products" on products for delete using (is_admin());

-- orders: customers create and see their own; admins see and update all
create policy "customer places order" on orders for insert with check (user_id = auth.uid());
create policy "see own orders" on orders for select using (user_id = auth.uid() or is_admin());
create policy "admin updates orders" on orders for update using (is_admin());

-- Image storage (public bucket, only admins can upload/delete)
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
create policy "anyone views images" on storage.objects for select using (bucket_id = 'product-images');
create policy "admin uploads images" on storage.objects for insert with check (bucket_id = 'product-images' and is_admin());
create policy "admin deletes images" on storage.objects for delete using (bucket_id = 'product-images' and is_admin());

-- AFTER you sign up on the website with your own email, make yourself admin:
-- update profiles set role = 'admin' where email = 'YOUR_EMAIL_HERE';
