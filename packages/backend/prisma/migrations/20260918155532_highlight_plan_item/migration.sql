-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN     "planItemId" TEXT;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "ReadingPlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
