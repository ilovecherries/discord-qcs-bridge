require('dotenv').config()

import { Client, Intents, TextChannel, Webhook, Message, User } from 'discord.js';

import { QCS } from './qcs/qcs';
import { WebsocketEventAction, WebsocketEventType, WebsocketResult, WebsocketResultType } from './qcs/types/WebsocketResult';
import WebSocket = require('ws');
import { RequestData } from './qcs/types/RequestData';
import { PrismaClient } from '@prisma/client';
import { avatarUrl } from './qcs/types/User';
import { Comment } from './qcs/types/Comment';
import axios from 'axios';
import sharp from 'sharp';
import FormData from 'form-data';
import { createReadStream } from 'fs';

import { Markup } from 'markup2/parse';
import 'markup2/legacy';
import './markup/render';
import { discordMessageTo12y } from './markup/mdto12y';

const prisma = new PrismaClient();

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })

let api: QCS;
let ws: WebSocket;

async function getWebhook(channel: TextChannel, id?: string): Promise<Webhook | undefined> {
	const webhooks = await channel.fetchWebhooks();
	let webhook: Webhook | undefined = undefined
	if (id)
		webhook = webhooks.find(wh => !!wh.token && wh.id === id);
	else
		webhook = webhooks.find(wh => !!wh.token);

	if (!webhook) {
		console.log('No webhook was found that I can use! Attempting to create one');
		try {
			webhook = await channel.createWebhook('QCS BRIDGE')
		} catch (err) {
			console.error(err)
			return undefined
		}
	}

	return webhook
}

async function getAvatar(author: User): Promise<string> {
	try {
		const url = author.avatarURL()!;
		const id = author.id;

		const avatar = await prisma.avatar.findFirst({
			where: {
				discordUid: id,
			}
		});

		if (!avatar || avatar.discordAvatarUrl !== url) {
			const imageBuffer = await axios.get(url, { responseType: 'arraybuffer' });
			await sharp(imageBuffer.data).toFile(`${id}.png`);
			const data = new FormData();

			data.append('file', createReadStream(`${id}.png`));
			const hash = await api.uploadFile(data, 'discord-bridge-avatars');
			await prisma.avatar.create({
				data: {
					discordAvatarUrl: url,
					discordUid: id,
					qcsHash: hash,
				}
			});
			console.log("NEW AVATAR")
			return hash;
		} else {
			console.log("FOUND AVATAR")
			return avatar.qcsHash;
		}
	} catch (e) {
		console.error(e);
		console.log("MISSING AVATAR")
		return '';
	}
}

client.on('ready', async () => {
	api = await QCS.login(process.env.QCS_USERNAME!, process.env.QCS_PASSWORD!);
	const id = await api.getId();
	const onMessage = (res: WebsocketResult) => {
		switch (res.type) {
			case WebsocketResultType.Live: {
				const data = res.data.data.message as RequestData;
				const events = res.data.events;
				events?.filter((e) => e.type === WebsocketEventType.message).map(async (e) => {
					if (e.action === WebsocketEventAction.delete) {
						const whMsgDatas = await prisma.webhookMessage.findMany({
							where: {
								qcsMessageId: e.refId,
							}
						});
						whMsgDatas.map(async (m) => {
							const channel = client.channels.cache.get(m.webhookMessageChannelId);
							const webhook = await getWebhook(channel as TextChannel, m.webhookId);
							try {
								webhook?.deleteMessage(m.webhookMessageId);
								await prisma.webhookMessage.delete({
									where: {
										webhookMessageId: m.webhookMessageId,
									}
								});
							} catch (e) {
								console.error(e);
							}
						});
					}
					const m = data.message?.find((x) => x.id === e.refId);
					if (!m) return;
					if (m.createUserId === id) return;
					const u = data.user?.find((x) => x.id === m?.createUserId);
					const content = Markup.convert_lang(m.text, m.values.m || 'plaintext');
					switch (e.action) {
						case WebsocketEventAction.create: {
							const channels = await prisma.channel.findMany({
								where: { qcsChannelId: m.contentId }
							})
							channels.map(async (c) => {
								const channel = client.channels.cache.get(c.discordChannelId);
								if (!channel) return;
								const webhook = await getWebhook(channel as TextChannel);
								if (webhook) {
									try {
										const whmsg = await webhook.send({
											content,
											username: u?.username!,
											avatarURL: avatarUrl(u?.avatar!),
										})
										await prisma.webhookMessage.create({
											data: {
												webhookId: webhook.id,
												webhookMessageId: whmsg.id,
												webhookMessageChannelId: channel.id,
												qcsMessageId: m.id,
											}
										});
									} catch (e) {
										console.error(e)
									}
								} else {
									console.error("Couldn't find a webhook to send a message with")
								}
							})
							break;
						}
						case WebsocketEventAction.update: {
							const whMsgDatas = await prisma.webhookMessage.findMany({
								where: {
									qcsMessageId: m.id,
								}
							});
							whMsgDatas.map(async (w) => {
								const channel = client.channels.cache.get(w.webhookMessageChannelId);
								const webhook = await getWebhook(channel as TextChannel, w.webhookId);
								try {
									const whmsg = await webhook?.editMessage(w.webhookMessageId, {
										content,
									});
								} catch (e) {
									console.error(e);
								}
							});
							break;
						}
					}
				})
				break;
			}
		}
	}
	const restartSocket = () => {
		try {
			ws = api.createSocket(onMessage,
				() => setTimeout(restartSocket, 10000));;
		} catch (e) {
			console.error(e)
			setTimeout(restartSocket, 10000);
		}
	}


	restartSocket();
});

client.on('messageCreate', async (msg: Message) => {
	if (client.user!.id !== msg.author.id) {
		const webhook = await getWebhook(msg.channel as TextChannel);
		if (webhook && webhook.id === msg.author.id)
			return;
		if (msg.content.startsWith('$bind')) {
			const params = msg.content.split(' ')
			if (params.length === 2) {
				const p = [
					parseInt(params[1]),
					msg.channelId
				]
				const qcsChannelId = parseInt(params[1]);
				const discordChannelId = msg.channelId;
				try {
					const change = await prisma.channel.upsert({
						where: {
							discordChannelId,
						},
						update: {
							qcsChannelId
						},
						create: {
							discordChannelId,
							qcsChannelId,
						},
					});
					console.log(change);
					msg.reply('Binding the channel was successful')
				} catch (e) {
					msg.reply('Binding the channel failed! This is related to database things unfortunately...');
					console.error(e);
				}
			}
			return
		}
		// see if the channel is registered in the database
		try {
			const channels = await prisma.channel.findMany({
				where: { discordChannelId: msg.channelId }
			})
			channels.map(async (c) => {
				const comment: Partial<Comment> = {
					text: discordMessageTo12y(msg),
					contentId: c.qcsChannelId,
					values: {
						n: msg.member?.nickname || msg.author.username,
						m: '12y',
						a: await getAvatar(msg.author),
					},
				}
				try {
					const res = await api.writeComment(comment);
					await prisma.discordMessageStore.create({
						data: {
							discordMessageId: msg.id,
							qcsMessageId: res.id,
							qcsContentId: res.contentId,
						}
					})
				} catch (e) {
					console.error(e);
				}
			})
		} catch (e) {
			console.error(e)
		}
	}
})

client.on('messageUpdate', async (before, after) => {
	try {
		const msg = await prisma.discordMessageStore.findFirst({
			where: {
				discordMessageId: before.id,
			}
		});
		if (msg) {
			const comment: Partial<Comment> = {
				text: discordMessageTo12y(after as Message),
				id: msg.qcsMessageId,
				contentId: msg.qcsContentId,
			};
			await api.writeComment(comment);
		}
	} catch (e) {
		console.error(e)
	}
})

client.on('messageDelete', async (msg) => {
	try {
		const m = await prisma.discordMessageStore.findFirst({
			where: {
				discordMessageId: msg.id,
			}
		});
		if (m) {
			api.deleteComment(m.qcsMessageId);
			await prisma.discordMessageStore.delete({
				where: {
					discordMessageId: msg.id,
				},
			});
		}
	} catch (e) {
		console.error(e)
	}
})

client.login(process.env.DISCORD_TOKEN);