import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import {
  MembershipController,
  TransferOwnershipController,
} from './membership.controller';
import { MembershipService } from './membership.service';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [
    OrganizationController,
    MembershipController,
    TransferOwnershipController,
  ],
  providers: [
    OrganizationService,
    MembershipService,
    OrganizationGuard,
    RolesGuard,
  ],
  exports: [OrganizationService, MembershipService],
})
export class OrganizationModule {}
