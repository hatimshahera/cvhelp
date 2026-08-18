CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "textContent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessageSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Source_userId_scope_createdAt_idx" ON "Source"("userId", "scope", "createdAt");
CREATE INDEX "Source_applicationId_createdAt_idx" ON "Source"("applicationId", "createdAt");
CREATE UNIQUE INDEX "ChatMessageSource_messageId_sourceId_key" ON "ChatMessageSource"("messageId", "sourceId");
CREATE INDEX "ChatMessageSource_userId_createdAt_idx" ON "ChatMessageSource"("userId", "createdAt");
CREATE INDEX "ChatMessageSource_sourceId_idx" ON "ChatMessageSource"("sourceId");

ALTER TABLE "Source" ADD CONSTRAINT "Source_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Source" ADD CONSTRAINT "Source_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageSource" ADD CONSTRAINT "ChatMessageSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageSource" ADD CONSTRAINT "ChatMessageSource_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageSource" ADD CONSTRAINT "ChatMessageSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
