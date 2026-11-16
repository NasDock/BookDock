import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { MembershipService } from './membership.service';

// Membership module kept for future use.
// Current membership implementation uses the VipModule (/vip/* endpoints)
// which handles phone auth, products, orders, and payment callbacks.
//
// The service is exported so that other modules (e.g. TtsQuotaGuard) can
// query the current user's plan / usage without having to re-implement it.
@Module({
  imports: [DatabaseModule],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
