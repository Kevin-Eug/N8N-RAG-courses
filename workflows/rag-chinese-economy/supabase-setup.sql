-- RAG « économie chinoise » : base de connaissances Supabase (pgvector)
-- À exécuter une seule fois dans Supabase > SQL Editor, avant la première ingestion.
-- Dimension 3072 = sortie par défaut de models/gemini-embedding-001 (nœuds « Embedding » et « Embed Queries »).

-- ── 1. Table des chunks ──────────────────────────────────────────────────────

create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id bigserial primary key,
  content text,          -- texte du chunk
  metadata jsonb,        -- { source, pageNumber, chunkIndex }
  embedding extensions.vector(3072)
);

-- RLS activé sans policy : la table n'est accessible qu'aux rôles serveur
-- (l'utilisateur postgres du credential n8n, la clé service_role).
alter table public.documents enable row level security;

-- Pas d'index vectoriel : pgvector n'indexe pas au-delà de 2000 dimensions,
-- et un seul livre (quelques centaines de chunks) se parcourt en quelques millisecondes.

-- ── 2. Ingestion reprenable ──────────────────────────────────────────────────

-- Un seul enregistrement par (livre, numéro de chunk). Le nœud « Find Stored Chunks »
-- écarte les chunks déjà présents avant l'embedding, et l'INSERT se termine par
-- « on conflict do nothing » : une relance reprend là où l'ingestion s'est arrêtée.
create unique index if not exists documents_source_chunk_key
  on public.documents ((metadata->>'source'), ((metadata->>'chunkIndex')::int));

-- Purge manuelle de la base, par exemple avant d'ingérer un autre livre :
--   select public.reset_documents();
-- Renvoie le nombre de chunks supprimés.
create or replace function public.reset_documents()
returns bigint
language plpgsql
set search_path = public
as $$
declare
  removed bigint;
begin
  select count(*) into removed from public.documents;
  truncate table public.documents restart identity;
  return removed;
end;
$$;

revoke execute on function public.reset_documents() from public, anon, authenticated;
grant execute on function public.reset_documents() to service_role;

-- ── 3. Recherche hybride ─────────────────────────────────────────────────────

-- Colonne plein texte calculée automatiquement (racinisation anglaise : le livre est en anglais).
alter table public.documents
  add column if not exists fts tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists documents_fts_idx on public.documents using gin (fts);

-- Appelée par le nœud « Search » : recherche vectorielle + recherche par mots-clés,
-- fusionnées par Reciprocal Rank Fusion (chaque passage gagne 1 / (rrf_k + rang) par liste).
-- keywords suit la syntaxe websearch_to_tsquery, ex. : Evergrande or "shadow banking"
create or replace function public.hybrid_search(
  query_embedding extensions.vector(3072),
  keywords text,
  match_count int default 8,
  rrf_k int default 50
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float,
  vector_rank int,
  keyword_rank int,
  score float
)
language sql
stable
set search_path = public, extensions
as $$
  with vector_hits as (
    select d.id,
           1 - (d.embedding <=> query_embedding) as similarity,
           row_number() over (order by d.embedding <=> query_embedding) as rank_ix
    from documents d
    order by d.embedding <=> query_embedding
    limit match_count * 2
  ),
  keyword_hits as (
    select d.id,
           row_number() over (order by ts_rank_cd(d.fts, q) desc) as rank_ix
    from documents d, websearch_to_tsquery('english', coalesce(keywords, '')) q
    where d.fts @@ q
    order by ts_rank_cd(d.fts, q) desc
    limit match_count * 2
  )
  select d.id,
         d.content,
         d.metadata,
         v.similarity,
         v.rank_ix::int as vector_rank,
         k.rank_ix::int as keyword_rank,
         coalesce(1.0 / (rrf_k + v.rank_ix), 0.0) + coalesce(1.0 / (rrf_k + k.rank_ix), 0.0) as score
  from vector_hits v
  full outer join keyword_hits k on k.id = v.id
  join documents d on d.id = coalesce(v.id, k.id)
  order by score desc
  limit match_count;
$$;

revoke execute on function public.hybrid_search(extensions.vector, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hybrid_search(extensions.vector, text, integer, integer) to service_role;

-- L'historique du chat (table n8n_chat_histories) est créé automatiquement par les nœuds
-- « Postgres Chat Memory » au premier message.
