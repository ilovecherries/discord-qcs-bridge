-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Avatar" (
    "qcsHash" TEXT NOT NULL,
    "discordAvatarUrl" TEXT NOT NULL,
    "discordUid" TEXT NOT NULL
);
INSERT INTO "new_Avatar" ("discordAvatarUrl", "discordUid", "qcsHash") SELECT "discordAvatarUrl", "discordUid", "qcsHash" FROM "Avatar";
DROP TABLE "Avatar";
ALTER TABLE "new_Avatar" RENAME TO "Avatar";
CREATE UNIQUE INDEX "Avatar_qcsHash_key" ON "Avatar"("qcsHash");
CREATE UNIQUE INDEX "Avatar_discordAvatarUrl_key" ON "Avatar"("discordAvatarUrl");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
