import Anthropic from '@anthropic-ai/sdk';
import type { Generator } from './index';
import type { StructuredContent } from '../types';
import { SYSTEM_PROMPT } from './prompt';

export class ClaudeGenerator implements Generator {
  private client: Anthropic;

  constructor(private config: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generate(content: StructuredContent): Promise<string> {
    const result = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Title: ${content.title}\n\nSource: ${content.sourceUrl}\n\nContent:\n${content.content}`,
        },
      ],
    });

    const text = result.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      throw new Error('Unexpected response format from Claude API');
    }

    return text.text;
  }
}
