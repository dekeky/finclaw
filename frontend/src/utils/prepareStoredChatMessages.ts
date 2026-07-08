import type { ChatMessage } from '../types';
import { foldConsecutiveProcessMessages } from './foldProcessMessages';
import { rehydrateChatMessages } from './rehydrateChatMessages';

/** 落盘/恢复前统一折叠 process 并补全 kind、processSegments，避免刷新后先散后合。 */
export function prepareStoredChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return foldConsecutiveProcessMessages(rehydrateChatMessages(msgs));
}
