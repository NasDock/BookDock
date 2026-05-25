import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores';

/**
 * PlusAuthGuard for React Navigation (mobile equivalent of desktop PlusAuthRoute)
 *
 * Logic:
 *   1. If not logged into Plus → return 'need-login'
 *   2. If logged in and already VIP → return 'is-vip'
 *   3. Otherwise → return 'can-access'
 *
 * Usage:
 *   const guard = usePlusAuthGuard();
 *   useEffect(() => {
 *     if (guard === 'need-login') navigation.replace('MemberLogin');
 *     if (guard === 'is-vip') navigation.replace('MemberDetail');
 *   }, [guard]);
 */
export type PlusAuthGuardResult = 'loading' | 'need-login' | 'is-vip' | 'can-access';

export function usePlusAuthGuard(): PlusAuthGuardResult {
  const [status, setStatus] = useState<PlusAuthGuardResult>('loading');
  const { refreshVipStatus } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const token = await AsyncStorage.getItem('bookdock_plus_token');
      if (!token) {
        if (mounted) setStatus('need-login');
        return;
      }

      const isVip = await refreshVipStatus();
      if (!mounted) return;

      if (isVip) {
        setStatus('is-vip');
      } else {
        setStatus('can-access');
      }
    };

    check();
    return () => { mounted = false; };
  }, [refreshVipStatus]);

  return status;
}
