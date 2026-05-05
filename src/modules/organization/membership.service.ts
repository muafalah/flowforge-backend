import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { AddMemberInput } from './schemas/add-member.schema';
import { UpdateMemberRoleInput } from './schemas/update-member-role.schema';
import { TransferOwnershipInput } from './schemas/transfer-ownership.schema';
import { QueryParamsInput } from './schemas/query-params.schema';
import type { OrganizationMemberInfo } from '../../common/interfaces/request-user.interface';
import { ACTIVITY_EVENTS } from '../activity-log/activity-log.events';

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(organizationId: string, query: QueryParamsInput) {
    const { page, limit, search, sortBy, sortOrder, roles } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(search
        ? {
            user: {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
      ...(roles && roles.length > 0 ? { role: { in: roles } } : {}),
    };

    const orderBy =
      sortBy === 'role'
        ? { role: sortOrder }
        : sortBy === 'name'
          ? { user: { name: sortOrder } }
          : { createdAt: sortOrder };

    const [members, total] = await this.prisma.$transaction([
      this.prisma.organizationMember.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.organizationMember.count({ where }),
    ]);

    return {
      message: 'Members retrieved successfully.',
      data: members.map((member) => ({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        user: {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
        },
      })),
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async findByUserId(organizationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!member) {
      throw new HttpException(
        {
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Member not found in this organization.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      message: 'Member retrieved successfully.',
      data: {
        id: member.id,
        userId: member.userId,
        organizationId: member.organizationId,
        role: member.role,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        user: {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
        },
        organization: {
          id: member.organization.id,
          name: member.organization.name,
        },
      },
    };
  }

  async addMember(
    organizationId: string,
    dto: AddMemberInput,
    currentMember: OrganizationMemberInfo,
  ) {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user) {
      throw new HttpException(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No user found with this email address.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Check if user is already a member
    const existingMember = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMember) {
      throw new HttpException(
        {
          error: {
            code: 'MEMBER_ALREADY_EXISTS',
            message: 'This user is already a member of the organization.',
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const member = await this.prisma.organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role: OrganizationRole.MEMBER,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const result = {
      message: 'Member added successfully.',
      data: {
        member: {
          id: member.id,
          role: member.role,
          createdAt: member.createdAt,
          user: {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
          },
        },
      },
    };

    this.eventEmitter.emit(ACTIVITY_EVENTS.MEMBER_ADDED, {
      organizationId,
      actorId: currentMember.userId,
      action: ACTIVITY_EVENTS.MEMBER_ADDED,
      targetType: 'member',
      targetId: member.id,
      targetName: member.user.email,
      metadata: { role: member.role, memberName: member.user.name },
    });

    return result;
  }

  async updateRole(
    organizationId: string,
    memberId: string,
    dto: UpdateMemberRoleInput,
    currentMember: OrganizationMemberInfo,
  ) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new HttpException(
        {
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Member not found in this organization.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Cannot change the role of an OWNER via this endpoint
    if (member.role === OrganizationRole.OWNER) {
      throw new HttpException(
        {
          error: {
            code: 'FORBIDDEN',
            message:
              'Cannot change the role of an owner. Use transfer-ownership endpoint instead.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const result = {
      message: 'Member role updated successfully.',
      data: {
        member: {
          id: updated.id,
          role: updated.role,
          createdAt: updated.createdAt,
          user: {
            id: updated.user.id,
            name: updated.user.name,
            email: updated.user.email,
          },
        },
      },
    };

    this.eventEmitter.emit(ACTIVITY_EVENTS.MEMBER_ROLE_UPDATED, {
      organizationId,
      actorId: currentMember.userId,
      action: ACTIVITY_EVENTS.MEMBER_ROLE_UPDATED,
      targetType: 'member',
      targetId: updated.id,
      targetName: updated.user.email,
      metadata: { oldRole: member.role, newRole: dto.role },
    });

    return result;
  }

  async removeMember(
    organizationId: string,
    memberId: string,
    currentMember: OrganizationMemberInfo,
  ) {
    const targetMember = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!targetMember) {
      throw new HttpException(
        {
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Member not found in this organization.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const isSelf = currentMember.userId === targetMember.userId;

    // OWNER cannot be removed
    if (targetMember.role === OrganizationRole.OWNER) {
      throw new HttpException(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Cannot remove the owner. Transfer ownership first.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (isSelf) {
      // Any non-OWNER can leave
      await this.prisma.organizationMember.delete({
        where: { id: memberId },
      });

      return {
        message: 'You have left the organization.',
      };
    }

    // ADMIN can remove MEMBER only
    if (currentMember.role === OrganizationRole.ADMIN) {
      if (targetMember.role !== OrganizationRole.MEMBER) {
        throw new HttpException(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Admins can only remove members with the MEMBER role.',
            },
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // MEMBER cannot remove others
    if (currentMember.role === OrganizationRole.MEMBER) {
      throw new HttpException(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to remove this member.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // OWNER or authorized ADMIN — proceed
    await this.prisma.organizationMember.delete({
      where: { id: memberId },
    });

    this.eventEmitter.emit(ACTIVITY_EVENTS.MEMBER_REMOVED, {
      organizationId,
      actorId: currentMember.userId,
      action: ACTIVITY_EVENTS.MEMBER_REMOVED,
      targetType: 'member',
      targetId: memberId,
      targetName: targetMember.userId,
      metadata: { removedRole: targetMember.role },
    });

    return {
      message: 'Member removed successfully.',
    };
  }

  async transferOwnership(
    organizationId: string,
    dto: TransferOwnershipInput,
    currentMember: OrganizationMemberInfo,
  ) {
    const targetMember = await this.prisma.organizationMember.findFirst({
      where: { id: dto.memberId, organizationId },
    });

    if (!targetMember) {
      throw new HttpException(
        {
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Target member not found in this organization.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (targetMember.role === OrganizationRole.OWNER) {
      throw new HttpException(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Target member is already the owner.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Transaction: promote target to OWNER, demote current to ADMIN
    await this.prisma.$transaction([
      this.prisma.organizationMember.update({
        where: { id: targetMember.id },
        data: { role: OrganizationRole.OWNER },
      }),
      this.prisma.organizationMember.update({
        where: { id: currentMember.id },
        data: { role: OrganizationRole.ADMIN },
      }),
    ]);

    this.eventEmitter.emit(ACTIVITY_EVENTS.OWNERSHIP_TRANSFERRED, {
      organizationId,
      actorId: currentMember.userId,
      action: ACTIVITY_EVENTS.OWNERSHIP_TRANSFERRED,
      targetType: 'member',
      targetId: targetMember.id,
      metadata: {
        previousOwnerId: currentMember.userId,
        newOwnerId: targetMember.userId,
      },
    });

    return {
      message: 'Ownership transferred successfully.',
    };
  }
}
