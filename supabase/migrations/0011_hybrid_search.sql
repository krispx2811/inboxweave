-- Hybrid search support: add a full-text search tsvector column + GIN index
-- to knowledge_chunks so we can combine BM25-style keyword ranking with the
-- existing pgvector semantic search. Uses 'simple' config so it's language-
-- agnostic (works equally well on English, Arabic, Chinese, etc.).

alter table public.knowledge_chunks
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(content, ''))) stored;

create index if not exists knowledge_chunks_tsv_idx
  on public.knowledge_chunks using gin (content_tsv);

-- Hybrid RPC: returns top-N candidates using Reciprocal Rank Fusion of
-- vector distance and keyword ts_rank. Accepts the query text (for FTS)
-- and the query embedding (for vector). k=60 is the standard RRF constant.
create or replace function public.match_knowledge_chunks_hybrid(
  p_org_id  uuid,
  p_query   vector(1536),
  p_query_text text,
  p_limit   int default 8
) returns table (
  content  text,
  score    float
) language sql stable as $$
  with
  vector_hits as (
    select c.id, c.content,
           row_number() over (order by c.embedding <=> p_query) as rnk
    from public.knowledge_chunks c
    where c.org_id = p_org_id
    order by c.embedding <=> p_query
    limit 20
  ),
  keyword_hits as (
    select c.id, c.content,
           row_number() over (
             order by ts_rank_cd(c.content_tsv, websearch_to_tsquery('simple', p_query_text)) desc
           ) as rnk
    from public.knowledge_chunks c
    where c.org_id = p_org_id
      and c.content_tsv @@ websearch_to_tsquery('simple', p_query_text)
    limit 20
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
           coalesce(v.content, k.content) as content,
           coalesce(1.0 / (60 + v.rnk), 0.0) + coalesce(1.0 / (60 + k.rnk), 0.0) as score
    from vector_hits v
    full outer join keyword_hits k on v.id = k.id
  )
  select content, score
  from fused
  order by score desc
  limit p_limit;
$$;

comment on function public.match_knowledge_chunks_hybrid is
  'Hybrid RRF over pgvector + full-text search. Combines semantic + exact-match retrieval.';
