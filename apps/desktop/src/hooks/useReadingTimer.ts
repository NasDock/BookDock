import { useEffect, useRef, useCallback } from 'react';
import { getApiClient } from '@bookdock/api-client';

const MIN_REPORT_THRESHOLD = 10; // Minimum seconds to report

export function useReadingTimer(bookId: string | undefined) {
  const startTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(false);
  const bookIdRef = useRef<string | undefined>(bookId);

  // Update bookId ref when it changes
  useEffect(() => {
    bookIdRef.current = bookId;
  }, [bookId]);

  const reportSession = useCallback(async (durationSecs: number) => {
    const currentBookId = bookIdRef.current;
    if (!currentBookId || durationSecs < MIN_REPORT_THRESHOLD) return;

    try {
      const hour = new Date().getHours();
      await getApiClient().recordReadingSession(currentBookId, durationSecs, hour);
    } catch (err) {
      console.warn('Failed to report reading session:', err);
    }
  }, []);

  const startTimer = useCallback(() => {
    if (!isActiveRef.current) {
      isActiveRef.current = true;
      startTimeRef.current = Date.now();
    }
  }, []);

  const pauseTimer = useCallback(() => {
    if (isActiveRef.current && startTimeRef.current > 0) {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      accumulatedRef.current += elapsed;
      isActiveRef.current = false;
      startTimeRef.current = 0;
    }
  }, []);

  const flushTimer = useCallback(async () => {
    pauseTimer();
    const total = accumulatedRef.current;
    if (total >= MIN_REPORT_THRESHOLD) {
      await reportSession(total);
    }
    accumulatedRef.current = 0;
  }, [pauseTimer, reportSession]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseTimer();
      } else {
        startTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startTimer, pauseTimer]);

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushTimer();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushTimer]);

  // Start timer when bookId is set
  useEffect(() => {
    if (bookId) {
      startTimer();
    }
    return () => {
      flushTimer();
    };
  }, [bookId, startTimer, flushTimer]);

  return { startTimer, pauseTimer, flushTimer };
}
