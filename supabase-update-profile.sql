-- Run this once in Supabase: SQL Editor > New query > paste > Run
-- (You already ran supabase-setup.sql. This only adds the profile + verification parts.)

alter table profiles
  add column if not exists full_name text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists id_type text,
  add column if not exists id_number text,
  add column if not exists id_photo text,
  add column if not exists verification text not null default 'unverified',
  add column if not exists submitted_at timestamptz;

-- Customers send their details through this function. They cannot set their own
-- verification status or role: the status always becomes 'pending' for the admin to check.
create or replace function submit_profile(
  p_name text, p_address text, p_phone text, p_id_type text, p_id_number text, p_id_photo text
) returns void language sql security definer set search_path = public as $$
  update profiles set
    full_name = p_name, address = p_address, phone = nullif(p_phone, ''),
    id_type = p_id_type, id_number = p_id_number,
    id_photo = coalesce(nullif(p_id_photo, ''), id_photo),
    verification = 'pending', submitted_at = now()
  where id = auth.uid();
$$;

-- Only admins can verify or reject.
create or replace function set_verification(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('verified', 'rejected', 'pending', 'unverified') then raise exception 'Bad status'; end if;
  update profiles set verification = p_status where id = p_user;
end $$;

-- Private storage for ID photos (not public: customers see only their own, admins see all)
insert into storage.buckets (id, name, public) values ('id-documents', 'id-documents', false)
  on conflict (id) do nothing;
create policy "customer uploads own id" on storage.objects for insert
  with check (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own id or admin" on storage.objects for select
  using (bucket_id = 'id-documents' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
