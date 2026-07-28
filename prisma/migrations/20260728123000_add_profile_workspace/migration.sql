ALTER TABLE "Conversation" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'general';

CREATE TABLE "ProfileBank" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "masterProfile" JSONB,
    "rawSources" JSONB,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileBank_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileBank_userId_key" ON "ProfileBank"("userId");
CREATE INDEX "Conversation_userId_mode_updatedAt_idx" ON "Conversation"("userId", "mode", "updatedAt");

ALTER TABLE "ProfileBank" ADD CONSTRAINT "ProfileBank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
