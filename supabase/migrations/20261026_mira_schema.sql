-- ==============================================================
-- MIRA AI COMPANION DATABASE SCHEMA
-- ==============================================================

-- 1. Memories Table (Facts, Preferences, and User Knowledge)
create table if not exists public.memories (
  id uuid default gen_random_uuid() primary key,
  user_id text not null default 'default_user',
  category text not null default 'general',
  fact text not null,
  importance int default 3,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create index if not exists idx_memories_user_id on public.memories(user_id);
create index if not exists idx_memories_category on public.memories(category);

-- 2. Conversations Table (Dialogue Sessions)
create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id text not null default 'default_user',
  summary text,
  started_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Messages Table (Individual chat/voice transcripts)
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Avatar Customizations Table (Appearance and Dressing State)
create table if not exists public.avatar_customizations (
  user_id text primary key default 'default_user',
  skin_tone text default '#f5c3a6',
  eye_color text default '#3b82f6',
  outfit_color text default '#1e293b',
  show_outer_suit boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.memories enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.avatar_customizations enable row level security;

-- Public development policies (allows anon key full access for single-user desktop setup)
create policy "Allow all access to memories" on public.memories for all using (true) with check (true);
create policy "Allow all access to conversations" on public.conversations for all using (true) with check (true);
create policy "Allow all access to messages" on public.messages for all using (true) with check (true);
create policy "Allow all access to avatar_customizations" on public.avatar_customizations for all using (true) with check (true);

-- Seed Initial Default Memories for Mira
insert into public.memories (user_id, category, fact, importance)
values
  ('default_user', 'personal', 'Mira is your AI companion and friendly talking assistant.', 5),
  ('default_user', 'preference', 'Enjoys warm, natural, and thoughtful conversations.', 4)
on conflict do nothing;
