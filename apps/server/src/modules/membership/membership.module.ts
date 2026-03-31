import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';

// Membership module kept for future use.
// Current membership implementation uses the VipModule (/vip/* endpoints)
// which handles phone auth, products, orders, and payment callbacks.
@Module({
  imports: [DatabaseModule],
  providers: [],
  exports: [],
})
export class MembershipModule {}
