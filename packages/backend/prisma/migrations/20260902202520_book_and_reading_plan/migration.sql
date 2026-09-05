-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "month" TEXT NOT NULL,
    "coverUrl" TEXT,
    "totalPages" INTEGER,
    "createdById" TEXT NOT NULL,
    "status" "GeneralStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingPlanItem" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Book_clubId_status_idx" ON "Book"("clubId", "status");

-- CreateIndex
CREATE INDEX "ReadingPlanItem_bookId_order_idx" ON "ReadingPlanItem"("bookId", "order");

-- CreateIndex
CREATE INDEX "ReadingPlanItem_bookId_date_idx" ON "ReadingPlanItem"("bookId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingPlanItem_bookId_date_key" ON "ReadingPlanItem"("bookId", "date");

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingPlanItem" ADD CONSTRAINT "ReadingPlanItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
