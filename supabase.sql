-- Green Room: run this once in Supabase > SQL Editor > New query > Run

create table if not exists public.pitch_reviews (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  visitor_hash      text        not null,          -- SHA-256 of IP + salt, never the raw IP
  audience          text        not null,          -- who the pitch is for
  time_limit_sec    int         not null,          -- 60 or 90
  input_mode        text        not null default 'text', -- 'text' or 'voice'
  word_count        int,
  input             text        not null,          -- the pitch text
  output            jsonb,                         -- full Gemini response (parsed)
  refused           boolean     not null default false,
  score             int,                           -- 1-10, null if refused
  weakness_category text,                          -- fixed list, used for "most common weakness"
  input_tokens      int,
  output_tokens     int,
  model             text
);

create index if not exists pitch_reviews_created_idx on public.pitch_reviews (created_at desc);
create index if not exists pitch_reviews_visitor_idx on public.pitch_reviews (visitor_hash, created_at desc);

-- Lock the table: with RLS on and no policies, only the service key
-- (used inside the Vercel function) can read or write. The browser never talks to Supabase.
alter table public.pitch_reviews enable row level security;
