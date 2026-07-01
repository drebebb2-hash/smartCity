-- Jalankan file ini di Supabase SQL Editor.
-- Ini membuat RPC yang dipanggil Node.js:
-- public.update_report_status_with_history(p_report_id, p_status, p_note)

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

drop function if exists public.update_report_status_with_history(uuid, text, text);
drop function if exists public.update_report_status_with_history(uuid, text, text, text);

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

grant execute on function public.update_report_status_with_history(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
