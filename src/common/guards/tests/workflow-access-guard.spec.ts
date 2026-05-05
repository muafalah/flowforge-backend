import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowAccessGuard } from '../workflow-access.guard';
import { PrismaService } from '../../../database/prisma.service';
import type { OrganizationMemberInfo } from '../../interfaces/request-user.interface';

const mockPrisma = {
  workflow: {
    findFirst: jest.fn(),
  },
};

function createMockContext(
  params: Record<string, string>,
  member?: OrganizationMemberInfo | null,
): ExecutionContext {
  const request = {
    params,
    organizationMember: member ?? undefined,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('WorkflowAccessGuard', () => {
  let guard: InstanceType<ReturnType<typeof WorkflowAccessGuard>>;

  beforeEach(async () => {
    const GuardClass = WorkflowAccessGuard('organizationId', 'workflowId');

    const module: TestingModule = await Test.createTestingModule({
      providers: [GuardClass, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    guard = module.get(GuardClass);
    jest.clearAllMocks();
  });

  // --- OWNER / ADMIN bypass ---

  it('should allow OWNER without checking workflow', async () => {
    const member: OrganizationMemberInfo = {
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'OWNER',
    };

    const context = createMockContext(
      { organizationId: 'org-1', workflowId: 'wf-1' },
      member,
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockPrisma.workflow.findFirst).not.toHaveBeenCalled();
  });

  it('should allow ADMIN without checking workflow', async () => {
    const member: OrganizationMemberInfo = {
      id: 'mem-2',
      organizationId: 'org-1',
      userId: 'user-2',
      role: 'ADMIN',
    };

    const context = createMockContext(
      { organizationId: 'org-1', workflowId: 'wf-1' },
      member,
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockPrisma.workflow.findFirst).not.toHaveBeenCalled();
  });

  // --- MEMBER with EDITOR access ---

  it('should allow MEMBER when workflow access is EDITOR', async () => {
    const member: OrganizationMemberInfo = {
      id: 'mem-3',
      organizationId: 'org-1',
      userId: 'user-3',
      role: 'MEMBER',
    };

    mockPrisma.workflow.findFirst.mockResolvedValue({
      access: 'EDITOR',
    });

    const context = createMockContext(
      { organizationId: 'org-1', workflowId: 'wf-1' },
      member,
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockPrisma.workflow.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'wf-1',
        organizationId: 'org-1',
        deletedAt: null,
      },
      select: { access: true },
    });
  });

  // --- MEMBER with VIEWER access ---

  it('should deny MEMBER when workflow access is VIEWER', async () => {
    const member: OrganizationMemberInfo = {
      id: 'mem-3',
      organizationId: 'org-1',
      userId: 'user-3',
      role: 'MEMBER',
    };

    mockPrisma.workflow.findFirst.mockResolvedValue({
      access: 'VIEWER',
    });

    const context = createMockContext(
      { organizationId: 'org-1', workflowId: 'wf-1' },
      member,
    );

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(
        (err.getResponse() as { error: { code: string } }).error.code,
      ).toBe('FORBIDDEN');
    }
  });

  // --- No member on request ---

  it('should throw FORBIDDEN when organizationMember is not on request', async () => {
    const context = createMockContext(
      { organizationId: 'org-1', workflowId: 'wf-1' },
      null,
    );

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  // --- Missing params ---

  it('should throw BAD_REQUEST when organizationId is missing for MEMBER', async () => {
    const member: OrganizationMemberInfo = {
      id: 'mem-3',
      organizationId: 'org-1',
      userId: 'user-3',
      role: 'MEMBER',
    };

    const context = createMockContext({ workflowId: 'wf-1' }, member);

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should throw BAD_REQUEST when workflowId is missing for MEMBER', async () => {
    const member: OrganizationMemberInfo = {
      id: 'mem-3',
      organizationId: 'org-1',
      userId: 'user-3',
      role: 'MEMBER',
    };

    const context = createMockContext({ organizationId: 'org-1' }, member);

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  // --- Workflow not found ---

  it('should throw WORKFLOW_NOT_FOUND when workflow does not exist for MEMBER', async () => {
    const member: OrganizationMemberInfo = {
      id: 'mem-3',
      organizationId: 'org-1',
      userId: 'user-3',
      role: 'MEMBER',
    };

    mockPrisma.workflow.findFirst.mockResolvedValue(null);

    const context = createMockContext(
      { organizationId: 'org-1', workflowId: 'nonexistent' },
      member,
    );

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(
        (err.getResponse() as { error: { code: string } }).error.code,
      ).toBe('WORKFLOW_NOT_FOUND');
    }
  });
});
