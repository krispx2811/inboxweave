-- Add a `content` column to knowledge_documents so we can edit the
-- extracted text after upload (needed for the view/edit page).
-- PDFs are still stored as the original file in storage; `content` holds
-- the text extracted at upload time, and is the source of truth for
-- chunking + embedding after any edit.

alter table public.knowledge_documents
  add column if not exists content text;

comment on column public.knowledge_documents.content is
  'Extracted plain text. Editing this and saving triggers a re-chunk + re-embed.';
