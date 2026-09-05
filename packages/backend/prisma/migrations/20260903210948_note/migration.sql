-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('PLAN', 'FREE');

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NoteKind" NOT NULL,
    "planItemId" TEXT,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "doc" JSONB NOT NULL,
    "plainText" TEXT NOT NULL DEFAULT '',
    "status" "GeneralStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_bookId_userId_idx" ON "Note"("bookId", "userId");

-- CreateIndex
CREATE INDEX "Note_clubId_createdAt_idx" ON "Note"("clubId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Note_planItemId_userId_key" ON "Note"("planItemId", "userId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "ReadingPlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
