/*
  Warnings:

  - A unique constraint covering the columns `[discordUid]` on the table `Avatar` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Avatar_discordUid_key" ON "Avatar"("discordUid");
