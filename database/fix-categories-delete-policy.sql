-- =========================================================================
-- FIX: Pastikan RLS policy categories untuk DELETE berjalan dengan benar
-- Jalankan file ini di Supabase SQL Editor jika hapus kategori masih gagal.
-- =========================================================================

-- Pastikan fungsi get_current_user_role() menggunakan security definer
-- sehingga bisa membaca tabel profiles tanpa terkena loop RLS
create or replace function public.get_current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role::text
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

-- Pastikan RLS aktif pada tabel categories
alter table public.categories enable row level security;

-- Hapus dan buat ulang semua policy categories
drop policy if exists "Authenticated users can view categories" on public.categories;
create policy "Authenticated users can view categories"
on public.categories
for select
to authenticated
using (true);

drop policy if exists "Admins can create categories" on public.categories;
create policy "Admins can create categories"
on public.categories
for insert
to authenticated
with check (public.get_current_user_role() = 'admin');

drop policy if exists "Admins can update categories" on public.categories;
create policy "Admins can update categories"
on public.categories
for update
to authenticated
using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "Admins can delete categories" on public.categories;
create policy "Admins can delete categories"
on public.categories
for delete
to authenticated
using (public.get_current_user_role() = 'admin');
