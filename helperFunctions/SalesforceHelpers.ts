import { IHttp, IHttpRequest, IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { sendDebugLCMessage, sendLCMessage } from './GeneralHelpers';

export async function getSessionTokens(http: IHttp, liveAgentUrl: string) {
	const generateTokenEndpoint = liveAgentUrl + 'System/SessionId';
	const generateSessionIdHttpRequest: IHttpRequest = {
		headers: {
			'X-LIVEAGENT-API-VERSION': '49',
			'X-LIVEAGENT-AFFINITY': 'null',
		},
	};
	try {
		const response = await http.get(generateTokenEndpoint, generateSessionIdHttpRequest);
		const responseJSON = JSON.parse(response.content || '{}');
		const { id, affinityToken, key } = responseJSON;
		return {
			id,
			affinityToken,
			key,
		};
	} catch (error) {
		throw Error(error);
	}
}

export async function sendChatRequest(
	http: IHttp,
	liveAgentUrl: string,
	affinityToken: string,
	key: string,
	id: string,
	salesforceOrganisationId: string,
	salesforceButtonId: string,
	salesforceDeploymentId: string,
	LcVisitorName: string,
	LcVisitorEmail?: string,
) {
	const sendChatRequestEndpoint = liveAgentUrl + 'Chasitor/ChasitorInit';
	const sendChatRequestHttpRequest: IHttpRequest = {
		headers: {
			'X-LIVEAGENT-API-VERSION': '49',
			'X-LIVEAGENT-AFFINITY': affinityToken,
			'X-LIVEAGENT-SESSION-KEY': key,
		},
		data: {
			organizationId: salesforceOrganisationId,
			deploymentId: salesforceDeploymentId,
			buttonId: salesforceButtonId,
			sessionId: id,
			userAgent: 'Lynx/2.8.8',
			language: 'en-US',
			screenResolution: '1900x1080',
			visitorName: LcVisitorName || 'Live Chat Visitor',
			prechatDetails: [
				{
					label: 'E-mail Address',
					value: LcVisitorEmail,
					entityFieldMaps: [
						{
							entityName: 'Contact',
							fieldName: 'Email',
							isFastFillable: false,
							isAutoQueryable: true,
							isExactMatchable: true,
						},
					],
					transcriptFields: ['c__EmailAddress'],
					displayToAgent: true,
				},
			],
			prechatEntities: [],
			receiveQueueUpdates: true,
			isPost: true,
		},
	};
	try {
		const response = await http.post(sendChatRequestEndpoint, sendChatRequestHttpRequest);
		return response;
	} catch (error) {
		throw Error(error);
	}
}

export async function pullMessages(http: IHttp, liveAgentUrl: string, affinityToken: string, key: string) {
	const pullMessagesEndpoint = liveAgentUrl + 'System/Messages';
	const pullMessagesHttpRequest: IHttpRequest = {
		headers: {
			'X-LIVEAGENT-API-VERSION': '49',
			'X-LIVEAGENT-AFFINITY': affinityToken,
			'X-LIVEAGENT-SESSION-KEY': key,
		},
	};
	try {
		const response = await http.get(pullMessagesEndpoint, pullMessagesHttpRequest);
		return response;
	} catch (error) {
		throw Error(error);
	}
}

export async function closeChat(http: IHttp, liveAgentUrl: string, affinityToken: string, key: string) {
	const closeLiveAgentChatEndpoint = liveAgentUrl + 'Chasitor/ChatEnd';
	const closeLiveAgentChatHttpRequest: IHttpRequest = {
		headers: {
			'X-LIVEAGENT-API-VERSION': '49',
			'X-LIVEAGENT-AFFINITY': affinityToken,
			'X-LIVEAGENT-SESSION-KEY': key,
		},
		data: {
			reason: 'client',
		},
	};
	try {
		const response = await http.post(closeLiveAgentChatEndpoint, closeLiveAgentChatHttpRequest);
		return response;
	} catch (error) {
		throw Error(error);
	}
}

export async function sendMessages(http: IHttp, liveAgentUrl: string, affinityToken: string, key: string, messageText: string) {
	const sendMessagesEndpoint = liveAgentUrl + 'Chasitor/ChatMessage';
	const sendMessagesHttpRequest: IHttpRequest = {
		headers: {
			'X-LIVEAGENT-API-VERSION': '49',
			'X-LIVEAGENT-AFFINITY': affinityToken,
			'X-LIVEAGENT-SESSION-KEY': key,
		},
		data: {
			text: messageText,
		},
	};
	try {
		const response = await http.post(sendMessagesEndpoint, sendMessagesHttpRequest);
		return response;
	} catch (error) {
		throw Error(error);
	}
}

export async function messageFilter(modify: IModify, read: IRead, messageRoom: IRoom, LcAgent: IUser, messageArray: any) {
	messageArray.forEach(async (i) => {
		const type = i.type;
		switch (type) {
			case 'ChatMessage':
				const messageText = i.message.text;
				await sendLCMessage(modify, messageRoom, messageText, LcAgent);
				break;

			case 'AgentTyping':
				await sendDebugLCMessage(read, modify, messageRoom, 'Agent Typing', LcAgent);
				break;

			default:
				console.log('Pulling Messages from Liveagent, Default messageType:', type);
				break;
		}
	});
}

export function checkForEvent(messageArray: any, eventToCheck: string) {
	if (messageArray && messageArray.length > 0) {
		for (let i = 0; i < messageArray.length; i++) {
			if (messageArray[i].type === eventToCheck) {
				return true;
			}
		}
	}
	return false;
}
