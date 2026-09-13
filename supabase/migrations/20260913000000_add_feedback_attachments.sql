begin;

create table public.feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid references public.lesson_feedback(id) on delete set null,
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  uploaded_by_owner boolean not null default false,
  client_request_id uuid not null,
  sort_order smallint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  orphaned_at timestamptz,
  constraint feedback_attachments_feedback_request_unique
    unique (feedback_id, client_request_id),
  constraint feedback_attachments_file_name_valid
    check (
      length(original_file_name) between 1 and 255
      and original_file_name !~ '[\\/[:cntrl:]]'
    ),
  constraint feedback_attachments_mime_type_valid
    check (mime_type in (
      'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
      'audio/wav', 'audio/x-wav', 'audio/webm'
    )),
  constraint feedback_attachments_size_valid
    check (
      size_bytes > 0
      and size_bytes <= case
        when mime_type like 'image/%' then 10 * 1024 * 1024
        else 100 * 1024 * 1024
      end
    ),
  constraint feedback_attachments_sort_order_valid
    check (sort_order between 0 and 4),
  constraint feedback_attachments_status_valid
    check (status in ('pending', 'ready', 'failed', 'deleting', 'orphaned')),
  constraint feedback_attachments_uploader_valid
    check (
      (uploaded_by_owner and uploaded_by_staff_id is null)
      or (not uploaded_by_owner and uploaded_by_staff_id is not null)
    ),
  constraint feedback_attachments_lifecycle_valid
    check (
      (status = 'ready' and ready_at is not null and feedback_id is not null and orphaned_at is null)
      or (status in ('pending', 'failed', 'deleting') and feedback_id is not null and orphaned_at is null)
      or (status = 'orphaned' and feedback_id is null and orphaned_at is not null)
    )
);

create index feedback_attachments_feedback_ready_idx
  on public.feedback_attachments(feedback_id, sort_order, created_at)
  where status = 'ready';
create index feedback_attachments_pending_idx
  on public.feedback_attachments(created_at)
  where status = 'pending';

alter table public.feedback_attachments enable row level security;
alter table public.feedback_attachments force row level security;

create or replace function private.can_mutate_feedback_attachment(
  target_feedback_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lesson_feedback feedback
    where feedback.id = target_feedback_id
      and feedback.deleted_at is null
      and (
        private.is_owner()
        or (
          private.current_operator_access_level() = 'staff'
          and private.is_assigned_staff(feedback.lesson_id)
          and (
            feedback.created_by = auth.uid()
            or feedback.author_staff_id = private.current_staff_id()
          )
        )
      )
  );
$$;

create or replace function private.can_view_feedback_attachment(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.feedback_attachments attachment
    join public.lesson_feedback feedback on feedback.id = attachment.feedback_id
    where attachment.storage_path = target_storage_path
      and attachment.status = 'ready'
      and feedback.deleted_at is null
      and (
        private.is_active_operator()
        or private.student_can_view_feedback(feedback.id)
      )
  );
$$;

create or replace function private.can_upload_feedback_attachment(
  target_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.feedback_attachments attachment
    where attachment.storage_path = target_storage_path
      and attachment.status = 'pending'
      and attachment.created_at > now() - interval '1 hour'
      and private.can_mutate_feedback_attachment(attachment.feedback_id)
      and (
        (private.is_owner() and attachment.uploaded_by_owner)
        or attachment.uploaded_by_staff_id = private.current_staff_id()
      )
  );
$$;

create or replace function private.can_delete_feedback_attachment_object(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.feedback_attachments attachment
    where attachment.storage_path = target_storage_path
      and attachment.status in ('pending', 'failed', 'deleting')
      and private.can_mutate_feedback_attachment(attachment.feedback_id)
  );
$$;

create policy feedback_attachments_operator_select
on public.feedback_attachments for select to authenticated
using (
  status = 'ready'
  and feedback_id is not null
  and private.is_active_operator()
  and exists (
    select 1 from public.lesson_feedback feedback
    where feedback.id = feedback_attachments.feedback_id
      and feedback.deleted_at is null
  )
);

create policy feedback_attachments_student_select
on public.feedback_attachments for select to authenticated
using (
  status = 'ready'
  and feedback_id is not null
  and private.student_can_view_feedback(feedback_id)
);

revoke all on table public.feedback_attachments from public, anon, authenticated, service_role;
grant select on table public.feedback_attachments to authenticated;

create or replace function public.reserve_feedback_attachment(
  target_feedback_id uuid,
  target_original_file_name text,
  target_mime_type text,
  target_size_bytes bigint,
  target_client_request_id uuid
)
returns table (
  attachment_id uuid,
  storage_path text,
  original_file_name text,
  mime_type text,
  size_bytes bigint,
  sort_order smallint,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  feedback public.lesson_feedback%rowtype;
  normalized_name text := btrim(target_original_file_name);
  normalized_mime text := lower(btrim(target_mime_type));
  file_extension text;
  actor_level text := private.current_operator_access_level();
  actor_staff_id uuid := private.current_staff_id();
  existing_attachment public.feedback_attachments%rowtype;
  reserved_attachment public.feedback_attachments%rowtype;
  active_count integer;
  active_total bigint;
  next_sort_order smallint;
begin
  if actor_level is null or actor_level not in ('owner', 'staff') then
    raise exception 'Active operator access is required.' using errcode = '42501';
  end if;
  if target_feedback_id is null or target_client_request_id is null then
    raise exception 'Attachment request is invalid.' using errcode = '22023';
  end if;

  select * into feedback
  from public.lesson_feedback
  where id = target_feedback_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Feedback is unavailable.' using errcode = 'P0002';
  end if;
  if actor_level = 'staff' and not (
    private.is_assigned_staff(feedback.lesson_id)
    and (feedback.created_by = auth.uid() or feedback.author_staff_id = actor_staff_id)
  ) then
    raise exception 'Feedback attachment mutation is not allowed.' using errcode = '42501';
  end if;

  if length(normalized_name) not between 1 and 255
     or normalized_name ~ '[\\/[:cntrl:]]' then
    raise exception 'File name is invalid.' using errcode = '23514';
  end if;
  file_extension := substring(lower(normalized_name) from '\.([a-z0-9]+)$');
  if file_extension is null or not (
    (normalized_mime = 'image/jpeg' and file_extension in ('jpg', 'jpeg'))
    or (normalized_mime = 'image/png' and file_extension = 'png')
    or (normalized_mime = 'image/webp' and file_extension = 'webp')
    or (normalized_mime = 'audio/mpeg' and file_extension = 'mp3')
    or (normalized_mime in ('audio/mp4', 'audio/x-m4a') and file_extension = 'm4a')
    or (normalized_mime in ('audio/wav', 'audio/x-wav') and file_extension = 'wav')
    or (normalized_mime = 'audio/webm' and file_extension = 'webm')
  ) then
    raise exception 'File type is not allowed.' using errcode = '23514';
  end if;
  if target_size_bytes <= 0
     or (normalized_mime like 'image/%' and target_size_bytes > 10 * 1024 * 1024)
     or (normalized_mime like 'audio/%' and target_size_bytes > 100 * 1024 * 1024) then
    raise exception 'File size is not allowed.' using errcode = '23514';
  end if;

  select * into existing_attachment
  from public.feedback_attachments attachment
  where attachment.feedback_id = target_feedback_id
    and attachment.client_request_id = target_client_request_id;
  if found then
    if existing_attachment.original_file_name <> normalized_name
       or existing_attachment.mime_type <> normalized_mime
       or existing_attachment.size_bytes <> target_size_bytes then
      raise exception 'Attachment request ID is already in use.' using errcode = '23505';
    end if;
    return query select
      existing_attachment.id,
      existing_attachment.storage_path,
      existing_attachment.original_file_name,
      existing_attachment.mime_type,
      existing_attachment.size_bytes,
      existing_attachment.sort_order,
      existing_attachment.status;
    return;
  end if;

  update public.feedback_attachments attachment
  set status = 'failed'
  where attachment.feedback_id = target_feedback_id
    and attachment.status = 'pending'
    and attachment.created_at <= now() - interval '1 hour';

  select count(*), coalesce(sum(attachment.size_bytes), 0)
  into active_count, active_total
  from public.feedback_attachments attachment
  where attachment.feedback_id = target_feedback_id
    and attachment.status in ('pending', 'ready', 'deleting');

  if active_count >= 5 then
    raise exception 'A feedback can have at most five attachments.' using errcode = '23514';
  end if;
  if active_total + target_size_bytes > 150 * 1024 * 1024 then
    raise exception 'Feedback attachments exceed the total size limit.' using errcode = '23514';
  end if;

  select candidate::smallint into next_sort_order
  from generate_series(0, 4) candidate
  where not exists (
    select 1
    from public.feedback_attachments attachment
    where attachment.feedback_id = target_feedback_id
      and attachment.status in ('pending', 'ready', 'deleting')
      and attachment.sort_order = candidate
  )
  order by candidate
  limit 1;

  insert into public.feedback_attachments (
    feedback_id,
    storage_path,
    original_file_name,
    mime_type,
    size_bytes,
    uploaded_by_staff_id,
    uploaded_by_owner,
    client_request_id,
    sort_order
  ) values (
    target_feedback_id,
    target_feedback_id::text || '/' || gen_random_uuid()::text,
    normalized_name,
    normalized_mime,
    target_size_bytes,
    case when actor_level = 'staff' then actor_staff_id else null end,
    actor_level = 'owner',
    target_client_request_id,
    next_sort_order
  ) returning * into reserved_attachment;

  return query select
    reserved_attachment.id,
    reserved_attachment.storage_path,
    reserved_attachment.original_file_name,
    reserved_attachment.mime_type,
    reserved_attachment.size_bytes,
    reserved_attachment.sort_order,
    reserved_attachment.status;
end;
$$;

create or replace function public.finalize_feedback_attachment(target_attachment_id uuid)
returns table (
  attachment_id uuid,
  feedback_id uuid,
  original_file_name text,
  mime_type text,
  size_bytes bigint,
  sort_order smallint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  attachment public.feedback_attachments%rowtype;
  object_metadata jsonb;
  actual_mime text;
  actual_size bigint;
begin
  select * into attachment
  from public.feedback_attachments
  where id = target_attachment_id
  for update;
  if not found or attachment.status <> 'pending'
     or not private.can_mutate_feedback_attachment(attachment.feedback_id) then
    raise exception 'Attachment cannot be finalized.' using errcode = '42501';
  end if;

  select objects.metadata into object_metadata
  from storage.objects objects
  where objects.bucket_id = 'feedback-attachments'
    and objects.name = attachment.storage_path;
  if not found then
    raise exception 'Uploaded object was not found.' using errcode = 'P0002';
  end if;

  actual_mime := lower(coalesce(object_metadata ->> 'mimetype', ''));
  if coalesce(object_metadata ->> 'size', '') !~ '^[0-9]+$' then
    raise exception 'Uploaded object size is invalid.' using errcode = '23514';
  end if;
  actual_size := (object_metadata ->> 'size')::bigint;
  if actual_mime <> attachment.mime_type or actual_size <> attachment.size_bytes then
    raise exception 'Uploaded object metadata does not match the reservation.' using errcode = '23514';
  end if;

  update public.feedback_attachments
  set status = 'ready', ready_at = now()
  where id = attachment.id
  returning * into attachment;

  return query select
    attachment.id,
    attachment.feedback_id,
    attachment.original_file_name,
    attachment.mime_type,
    attachment.size_bytes,
    attachment.sort_order,
    attachment.created_at;
end;
$$;

create or replace function public.fail_feedback_attachment(target_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare attachment public.feedback_attachments%rowtype;
begin
  select * into attachment
  from public.feedback_attachments
  where id = target_attachment_id
  for update;
  if not found or attachment.status not in ('pending', 'failed')
     or not private.can_mutate_feedback_attachment(attachment.feedback_id) then
    raise exception 'Attachment cannot be failed.' using errcode = '42501';
  end if;
  update public.feedback_attachments set status = 'failed' where id = attachment.id;
  return attachment.storage_path;
end;
$$;

create or replace function public.begin_delete_feedback_attachment(target_attachment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare attachment public.feedback_attachments%rowtype;
begin
  select * into attachment
  from public.feedback_attachments
  where id = target_attachment_id
  for update;
  if not found or attachment.status <> 'ready'
     or not private.can_mutate_feedback_attachment(attachment.feedback_id) then
    raise exception 'Attachment cannot be deleted.' using errcode = '42501';
  end if;
  update public.feedback_attachments set status = 'deleting' where id = attachment.id;
  return attachment.storage_path;
end;
$$;

create or replace function public.cancel_delete_feedback_attachment(target_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare attachment public.feedback_attachments%rowtype;
begin
  select * into attachment
  from public.feedback_attachments
  where id = target_attachment_id
  for update;
  if not found or attachment.status <> 'deleting'
     or not private.can_mutate_feedback_attachment(attachment.feedback_id) then
    raise exception 'Attachment deletion cannot be cancelled.' using errcode = '42501';
  end if;
  update public.feedback_attachments set status = 'ready' where id = attachment.id;
end;
$$;

create or replace function public.finish_delete_feedback_attachment(target_attachment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare attachment public.feedback_attachments%rowtype;
begin
  select * into attachment
  from public.feedback_attachments
  where id = target_attachment_id
  for update;
  if not found or attachment.status <> 'deleting'
     or not private.can_mutate_feedback_attachment(attachment.feedback_id) then
    raise exception 'Attachment deletion cannot be completed.' using errcode = '42501';
  end if;
  delete from public.feedback_attachments where id = attachment.id;
  return attachment.id;
end;
$$;

create or replace function public.orphan_feedback_attachments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.feedback_id is not null and new.feedback_id is null then
    new.status = 'orphaned';
    new.original_file_name = 'removed';
    new.ready_at = null;
    new.orphaned_at = now();
  end if;
  return new;
end;
$$;

create trigger feedback_attachments_orphan_on_feedback_delete
before update of feedback_id on public.feedback_attachments
for each row execute function public.orphan_feedback_attachments();

revoke all on function private.can_mutate_feedback_attachment(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_view_feedback_attachment(text)
  from public, anon, authenticated, service_role;
revoke all on function private.can_upload_feedback_attachment(text)
  from public, anon, authenticated, service_role;
revoke all on function private.can_delete_feedback_attachment_object(text)
  from public, anon, authenticated, service_role;
grant execute on function private.can_view_feedback_attachment(text) to authenticated;
grant execute on function private.can_upload_feedback_attachment(text) to authenticated;
grant execute on function private.can_delete_feedback_attachment_object(text) to authenticated;

revoke all on function public.reserve_feedback_attachment(uuid, text, text, bigint, uuid)
  from public, anon, service_role;
revoke all on function public.finalize_feedback_attachment(uuid)
  from public, anon, service_role;
revoke all on function public.fail_feedback_attachment(uuid)
  from public, anon, service_role;
revoke all on function public.begin_delete_feedback_attachment(uuid)
  from public, anon, service_role;
revoke all on function public.cancel_delete_feedback_attachment(uuid)
  from public, anon, service_role;
revoke all on function public.finish_delete_feedback_attachment(uuid)
  from public, anon, service_role;
grant execute on function public.reserve_feedback_attachment(uuid, text, text, bigint, uuid) to authenticated;
grant execute on function public.finalize_feedback_attachment(uuid) to authenticated;
grant execute on function public.fail_feedback_attachment(uuid) to authenticated;
grant execute on function public.begin_delete_feedback_attachment(uuid) to authenticated;
grant execute on function public.cancel_delete_feedback_attachment(uuid) to authenticated;
grant execute on function public.finish_delete_feedback_attachment(uuid) to authenticated;
revoke all on function public.orphan_feedback_attachments()
  from public, anon, authenticated, service_role;

do $$
declare existing_bucket storage.buckets%rowtype;
begin
  select * into existing_bucket
  from storage.buckets
  where id = 'feedback-attachments';

  if found then
    if existing_bucket.public
       or existing_bucket.file_size_limit is distinct from 100 * 1024 * 1024
       or existing_bucket.allowed_mime_types is distinct from array[
         'image/jpeg', 'image/png', 'image/webp',
         'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
         'audio/wav', 'audio/x-wav', 'audio/webm'
       ]::text[] then
      raise exception 'Existing feedback-attachments bucket configuration conflicts with this migration.';
    end if;
  else
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) values (
      'feedback-attachments',
      'feedback-attachments',
      false,
      100 * 1024 * 1024,
      array[
        'image/jpeg', 'image/png', 'image/webp',
        'audio/mpeg', 'audio/mp4', 'audio/x-m4a',
        'audio/wav', 'audio/x-wav', 'audio/webm'
      ]::text[]
    );
  end if;
end;
$$;

create policy feedback_attachments_object_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'feedback-attachments'
  and private.can_upload_feedback_attachment(name)
);

create policy feedback_attachments_object_select
on storage.objects for select to authenticated
using (
  bucket_id = 'feedback-attachments'
  and private.can_view_feedback_attachment(name)
);

create policy feedback_attachments_object_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'feedback-attachments'
  and private.can_delete_feedback_attachment_object(name)
);

commit;
