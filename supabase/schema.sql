-- Execute uma vez no SQL Editor do seu projeto Supabase.
create table public.members (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 60)
);
create table public.messages (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.members(id) on delete cascade,
 body text not null check (char_length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index messages_created_at on public.messages(created_at);
create function public.is_family_member() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.members where id = (select auth.uid()));
$$;
revoke all on function public.is_family_member() from public;
grant execute on function public.is_family_member() to authenticated;
alter table public.members enable row level security;
alter table public.messages enable row level security;
revoke all on public.members, public.messages from anon, authenticated;
grant select on public.members, public.messages to authenticated;
grant insert (sender_id, body) on public.messages to authenticated;
create policy members_read on public.members for select to authenticated using (public.is_family_member());
create policy messages_read on public.messages for select to authenticated using (public.is_family_member());
create policy messages_send on public.messages for insert to authenticated with check (public.is_family_member() and sender_id = (select auth.uid()));
