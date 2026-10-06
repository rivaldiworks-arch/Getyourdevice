-- Phase 7B: fixed-window API abuse protection for public write/read-by-capability endpoints.
-- One row per bucket + client key keeps storage bounded while atomic UPSERT avoids race conditions.

create table if not exists public.api_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, key_hash),
  constraint api_rate_limits_bucket_check check (bucket ~ '^[a-z0-9:_-]{1,64}$'),
  constraint api_rate_limits_key_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_rate_limits_request_count_check check (request_count >= 0)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_remaining integer;
  v_retry_after integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-z0-9:_-]{1,64}$'
     or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit < 1 or p_limit > 5000
     or p_window_seconds is null or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception using message='INVALID_RATE_LIMIT_ARGUMENTS', errcode='22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits as limits (
    bucket, key_hash, window_start, request_count, updated_at
  ) values (
    p_bucket, p_key_hash, v_window_start, 1, v_now
  )
  on conflict (bucket, key_hash) do update
  set
    request_count = case
      when limits.window_start = excluded.window_start then limits.request_count + 1
      else 1
    end,
    window_start = excluded.window_start,
    updated_at = excluded.updated_at
  returning request_count into v_count;

  v_remaining := greatest(0, p_limit - v_count);
  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_window_end - v_now)))::integer
  );

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'limit', p_limit,
    'remaining', v_remaining,
    'retryAfter', v_retry_after
  );
end
$$;

revoke all on function public.consume_api_rate_limit(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text,text,integer,integer)
  to service_role;

notify pgrst, 'reload schema';
