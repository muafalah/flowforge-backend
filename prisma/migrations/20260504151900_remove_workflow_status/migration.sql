-- DropIndex
DROP INDEX "workflows_organization_id_status_idx";

-- AlterTable
ALTER TABLE "workflows" DROP COLUMN "status";

-- DropEnum
DROP TYPE "WorkflowStatus";
