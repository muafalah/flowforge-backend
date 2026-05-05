import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  validateDag,
  type DagDefinition,
} from '../workflow/utils/dag-validator';
import { buildPrompt } from './utils/prompt-builder';

@Injectable()
export class AiWorkflowService {
  private readonly logger = new Logger(AiWorkflowService.name);
  private readonly client: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');

    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    } else {
      this.logger.warn(
        'GROQ_API_KEY is not configured. AI workflow generation will be unavailable.',
      );
      this.client = null;
    }
  }

  /**
   * Generate a DagDefinition from a natural language prompt using OpenAI.
   * Validates the output against the existing DAG schema.
   * Retries once with error feedback if the first attempt is invalid.
   */
  async generateWorkflow(prompt: string): Promise<DagDefinition> {
    if (!this.client) {
      throw new HttpException(
        {
          error: {
            code: 'AI_NOT_CONFIGURED',
            message:
              'AI workflow generation is not available. GROQ_API_KEY is not configured.',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const systemPrompt = buildPrompt();

    // First attempt
    let rawJson = await this.callOpenAI(systemPrompt, prompt);
    let parsed = this.parseResponse(rawJson);

    // Check if AI returned an error (off-topic request)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      (parsed as Record<string, unknown>).error === 'INVALID_REQUEST'
    ) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_PROMPT',
            message:
              (parsed as { message?: string }).message ??
              'The prompt is not related to workflow generation.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate first attempt
    let definition = parsed as DagDefinition;
    let validation = this.validateDefinition(definition);

    if (!validation.valid) {
      this.logger.warn(
        `First generation attempt failed validation: ${validation.errors.join(', ')}`,
      );

      // Retry with error feedback
      const retryUserPrompt = `${prompt}

IMPORTANT: Your previous output was invalid. Fix these errors:
${validation.errors.map((e) => `- ${e}`).join('\n')}

Generate a corrected DagDefinition JSON now.`;

      rawJson = await this.callOpenAI(systemPrompt, retryUserPrompt);
      parsed = this.parseResponse(rawJson);
      definition = parsed as DagDefinition;
      validation = this.validateDefinition(definition);

      if (!validation.valid) {
        this.logger.error(
          `Retry also failed validation: ${validation.errors.join(', ')}`,
        );
        throw new HttpException(
          {
            error: {
              code: 'GENERATION_FAILED',
              message:
                'AI could not generate a valid workflow. Please try rephrasing your description.',
              details: validation.errors,
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    this.logger.log(
      `Successfully generated workflow: ${definition.nodes.length} nodes, ${definition.edges.length} edges`,
    );

    return definition;
  }

  /** Call OpenAI API and return raw text response */
  private async callOpenAI(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    try {
      const completion = await this.client!.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      return completion.choices[0]?.message?.content ?? '';
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI API error';
      this.logger.error(`OpenAI API call failed: ${message}`);

      throw new HttpException(
        {
          error: {
            code: 'AI_SERVICE_ERROR',
            message: `AI service error: ${message}`,
          },
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Parse JSON response from OpenAI, handling malformed output */
  private parseResponse(raw: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      this.logger.warn(
        `Failed to parse AI response as JSON: ${raw.slice(0, 200)}`,
      );
      throw new HttpException(
        {
          error: {
            code: 'GENERATION_FAILED',
            message: 'AI returned an invalid response. Please try again.',
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  /** Validate a parsed definition against the DAG schema */
  private validateDefinition(definition: unknown): {
    valid: boolean;
    errors: string[];
  } {
    // First check basic structure
    if (
      !definition ||
      typeof definition !== 'object' ||
      !('nodes' in definition) ||
      !('edges' in definition)
    ) {
      return {
        valid: false,
        errors: [
          'Response is not a valid DagDefinition. Must have "nodes" and "edges" arrays.',
        ],
      };
    }

    // Use existing DAG validator
    return validateDag(definition as DagDefinition);
  }
}
