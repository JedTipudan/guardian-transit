-- DropForeignKey
ALTER TABLE "GuardianConnection" DROP CONSTRAINT "GuardianConnection_guardianUserId_fkey";

-- AddForeignKey
ALTER TABLE "GuardianConnection" ADD CONSTRAINT "GuardianConnection_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
