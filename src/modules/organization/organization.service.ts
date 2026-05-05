import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrganizationInput } from './schemas/create-organization.schema';
import { UpdateOrganizationInput } from './schemas/update-organization.schema';
import { QueryParamsInput } from './schemas/query-params.schema';
import { ACTIVITY_EVENTS } from '../activity-log/activity-log.events';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateOrganizationInput) {
    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.name },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId,
          role: OrganizationRole.OWNER,
        },
      });

      return org;
    });

    return {
      message: 'Organization created successfully.',
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
        },
      },
    };
  }

  async findAll(userId: string, query: QueryParamsInput) {
    const { page, limit, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      organizationMembers: {
        some: { userId },
      },
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [organizations, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy:
          sortBy === 'name' ? { name: sortOrder } : { createdAt: sortOrder },
        include: {
          _count: {
            select: { organizationMembers: true },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      message: 'Organizations retrieved successfully.',
      data: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        memberCount: org._count.organizationMembers,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async findOne(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      include: {
        _count: {
          select: { organizationMembers: true },
        },
      },
    });

    if (!organization) {
      throw new HttpException(
        {
          error: {
            code: 'ORGANIZATION_NOT_FOUND',
            message: 'Organization not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      message: 'Organization retrieved successfully.',
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          memberCount: organization._count.organizationMembers,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
        },
      },
    };
  }

  async update(
    organizationId: string,
    dto: UpdateOrganizationInput,
    actorId: string,
  ) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });

    if (!organization) {
      throw new HttpException(
        {
          error: {
            code: 'ORGANIZATION_NOT_FOUND',
            message: 'Organization not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: dto.name },
    });

    const result = {
      message: 'Organization updated successfully.',
      data: {
        organization: {
          id: updated.id,
          name: updated.name,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      },
    };

    this.eventEmitter.emit(ACTIVITY_EVENTS.ORGANIZATION_UPDATED, {
      organizationId,
      actorId,
      action: ACTIVITY_EVENTS.ORGANIZATION_UPDATED,
      targetType: 'organization',
      targetId: organizationId,
      targetName: updated.name,
      metadata: { oldName: organization.name, newName: updated.name },
    });

    return result;
  }

  async softDelete(organizationId: string, actorId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });

    if (!organization) {
      throw new HttpException(
        {
          error: {
            code: 'ORGANIZATION_NOT_FOUND',
            message: 'Organization not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { deletedAt: new Date() },
    });

    this.eventEmitter.emit(ACTIVITY_EVENTS.ORGANIZATION_DELETED, {
      organizationId,
      actorId,
      action: ACTIVITY_EVENTS.ORGANIZATION_DELETED,
      targetType: 'organization',
      targetId: organizationId,
      targetName: organization.name,
    });

    return {
      message: 'Organization deleted successfully.',
    };
  }
}
