create extension if not exists pgcrypto;

create table if not exists public.drafts (
  id               uuid primary key default gen_random_uuid(),
  owner_account_id text not null,
  mode             text not null default 'single',
  working_title    text,
  payload          jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists drafts_owner_updated_idx
  on public.drafts (owner_account_id, updated_at desc);

-- Enable RLS with NO policies. The server uses the service-role key (which
-- bypasses RLS); all access is mediated by the authenticated API layer. With
-- no policies, a leaked anon/auth key can read nothing.
alter table public.drafts enable row level security;
