ALTER TABLE "Conversation" ADD COLUMN "threadKey" TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS "Conversation_applicationId_mode_key";
CREATE UNIQUE INDEX "Conversation_userId_mode_applicationId_threadKey_key" ON "Conversation"("userId", "mode", "applicationId", "threadKey");

ALTER TABLE "Application" ADD COLUMN "nextAction" TEXT;
ALTER TABLE "Application" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN "memory" JSONB;
ALTER TABLE "Application" ADD COLUMN "candidateSnapshot" JSONB;
ALTER TABLE "Application" ADD COLUMN "selectedEvidence" JSONB;

CREATE INDEX "Application_userId_status_updatedAt_idx" ON "Application"("userId", "status", "updatedAt");

CREATE TABLE "ApplicationArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationArtifact_applicationId_type_version_key" ON "ApplicationArtifact"("applicationId", "type", "version");
CREATE INDEX "ApplicationArtifact_userId_updatedAt_idx" ON "ApplicationArtifact"("userId", "updatedAt");
CREATE INDEX "ApplicationArtifact_applicationId_type_version_idx" ON "ApplicationArtifact"("applicationId", "type", "version");

ALTER TABLE "ApplicationArtifact" ADD CONSTRAINT "ApplicationArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationArtifact" ADD CONSTRAINT "ApplicationArtifact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
