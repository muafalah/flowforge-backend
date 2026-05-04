import { ApiProperty } from '@nestjs/swagger';

class DagNodeDto {
  @ApiProperty({ example: 'step1', description: 'Unique node identifier' })
  id!: string;

  @ApiProperty({ example: 'Fetch User', description: 'Node name' })
  name!: string;

  @ApiProperty({
    example: 'Fetches user data from API',
    description: 'Optional node description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    example: 'http',
    description: 'Node type (e.g., http, script, transform)',
  })
  type!: string;

  @ApiProperty({
    example: { url: 'https://api.example.com/data', method: 'GET' },
    description: 'Optional configuration for the node',
    required: false,
  })
  config?: Record<string, unknown>;
}

class DagEdgeDto {
  @ApiProperty({ example: 'step1', description: 'Source node ID' })
  from!: string;

  @ApiProperty({ example: 'step2', description: 'Target node ID' })
  to!: string;

  @ApiProperty({
    example: 'status === 200',
    description: 'Optional condition for this edge',
    required: false,
  })
  condition?: string;
}

class DagDefinitionDto {
  @ApiProperty({
    type: [DagNodeDto],
    description: 'List of nodes in the DAG',
  })
  nodes!: DagNodeDto[];

  @ApiProperty({
    type: [DagEdgeDto],
    description: 'List of edges connecting nodes',
  })
  edges!: DagEdgeDto[];
}

export class CreateVersionDto {
  @ApiProperty({
    type: DagDefinitionDto,
    description: 'DAG definition with nodes and edges',
    example: {
      nodes: [
        {
          id: 'step1',
          name: 'Step 1',
          description: 'First step',
          type: 'http',
          config: { url: 'https://api.example.com', method: 'GET' },
        },
        {
          id: 'step2',
          name: 'Step 2',
          type: 'script',
          config: { language: 'javascript' },
        },
        { id: 'step3', name: 'Step 3', type: 'transform' },
      ],
      edges: [
        { from: 'step1', to: 'step2' },
        { from: 'step2', to: 'step3' },
      ],
    },
  })
  definition!: DagDefinitionDto;
}
