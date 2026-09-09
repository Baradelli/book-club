-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "page" INTEGER,
    "reference" TEXT,
    "commentDoc" JSONB,
    "commentText" TEXT NOT NULL DEFAULT '',
    "status" "GeneralStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Highlight_bookId_userId_idx" ON "Highlight"("bookId", "userId");

-- CreateIndex
CREATE INDEX "Highlight_bookId_color_idx" ON "Highlight"("bookId", "color");

-- CreateIndex
CREATE INDEX "Highlight_clubId_createdAt_idx" ON "Highlight"("clubId", "createdAt");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
