create table if not exists public.round_history (
  round_id bigint primary key,
  winner text not null,
  amount double precision not null,
  timestamp bigint not null,
  tx_hash text unique
);

create index if not exists round_history_timestamp_idx
  on public.round_history (timestamp desc);
