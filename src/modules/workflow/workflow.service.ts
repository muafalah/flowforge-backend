import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWorkflowInput } from './schemas/create-workflow.schema';
import { UpdateWorkflowInput } from './schemas/update-workflow.schema';
import { WorkflowQueryParamsInput } from './schemas/workflow-query-params.schema';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateWorkflowInput,
  ) {
    const workflow = await this.prisma.workflow.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        access: dto.access,
        createdBy: userId,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        _count: { select: { versions: true } },
      },
    });

    return {
      message: 'Workflow created successfully.',
      data: {
        workflow: {
          id: workflow.id,
          organizationId: workflow.organizationId,
          name: workflow.name,
          description: workflow.description,
          access: workflow.access,
          activeVersion: null,
          versionCount: workflow._count.versions,
          creator: workflow.creator,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        },
      },
    };
  }

  async findAll(organizationId: string, query: WorkflowQueryParamsInput) {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      deletedAt: null,
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const orderBy =
      sortBy === 'name' ? { name: sortOrder } : { createdAt: sortOrder };

    const [workflows, total] = await this.prisma.$transaction([
      this.prisma.workflow.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          creator: {
            select: { id: true, name: true, email: true },
          },
          activeVersion: {
            select: { id: true, version: true, createdAt: true },
          },
          _count: { select: { versions: true } },
        },
      }),
      this.prisma.workflow.count({ where }),
    ]);

    return {
      message: 'Workflows retrieved successfully.',
      data: workflows.map((wf) => ({
        id: wf.id,
        organizationId: wf.organizationId,
        name: wf.name,
        description: wf.description,
        access: wf.access,
        activeVersion: wf.activeVersion
          ? {
              id: wf.activeVersion.id,
              version: wf.activeVersion.version,
              createdAt: wf.activeVersion.createdAt,
            }
          : null,
        versionCount: wf._count.versions,
        creator: wf.creator,
        createdAt: wf.createdAt,
        updatedAt: wf.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async findOne(organizationId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        activeVersion: {
          select: { id: true, version: true, createdAt: true },
        },
        _count: { select: { versions: true } },
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

    return {
      message: 'Workflow retrieved successfully.',
      data: {
        workflow: {
          id: workflow.id,
          organizationId: workflow.organizationId,
          name: workflow.name,
          description: workflow.description,
          access: workflow.access,
          activeVersion: workflow.activeVersion
            ? {
                id: workflow.activeVersion.id,
                version: workflow.activeVersion.version,
                createdAt: workflow.activeVersion.createdAt,
              }
            : null,
          versionCount: workflow._count.versions,
          creator: workflow.creator,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        },
      },
    };
  }

  async update(
    organizationId: string,
    workflowId: string,
    dto: UpdateWorkflowInput,
  ) {
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

    const updated = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.access !== undefined ? { access: dto.access } : {}),
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        activeVersion: {
          select: { id: true, version: true, createdAt: true },
        },
        _count: { select: { versions: true } },
      },
    });

    return {
      message: 'Workflow updated successfully.',
      data: {
        workflow: {
          id: updated.id,
          organizationId: updated.organizationId,
          name: updated.name,
          description: updated.description,
          access: updated.access,
          activeVersion: updated.activeVersion
            ? {
                id: updated.activeVersion.id,
                version: updated.activeVersion.version,
                createdAt: updated.activeVersion.createdAt,
              }
            : null,
          versionCount: updated._count.versions,
          creator: updated.creator,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      },
    };
  }

  async softDelete(organizationId: string, workflowId: string) {
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

    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        deletedAt: new Date(),
        activeVersionId: null,
      },
    });

    return {
      message: 'Workflow deleted successfully.',
    };
  }
}
