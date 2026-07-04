import type { ChatMessage } from '../types';
import { foldConsecutiveProcessMessages } from './foldProcessMessages';
import { reorderMisplacedProcessInTurn } from './reorderTurnMessages';
import { stripPicoclawSlashCommandNoise } from './picoclawSlashCommandAck';
import { rehydrateChatMessages } from './rehydrateChatMessages';

/** 落盘/恢复前统一折叠 process 并补全 kind、processSegments，避免刷新后先散后合。 */
export function prepareStoredChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return foldConsecutiveProcessMessages(
    rehydrateChatMessages(stripPicoclawSlashCommandNoise(reorderMisplacedProcessInTurn(msgs))),
  );
}
