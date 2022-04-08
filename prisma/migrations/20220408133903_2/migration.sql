/*
  Warnings:

  - Added the required column `qcsContentId` to the `DiscordMessageStore` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiscordMessageStore" (
    "discordMessageId" TEXT NOT NULL,
    "qcsMessageId" INTEGER NOT NULL,
    "qcsContentId" INTEGER NOT NULL
);
INSERT INTO "new_DiscordMessageStore" ("discordMessageId", "qcsMessageId") SELECT "discordMessageId", "qcsMessageId" FROM "DiscordMessageStore";
DROP TABLE "DiscordMessageStore";
ALTER TABLE "new_DiscordMessageStore" RENAME TO "DiscordMessageStore";
CREATE UNIQUE INDEX "DiscordMessageStore_discordMessageId_key" ON "DiscordMessageStore"("discordMessageId");
CREATE UNIQUE INDEX "DiscordMessageStore_qcsMessageId_key" ON "DiscordMessageStore"("qcsMessageId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
