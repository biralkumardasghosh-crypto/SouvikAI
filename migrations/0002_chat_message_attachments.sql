-- Adds an attachments column to chat_messages so images and documents
-- attached to a user message can be re-rendered when the conversation is
-- reloaded.
--
-- We store an array of compact metadata objects; for images this includes a
-- small client-generated WebP thumbnail (~10–50 KB) so we never have to upload
-- to storage but can still render real previews inline. Full-size base64 is
-- discarded after the message is sent — only the thumbnail is persisted.
--
-- Shape:
-- [
--   { "kind": "image",    "name": "diagram.png", "mimeType": "image/png", "sizeBytes": 524288, "thumbnail": "data:image/webp;base64,..." },
--   { "kind": "document", "name": "spec.pdf",    "mimeType": "application/pdf", "sizeBytes": 1048576 }
-- ]

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS attachments JSONB;

-- Lightweight GIN index so future "messages with attachments" queries stay fast.
CREATE INDEX IF NOT EXISTS idx_chat_messages_attachments
    ON public.chat_messages USING GIN (attachments)
    WHERE attachments IS NOT NULL;
