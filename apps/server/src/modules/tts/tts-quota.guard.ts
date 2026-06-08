/**
 * TtsQuotaGuard — checks the user's membership plan allows TTS
 * before allowing /tts/synthesize. Throws 402 (Payment Required) on failure.
 */
import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
} from '@nestjs/common';
import { MembershipService } from '../membership/membership.service';

@Injectable()
export class TtsQuotaGuard implements CanActivate {
  private readonly logger = new Logger(TtsQuotaGuard.name);

  constructor(private readonly membershipService: MembershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const subscription = await this.membershipService.getSubscription(userId);
      if (!subscription) {
        throw new HttpException('No active subscription', HttpStatus.FORBIDDEN);
      }
      const plan = this.membershipService.getPlan(subscription.plan);
      if (!plan.limits.ttsEnabled) {
        throw new HttpException(
          'TTS is not available on your current plan. Upgrade to use audio reading.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Optional: enforce per-month minute cap.
      const limit = plan.limits.ttsQuotaMinPerMonth;
      if (limit > 0) {
        const usage = await this.membershipService.getUsage(userId);
        if (usage.ttsUsedMin >= limit) {
          throw new HttpException(
            `TTS quota exceeded (${usage.ttsUsedMin.toFixed(1)}/${limit} min this month)`,
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`TTS quota check failed: ${(err as Error).message}`);
      // Don't block on internal errors — let the request through and log.
      return true;
    }
  }
}
