import { ApiProperty } from '@nestjs/swagger';

// --- Request ---

export class GenerateWorkflowBodyDto {
  @ApiProperty({
    description: 'Natural language description of the workflow to generate.',
    example:
      'Fetch user data from https://api.example.com/users, then log the total count.',
    minLength: 10,
    maxLength: 1000,
  })
  prompt!: string;
}

// --- Response ---

class DagNodeResponseDto {
  @ApiProperty({ example: 'node-1' })
  id!: string;

  @ApiProperty({ example: 'Fetch Users' })
  name!: string;

  @ApiProperty({ example: 'Fetch user list from the API', required: false })
  description?: string;

  @ApiProperty({ example: 'http_call' })
  type!: string;

  @ApiProperty({
    example: {
      url: 'https://api.example.com/users',
      method: 'GET',
      headers: '{}',
      body: '',
      timeoutMs: 30000,
    },
    required: false,
  })
  config?: Record<string, unknown>;
}

class DagEdgeResponseDto {
  @ApiProperty({ example: 'node-1' })
  from!: string;

  @ApiProperty({ example: 'node-2' })
  to!: string;

  @ApiProperty({ example: 'true', required: false })
  condition?: string;
}

class DagDefinitionResponseDto {
  @ApiProperty({ type: [DagNodeResponseDto] })
  nodes!: DagNodeResponseDto[];

  @ApiProperty({ type: [DagEdgeResponseDto] })
  edges!: DagEdgeResponseDto[];
}

class GenerateWorkflowDataDto {
  @ApiProperty()
  definition!: DagDefinitionResponseDto;
}

export class GenerateWorkflowResponseDto {
  @ApiProperty({ example: 'Workflow generated successfully.' })
  message!: string;

  @ApiProperty()
  data!: GenerateWorkflowDataDto;
}
