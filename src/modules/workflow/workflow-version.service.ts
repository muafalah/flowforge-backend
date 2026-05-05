import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateVersionInput } from './schemas/create-version.schema';
import { VersionQueryParamsInput } from './schemas/workflow-query-params.schema';
import { validateDag } from './utils/dag-validator';

@Injectable()
export class WorkflowVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async createVersion(
    organizationId: string,
    workflowId: string,
    userId: string,
    dto: CreateVersionInput,
  ) {
    // Verify workflow exists and belongs to organization
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!workflow) {
      throw new HttpException(
        {
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Validate DAG structure (cycle detection, duplicate nodes, edge references)
    const dagValidation = validateDag(dto.definition);

    if (!dagValidation.valid) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_DAG',
            message: 'Invalid workflow definition.',
            details: dagValidation.errors,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Auto-increment version number within a transaction
    const versionId = await this.prisma.$transaction(async (tx) => {
      // Get the latest version number for this workflow
      const latestVersion = await tx.workflowVersion.findFirst({
        where: { workflowId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const nextVersion = (latestVersion?.version ?? 0) + 1;

      // Cast definition to Prisma-compatible JSON type
      const definitionJson = JSON.parse(
        JSON.stringify(dto.definition),
      ) as Prisma.InputJsonValue;

      // Create the new version
      const newVersion = await tx.workflowVersion.create({
        data: {
          workflowId,
          version: nextVersion,
          definition: definitionJson,
          createdBy: userId,
        },
      });

      return newVersion.id;
    });

    // Fetch the created version with creator info outside transaction
    const version = await this.prisma.workflowVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return {
      message: 'Version created successfully.',
      data: {
        version: {
          id: version.id,
          workflowId: version.workflowId,
          version: version.version,
          definition: version.definition,
          isActive: version.isActive,
          executionOrder: dagValidation.executionOrder,
          creator: version.creator,
          createdAt: version.createdAt,
        },
      },
    };
  }

  async findAllVersions(
    organizationId: string,
    workflowId: string,
    query: VersionQueryParamsInput,
  ) {
    // Verify workflow exists and belongs to organization
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!workflow) {
      throw new HttpException(
        {
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const { page, limit, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = { workflowId };

    const [versions, total] = await this.prisma.$transaction([
      this.prisma.workflowVersion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { version: sortOrder },
        include: {
          creator: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.workflowVersion.count({ where }),
    ]);

    return {
      message: 'Versions retrieved successfully.',
      data: versions.map((v) => ({
        id: v.id,
        workflowId: v.workflowId,
        version: v.version,
        definition: v.definition,
        isActive: v.isActive,
        creator: v.creator,
        createdAt: v.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async activateVersion(
    organizationId: string,
    workflowId: string,
    versionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Verify workflow exists and belongs to organization
      const workflow = await tx.workflow.findFirst({
        where: {
          id: workflowId,
          organizationId,
          deletedAt: null,
        },
      });

      if (!workflow) {
        throw new HttpException(
          {
            error: {
              code: 'WORKFLOW_NOT_FOUND',
              message: 'Workflow not found.',
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Verify version exists and belongs to this workflow
      const version = await tx.workflowVersion.findFirst({
        where: {
          id: versionId,
          workflowId,
        },
      });

      if (!version) {
        throw new HttpException(
          {
            error: {
              code: 'VERSION_NOT_FOUND',
              message: 'Workflow version not found.',
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Deactivate all versions for this workflow
      await tx.workflowVersion.updateMany({
        where: { workflowId },
        data: { isActive: false },
      });

      // Activate the selected version
      const activated = await tx.workflowVersion.update({
        where: { id: versionId },
        data: { isActive: true },
        include: {
          creator: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Update workflow's active version pointer
      await tx.workflow.update({
        where: { id: workflowId },
        data: { activeVersionId: versionId },
      });

      return {
        message: 'Version activated successfully.',
        data: {
          version: {
            id: activated.id,
            workflowId: activated.workflowId,
            version: activated.version,
            definition: activated.definition,
            isActive: activated.isActive,
            creator: activated.creator,
            createdAt: activated.createdAt,
          },
        },
      };
    });
  }
}
