import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

export async function sendLCMessage(
  modify: IModify,
  room: IRoom,
  messageText: string,
  sender: IUser,
) {
  const messageBuilder = modify.getNotifier().getMessageBuilder();
  messageBuilder.setRoom(room).setText(messageText).setSender(sender);
  modify.getCreator().finish(messageBuilder);
}

export async function sendDebugLCMessage(
  read: IRead,
  modify: IModify,
  room: IRoom,
  messageText: string,
  sender: IUser,
) {
  const debugMode: boolean = (
    await read.getEnvironmentReader().getSettings().getById('debug_button')
  ).value;

  if (debugMode !== true) {
    return;
  }

  const messageBuilder = modify.getNotifier().getMessageBuilder();
  messageBuilder.setRoom(room).setText(messageText).setSender(sender);
  modify.getCreator().finish(messageBuilder);
}