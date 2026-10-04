import type { Generator } from './index';
import type { StructuredContent } from '../types';
import { SYSTEM_PROMPT } from './prompt';

export class OllamaGenerator implements Generator {
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
  }

  async generate(content: StructuredContent): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: `${SYSTEM_PROMPT}\n\nTitle: ${content.title}\n\nSource: ${content.sourceUrl}\n\nContent:\n${content.content}`,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }
}
