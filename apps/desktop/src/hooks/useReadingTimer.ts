import { useEffect, useRef, useCallback } from 'react';
import { getApiClient } from '@bookdock/api-client';

const MIN_REPORT_THRESHOLD = 1; // Minimum seconds to report
const REPORT_INTERVAL = 3; // Report every 3 seconds while reading

export function useReadingTimer(bookId: string | undefined) {
  const startTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(false);
  const bookIdRef = useRef<string | undefined>(bookId);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Periodic report while reading
  const startPeriodicReport = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (isActiveRef.current && startTimeRef.current > 0) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        accumulatedRef.current += elapsed;
        startTimeRef.current = Date.now();

        // Report accumulated time every interval
        const total = accumulatedRef.current;
        accumulatedRef.current = 0;
        if (total >= MIN_REPORT_THRESHOLD) {
          reportSession(total);
        }
      }
    }, REPORT_INTERVAL * 1000);
  }, [reportSession]);

  const stopPeriodicReport = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseTimer();
        stopPeriodicReport();
      } else {
        startTimer();
        startPeriodicReport();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startTimer, pauseTimer, startPeriodicReport, stopPeriodicReport]);

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopPeriodicReport();
      flushTimer();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushTimer, stopPeriodicReport]);

  // Start timer when bookId is set
  useEffect(() => {
    if (bookId) {
      startTimer();
      startPeriodicReport();
    }
    return () => {
      stopPeriodicReport();
      flushTimer();
    };
  }, [bookId, startTimer, flushTimer, startPeriodicReport, stopPeriodicReport]);

  return { startTimer, pauseTimer, flushTimer };
}
