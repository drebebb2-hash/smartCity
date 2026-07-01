-- Jalankan di Supabase SQL Editor jika create report/upload foto terkena error RLS.

alter table public.categories enable row level security;
alter table public.reports enable row level security;
alter table public.report_status_history enable row level security;
alter table public.comments enable row level security;
alter table public.upvotes enable row level security;

create or replace function public.is_staff_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'petugas')
  );
$$;

create or replace function public.update_report_status_with_history(
  p_report_id uuid,
  p_status text,
  p_note text,
  p_notification_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
begin
  if not public.is_staff_user() then
    raise exception 'Only admin or petugas can update report status';
  end if;

  if p_status not in ('pending', 'diproses', 'selesai', 'ditolak') then
    raise exception 'Invalid report status';
  end if;

  select id, user_id, title
  into v_report
  from public.reports
  where id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  update public.reports
  set status = p_status::public.report_status
  where id = p_report_id;

  insert into public.report_status_history (report_id, status, note, changed_by)
  values (p_report_id, p_status::public.report_status, nullif(trim(p_note), ''), auth.uid());

  insert into public.notifications (user_id, report_id, message, is_read)
  values (v_report.user_id, p_report_id, p_notification_message, false);
end;
$$;

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

drop policy if exists "Users can create own reports" on public.reports;
create policy "Users can create own reports"
on public.reports
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can view own reports" on public.reports;
create policy "Users can view own reports"
on public.reports
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Authenticated users can view all reports for map" on public.reports;
create policy "Authenticated users can view all reports for map"
on public.reports
for select
to authenticated
using (true);

drop policy if exists "Staff can view all reports" on public.reports;
create policy "Staff can view all reports"
on public.reports
for select
to authenticated
using (public.get_current_user_role() in ('admin', 'petugas'));

drop policy if exists "Staff can update report status" on public.reports;
create policy "Staff can update report status"
on public.reports
for update
to authenticated
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Admins can assign reports" on public.reports;
create policy "Admins can assign reports"
on public.reports
for update
to authenticated
using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "Users can view own report status history" on public.report_status_history;
create policy "Users can view own report status history"
on public.report_status_history
for select
to authenticated
using (
  exists (
    select 1
    from public.reports
    where reports.id = report_status_history.report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "Authenticated users can view all report status history" on public.report_status_history;
create policy "Authenticated users can view all report status history"
on public.report_status_history
for select
to authenticated
using (true);

drop policy if exists "Staff can view all report status history" on public.report_status_history;
create policy "Staff can view all report status history"
on public.report_status_history
for select
to authenticated
using (public.get_current_user_role() in ('admin', 'petugas'));

drop policy if exists "Staff can create report status history" on public.report_status_history;
create policy "Staff can create report status history"
on public.report_status_history
for insert
to authenticated
with check (
  public.is_staff_user()
  and changed_by = auth.uid()
);

drop policy if exists "Authenticated users can view comments" on public.comments;
create policy "Authenticated users can view comments"
on public.comments
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
on public.comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can view upvotes" on public.upvotes;
create policy "Authenticated users can view upvotes"
on public.upvotes
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can create own upvotes" on public.upvotes;
create policy "Authenticated users can create own upvotes"
on public.upvotes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can delete own upvotes" on public.upvotes;
create policy "Authenticated users can delete own upvotes"
on public.upvotes
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do update
set public = true;

drop policy if exists "Users can upload report photos" on storage.objects;
create policy "Users can upload report photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'report-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Anyone can view report photos" on storage.objects;
create policy "Anyone can view report photos"
on storage.objects
for select
to public
using (bucket_id = 'report-photos');

alter table public.ratings enable row level security;

drop policy if exists "Users can view own ratings" on public.ratings;
create policy "Users can view own ratings"
on public.ratings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can view all ratings" on public.ratings;
create policy "Admins can view all ratings"
on public.ratings
for select
to authenticated
using (public.get_current_user_role() = 'admin');

drop policy if exists "Users can rate completed own reports" on public.ratings;
create policy "Users can rate completed own reports"
on public.ratings
for insert
to authenticated
with check (
  auth.uid() = user_id
  and score between 1 and 5
  and exists (
    select 1
    from public.reports
    where reports.id = ratings.report_id
      and reports.user_id = auth.uid()
      and reports.status = 'selesai'
  )
);
