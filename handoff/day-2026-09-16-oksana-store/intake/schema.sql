-- operator.db — хранилище оператора (OPERATOR-SPEC §3). node:sqlite, WAL: UI читает, пока operator.mjs пишет.
pragma journal_mode = WAL;
pragma synchronous = NORMAL;

create table if not exists prompts (
  id text primary key, ts text not null, text text not null, source text,
  usage text, parse text, seconds real
);

create table if not exists records (
  id text primary key, prompt_id text not null, ts text not null,
  kind text not null, area text, title text, ivan text,
  goal text, acceptance text, priority integer, live integer,
  refs text, refs_missing text, dup text, competitors text, notes text,
  status text not null, start_level text, verdict_ivan text, intake_id text
);
create index if not exists records_prompt on records(prompt_id);

create table if not exists answers (
  id text primary key, record_id text not null, level text not null, ts text not null,
  doc_path text, sources text, gate text, usage text, seconds real
);
create index if not exists answers_record on answers(record_id);

create table if not exists escalations (
  id integer primary key autoincrement, record_id text not null,
  from_level text, to_level text, ts text, reason text
);

create table if not exists corpus (
  path text primary key, mtime integer, size integer, kind text, title text,
  rows integer, indexed_at text
);

create virtual table if not exists corpus_fts using fts5(path, heading, body, tokenize="trigram");
