ALTER TABLE "Conversation" ADD COLUMN "applicationId" TEXT;

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "jobPost" JSONB NOT NULL,
    "jobSummary" JSONB,
    "notes" JSONB,
    "drafts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Application_userId_slug_key" ON "Application"("userId", "slug");
CREATE INDEX "Application_userId_updatedAt_idx" ON "Application"("userId", "updatedAt");
CREATE UNIQUE INDEX "Conversation_applicationId_mode_key" ON "Conversation"("applicationId", "mode");

ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
