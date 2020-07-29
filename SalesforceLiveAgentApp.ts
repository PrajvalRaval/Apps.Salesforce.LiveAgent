import {
	IAppAccessors,
	IConfigurationExtend,
	IEnvironmentRead,
	IHttp,
	IHttpRequest,
	ILogger,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import {
	IDepartment,
	ILivechatEventContext,
	ILivechatMessage,
	ILivechatRoom,
	ILivechatTransferData,
	IPostLivechatAgentAssigned,
} from '@rocket.chat/apps-engine/definition/livechat';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo, RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { AppSettings } from './AppSettings';
import { InitiateSalesforceSession } from './handlers/InitiateSalesforceSession';
import { LiveAgentSession } from './handlers/LiveAgentSession';
import { retrievePersistentTokens, sendLCMessage } from './helperFunctions/GeneralHelpers';
import { checkForEvent, messageFilter, pullMessages } from './helperFunctions/SalesforceHelpers';

export class SalesforcePluginApp extends App implements IPostMessageSent, IPostLivechatAgentAssigned {
	constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
		super(info, logger, accessors);
	}

	public async initialize(configurationExtend: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
		await this.extendConfiguration(configurationExtend);
		this.getLogger().log('App Initialized');
	}

	public async executePostLivechatAgentAssigned(data: ILivechatEventContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify) {
		console.log('executeLivechatAssignAgentHandler', { data });

		const salesforceBotUsername: string = (await read.getEnvironmentReader().getSettings().getById('salesforce_bot_username')).value;
		if (data.agent.username !== salesforceBotUsername) {
			return;
		}

		const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, data.room.id);
		const persitedData = await retrievePersistentTokens(read, assoc);
		let { persisantAffinity, persistantKey } = persitedData;

		const handleEndChatCallback = async (endChatdata) => {
			await persistence.removeByAssociation(assoc);
			await sendLCMessage(modify, data.room, endChatdata, data.agent);
			return;
			// TODO: ADD PERFORM HANDOVER TO BOT

			// const authHttpRequest: IHttpRequest = {
			// 	headers: {
			// 		'Content-Type': 'application/json',
			// 	},
			// 	data: {
			// 		user: 'dialogflow.bot',
			// 		password: '123456',
			// 	},
			// };

			// http.post(`http://localhost:3000/api/v1/login`, authHttpRequest)
			// 	.then((loginResponse) => {
			// 		const loginResponseJSON = JSON.parse(loginResponse.content || '{}');
			// 		console.log('Performing Dialogflow bot login, Response:', loginResponse);

			// 		const setStatusHttpRequest: IHttpRequest = {
			// 			headers: {
			// 				'X-Auth-Token': loginResponseJSON.data.authToken,
			// 				'X-User-Id': loginResponseJSON.data.userId,
			// 			},
			// 			data: {
			// 				message: 'online',
			// 				status: 'online',
			// 			},
			// 		};

			// 		http.post(`http://localhost:3000/api/v1/users.setStatus`, setStatusHttpRequest)
			// 			.then(async (statusResponse) => {
			// 				console.log('Setting Dialogflow bot status, Response:', statusResponse);

			// 				const roomId = data.room.id;
			// 				const room: ILivechatRoom = (await read.getRoomReader().getById(roomId)) as ILivechatRoom;
			// 				const targetDepartment: IDepartment = (await read.getLivechatReader().getLivechatDepartmentByIdOrName('bot')) as IDepartment;
			// 				const transferData: ILivechatTransferData = {
			// 					currentRoom: room,
			// 					targetDepartment: targetDepartment.id,
			// 				};
			// 				await modify.getUpdater().getLivechatUpdater().transferVisitor(data.room.visitor, transferData);
			// 			})
			// 			.catch((loginErr) => {
			// 				console.log('Setting Dialogflow bot status , Error:', loginErr);
			// 			});
			// 	})
			// 	.catch((loginErr) => {
			// 		console.log('Performing Dialogflow bot login, Error:', loginErr);
			// 	});
		};

		let salesforceChatApiEndpoint: string = (await read.getEnvironmentReader().getSettings().getById('salesforce_chat_api_endpoint')).value;
		if (salesforceChatApiEndpoint) {
			salesforceChatApiEndpoint = salesforceChatApiEndpoint.replace(/\/?$/, '/');
		} else {
			console.log('Salesforce Chat api endpoint not found.');
			return;
		}

		async function subscribeToLiveAgent(callback: any) {
			await pullMessages(http, salesforceChatApiEndpoint, persisantAffinity, persistantKey)
				.then(async (response) => {
					if (response.statusCode === 403) {
						console.log('Pulling Messages using Subscribe Function, Session Expired.');
						callback('Chat session expired');
						return;
					} else if (response.statusCode === 204 || response.statusCode === 409) {
						console.log('Pulling Messages using Subscribe Function, Empty Response.', response);

						const persistantData = await retrievePersistentTokens(read, assoc);
						persisantAffinity = persistantData.persisantAffinity;
						persistantKey = persistantData.persistantKey;

						if (persisantAffinity && persistantKey) {
							await subscribeToLiveAgent(callback);
						} else {
							console.log('Pulling Messages using Subscribe Function, Session Expired.');
							return;
						}
					} else {
						console.log('Pulling Messages using Subscribe Function, response here:', response);

						const { content } = response;
						const contentParsed = JSON.parse(content || '{}');

						const messageArray = contentParsed.messages;
						const isEndChat = checkForEvent(messageArray, 'ChatEnded');
						console.log('Chat ended by Agent: ', isEndChat);

						if (isEndChat === true) {
							console.log('Pulling Messages using Subscribe Function, Chat Ended By Live Agent.');
							callback('Chat ended by agent.');
						} else {
							await messageFilter(modify, read, data.room, data.agent, messageArray);
							const persistantData = await retrievePersistentTokens(read, assoc);
							persisantAffinity = persistantData.persisantAffinity;
							persistantKey = persistantData.persistantKey;

							if (persisantAffinity && persistantKey) {
								await subscribeToLiveAgent(callback);
							} else {
								console.log('Pulling Messages using Subscribe Function, Session Expired.');
								return;
							}
						}
					}
				})
				.catch(async (error) => {
					console.log('Pulling Messages using Subscribe Function, error here:', error);
					const persistantData = await retrievePersistentTokens(read, assoc);
					persisantAffinity = persistantData.persisantAffinity;
					persistantKey = persistantData.persistantKey;

					if (persisantAffinity && persistantKey) {
						await subscribeToLiveAgent(callback);
					} else {
						console.log('Pulling Messages using Subscribe Function, Session Expired.');
						return;
					}
				});
		}

		if (persisantAffinity && persistantKey) {
			console.log('Executing Subscribe Function, MAIN ENTRY');
			await subscribeToLiveAgent(handleEndChatCallback);
		}
	}

	public async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {
		const salesforceBotUsername: string = (await read.getEnvironmentReader().getSettings().getById('salesforce_bot_username')).value;

		if (message.sender.username === salesforceBotUsername) {
			return;
		} else if (message.room.type !== 'l') {
			return;
		}

		const lmessage: ILivechatMessage = message;
		const lroom: ILivechatRoom = lmessage.room as ILivechatRoom;
		const LcAgent: IUser = lroom.servedBy ? lroom.servedBy : message.sender;

		if (message.text === 'initiate_salesforce_session') {
			const initiateSalesforceSessionhandler = new InitiateSalesforceSession(message, read, http, persistence, modify);

			try {
				initiateSalesforceSessionhandler.exec();
			} catch (error) {
				console.log(error);
			}
		}

		if (LcAgent.username === salesforceBotUsername) {
			const liveAgentSession = new LiveAgentSession(message, read, http, persistence, modify);

			try {
				liveAgentSession.exec();
			} catch (error) {
				console.log(error);
			}
		}
	}

	public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
		AppSettings.forEach((setting) => configuration.settings.provideSetting(setting));
	}
}
