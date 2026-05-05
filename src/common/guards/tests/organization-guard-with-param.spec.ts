import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationGuardWithParam } from '../organization.guard';
import { PrismaService } from '../../../database/prisma.service';
import { OrganizationMemberInfo } from '../../interfaces/request-user.interface';

const mockPrisma = {
  organization: {
    findFirst: jest.fn(),
  },
  organizationMember: {
    findUnique: jest.fn(),
  },
};

function createMockContext(
  params: Record<string, string>,
  userId?: string,
): ExecutionContext {
  const request = {
    params,
    user: userId ? { userId, name: 'Test', email: 'test@test.com' } : null,
    organizationMember: undefined as unknown,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('OrganizationGuardWithParam', () => {
  let guard: InstanceType<ReturnType<typeof OrganizationGuardWithParam>>;

  beforeEach(async () => {
    const GuardClass = OrganizationGuardWithParam('organizationId');

    const module: TestingModule = await Test.createTestingModule({
      providers: [GuardClass, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    guard = module.get(GuardClass);
    jest.clearAllMocks();
  });

  it('should allow access and attach member info for valid member', async () => {
    const member = {
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'OWNER',
    };
    mockPrisma.organization.findFirst.mockResolvedValue({ id: 'org-1' });
    mockPrisma.organizationMember.findUnique.mockResolvedValue(member);

    const context = createMockContext({ organizationId: 'org-1' }, 'user-1');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context
      .switchToHttp()
      .getRequest<{ organizationMember: OrganizationMemberInfo }>();
    expect(request.organizationMember).toEqual(member);
  });

  it('should throw BAD_REQUEST when organizationId param is missing', async () => {
    const context = createMockContext({}, 'user-1');

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(
        (err.getResponse() as { error: { code: string } }).error.code,
      ).toBe('BAD_REQUEST');
    }
  });

  it('should throw BAD_REQUEST when userId is missing', async () => {
    const context = createMockContext({ organizationId: 'org-1' });

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should throw ORGANIZATION_NOT_FOUND when organization does not exist', async () => {
    mockPrisma.organization.findFirst.mockResolvedValue(null);

    const context = createMockContext(
      { organizationId: 'nonexistent' },
      'user-1',
    );

    try {
      await guard.canActivate(context);
      fail('Expected HttpException to be thrown');
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(
        (err.getResponse() as { error: { code: string } }).error.code,
      ).toBe('ORGANIZATION_NOT_FOUND');
    }
  });

  it('should throw FORBIDDEN when user is not a member of the organization', async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ id: 'org-1' });
    mockPrisma.organizationMember.findUnique.mockResolvedValue(null);

    const context = createMockContext({ organizationId: 'org-1' }, 'user-1');

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

  it('should use the correct param name to read organization ID', async () => {
    // Create a guard with a different param name
    const CustomGuardClass = OrganizationGuardWithParam('orgId');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomGuardClass,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    const customGuard = module.get(CustomGuardClass);

    const member = {
      id: 'mem-1',
      organizationId: 'org-2',
      userId: 'user-1',
      role: 'ADMIN',
    };
    mockPrisma.organization.findFirst.mockResolvedValue({ id: 'org-2' });
    mockPrisma.organizationMember.findUnique.mockResolvedValue(member);

    const context = createMockContext({ orgId: 'org-2' }, 'user-1');
    const result = await customGuard.canActivate(context);

    expect(result).toBe(true);
    expect(mockPrisma.organization.findFirst).toHaveBeenCalledWith({
      where: { id: 'org-2', deletedAt: null },
    });
  });
});
