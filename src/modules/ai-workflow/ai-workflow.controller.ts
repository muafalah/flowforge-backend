import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AiWorkflowService } from './ai-workflow.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  generateWorkflowSchema,
  type GenerateWorkflowInput,
} from './schemas/generate-workflow.schema';
import {
  GenerateWorkflowBodyDto,
  GenerateWorkflowResponseDto,
} from './dto/generate-workflow.dto';

@ApiTags('AI Workflow')
@Controller('organizations/:organizationId/ai')
export class AiWorkflowController {
  constructor(private readonly aiWorkflowService: AiWorkflowService) {}

  @Post('generate-workflow')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a workflow definition from a natural language prompt',
    description:
      'Uses AI (Groq Llama 3.3 70B) to generate a valid DagDefinition JSON ' +
      'from a natural language description. The generated definition can ' +
      'be directly loaded into the DAG editor.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: GenerateWorkflowBodyDto })
  @ApiResponse({
    status: 200,
    description: 'Workflow generated successfully.',
    type: GenerateWorkflowResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid prompt or off-topic request.',
    schema: {
      example: {
        error: {
          code: 'INVALID_PROMPT',
          message: 'The prompt is not related to workflow generation.',
        },
      },
    },
  })
  @ApiResponse({
    status: 422,
    description: 'AI could not generate a valid workflow.',
    schema: {
      example: {
        error: {
          code: 'GENERATION_FAILED',
          message:
            'AI could not generate a valid workflow. Please try rephrasing your description.',
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'AI service not configured.',
    schema: {
      example: {
        error: {
          code: 'AI_NOT_CONFIGURED',
          message:
            'AI workflow generation is not available. GROQ_API_KEY is not configured.',
        },
      },
    },
  })
  async generateWorkflow(
    @Param('organizationId') _organizationId: string,
    @Body(new ZodValidationPipe(generateWorkflowSchema))
    body: GenerateWorkflowInput,
  ): Promise<GenerateWorkflowResponseDto> {
    const definition = await this.aiWorkflowService.generateWorkflow(
      body.prompt,
    );

    return {
      message: 'Workflow generated successfully.',
      data: { definition },
    };
  }
}
