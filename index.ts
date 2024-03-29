require('dotenv').config()

import { Client, Intents, TextChannel, Webhook, Message, User, GuildMember, PartialMessage } from 'discord.js';

import { PrismaClient } from '@prisma/client';
import { Message as QCSMessage, User as QCSUser } from "contentapi-ts-bindings/dist/Views";
import axios from 'axios';
import sharp from 'sharp';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { ContentAPI, ContentAPI_Session } from "contentapi-ts-bindings/dist/Helpers";
import { ContentAPI_Node_Socket, uploadFile } from 'contentapi-ts-bindings/dist/NodeHelpers';


import Markup_Parse_12y2 from "markup2/parse";
import Markup_Legacy from "markup2/legacy";
import Markup_Langs from "markup2/langs";
import markuprenderToMd from './markup/render';
import { discordMessageTo12y } from './markup/mdto12y';
import { LiveEventType } from 'contentapi-ts-bindings/dist/Live/LiveEvent';
import { WebSocketResponseType } from 'contentapi-ts-bindings/dist/Live/WebSocketResponse';
import { UserAction } from 'contentapi-ts-bindings/dist/Enums';

const parser = new Markup_Parse_12y2();
const langs = new Markup_Langs([parser, new Markup_Legacy()]);

const prisma = new PrismaClient();

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })

let qcsApi = new ContentAPI("qcs.shsbs.xyz");
let session: ContentAPI_Session;
let socket: ContentAPI_Node_Socket;

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

async function getAvatar(author: User | GuildMember): Promise<string> {
	try {
		const url = author.avatarURL()!;
		const id = author.id;

		const avatar = await prisma.avatar.findFirst({
			where: {
				discordUid: id,
				discordAvatarUrl: url,
			}
		});

		if (avatar) {
			console.log("FOUND AVATAR")
			return avatar.qcsHash;
		} else {
			const imageBuffer = await axios.get(url, { responseType: 'arraybuffer' });
			await sharp(imageBuffer.data).toFile(`${id}.png`);
			const data = new FormData();

			data.append('file', createReadStream(`${id}.png`));
			const hash = await uploadFile(session, data, 'discord-bridge-avatars');
			await prisma.avatar.upsert({
				where: {
					discordUid: id,
				},
				update: {
					discordAvatarUrl: url,
					qcsHash: hash,
				},
				create: {
					discordAvatarUrl: url,
					discordUid: id,
					qcsHash: hash,
				}
			});
			console.log("NEW AVATAR")
			return hash;
		}
	} catch (e) {
		console.error(e);
		console.log("MISSING AVATAR")
		return '';
	}
}

function selectAvatarUser(msg: Message | PartialMessage): User | GuildMember {
	return (msg.member?.avatarURL()) ? msg.member : msg.author!
}

// prevent reconnections while one is in progress?

class Socket extends ContentAPI_Node_Socket {
	onClose(): void {
		console.log("websocket connection was closed. waiting 5 seconds to reconnect");
		// clear the websockets just in case it manages to still be active
		this.socket?.removeAllListeners();
		const retry = async () => {
			try {
				await restartSession();
				console.log("reconnection successful");
			} catch {
				console.error("reconnection failed, trying again in 5 seconds")
				setTimeout(retry, 5000)
			}
		}
		setTimeout(retry, 5000);
	}
}

const restartSession = async () => {
	session = await ContentAPI_Session.login(qcsApi, process.env.QCS_USERNAME!, process.env.QCS_PASSWORD!)
	const { id } = await session.getUserInfo();
	socket = session.createSocket(Socket);
	socket.badtoken = async () => {
		await restartSession()
	}
	socket.callback = (res) => {
		switch (res.type) {
			case LiveEventType.live: {
				const data = res.data.objects[WebSocketResponseType.message];
				const events = res.data.events;
				events?.filter((e) => e.type === WebSocketResponseType.message).map(async (e) => {
					if (e.action === UserAction.delete) {
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
					const m = (data?.message as QCSMessage[])?.find((x) => x.id === e.refId);
					if (!m) { return; }
					if (m.createUserId === id) { return; }
					const u = (data?.user as QCSUser[])?.find((x) => x.id === m?.createUserId);
					const tree = langs.parse(m.text, m.values.m || "plaintext", {});
					let content = markuprenderToMd(tree);
					content = content.replaceAll("@", "ⓐ");
					switch (e.action) {
						case UserAction.create: {
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
											avatarURL: qcsApi.getFileURL(u?.avatar!, 64),
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
										console.error(e);
										(channel as TextChannel).send("There was an error sending a message to this channel. Likely from being too long.");
									}
								} else {
									console.error("Couldn't find a webhook to send a message with")
								}
							})
							break;
						}
						case UserAction.update: {
							const whMsgDatas = await prisma.webhookMessage.findMany({
								where: {
									qcsMessageId: m.id,
								}
							});
							whMsgDatas.map(async (w) => {
								const channel = client.channels.cache.get(w.webhookMessageChannelId);
								const webhook = await getWebhook(channel as TextChannel, w.webhookId);
								try {
									await webhook?.editMessage(w.webhookMessageId, {
										content,
									});
								} catch (e) {
									console.error(e);
								}
							});
							break;
						}
					}
				});
			}
		}
	}

}

client.on('ready', async () => {
	console.log("Logged in!")
	await restartSession();
});

client.on('messageCreate', async (msg: Message) => {
	if (client.user!.id !== msg.author.id) {
		const webhook = await getWebhook(msg.channel as TextChannel);
		if (webhook && webhook.id === msg.author.id) {
			return;
		}
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
				const comment: Partial<QCSMessage> = {
					text: discordMessageTo12y(msg),
					contentId: c.qcsChannelId,
					values: {
						n: msg.member?.nickname || msg.author.username,
						m: '12y',
						a: await getAvatar(selectAvatarUser(msg)),
					},
				}
				try {
					const res = await session.write("message", comment);
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
			const comment: Partial<QCSMessage> = {
				text: discordMessageTo12y(after as Message),
				id: msg.qcsMessageId,
				contentId: msg.qcsContentId,
				values: {
					n: after.member?.nickname || after.author!.username,
					m: '12y',
					a: await getAvatar(selectAvatarUser(after)),
				},
			};
			await session.write("message", comment);
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
			await session.delete("message", m.qcsMessageId);
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
