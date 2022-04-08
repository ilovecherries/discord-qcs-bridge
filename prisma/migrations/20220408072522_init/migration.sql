-- CreateTable
CREATE TABLE "Channel" (
    "discordChannelId" TEXT NOT NULL PRIMARY KEY,
    "qcsChannelId" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "WebhookMessage" (
    "webhookId" TEXT NOT NULL,
    "webhookMessageId" TEXT NOT NULL PRIMARY KEY,
    "webhookMessageChannelId" TEXT NOT NULL,
    "qcsMessageId" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "DiscordMessageStore" (
    "discordMessageId" TEXT NOT NULL,
    "qcsMessageId" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Avatar" (
    "qcsHash" TEXT NOT NULL,
    "discordAvatarUrl" TEXT NOT NULL,
    "discordUid" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_discordChannelId_key" ON "Channel"("discordChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookMessage_webhookMessageId_key" ON "WebhookMessage"("webhookMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordMessageStore_discordMessageId_key" ON "DiscordMessageStore"("discordMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordMessageStore_qcsMessageId_key" ON "DiscordMessageStore"("qcsMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_qcsHash_key" ON "Avatar"("qcsHash");

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_discordAvatarUrl_key" ON "Avatar"("discordAvatarUrl");
