import type { AgentLLMSettings } from '@/api/agents';

export const DEFAULT_AGENT_TEMPERATURE = 0.7;

export function resolvedAgentTemperature(settings?: AgentLLMSettings): number {
  return settings?.temperature ?? DEFAULT_AGENT_TEMPERATURE;
}

export function resolvedThinkingLevel(settings?: AgentLLMSettings): string {
  return settings?.thinking_level?.trim() || 'medium';
}

export function isThinkingEnabled(settings?: AgentLLMSettings): boolean {
  return settings?.thinking_enabled ?? false;
}
