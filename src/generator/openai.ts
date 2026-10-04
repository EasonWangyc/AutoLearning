import OpenAI from 'openai';
import type { Generator } from './index';
import type { StructuredContent } from '../types';
import { SYSTEM_PROMPT } from './prompt';

export class OpenAIGenerator implements Generator {
  private client: OpenAI;

  constructor(private config: { apiKey: string; model: string; baseUrl?: string }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async generate(content: StructuredContent): Promise<string> {
    const result = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Title: ${content.title}\n\nSource: ${content.sourceUrl}\n\nContent:\n${content.content}`,
        },
      ],
    });

    const text = result.choices[0]?.message?.content;
    if (!text) {
      throw new Error('Empty response from OpenAI API');
    }

    return text;
  }
}
