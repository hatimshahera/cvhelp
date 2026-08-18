-- Store rolling conversation summaries without changing existing message history.
ALTER TABLE "Conversation"
ADD COLUMN "summary" JSONB,
ADD COLUMN "lastSummarizedMessageId" TEXT;
