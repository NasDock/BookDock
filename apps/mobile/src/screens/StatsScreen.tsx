import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getApiClient, type PeriodReadingStats, type DailyHourStats } from '@bookdock/api-client';
import { useThemeStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { RootStackParamList } from '../navigation/types';

type Period = 'day' | 'week' | 'month' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
};

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分钟`;
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

export default function StatsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { isVip } = useAuthStore();

  const [period, setPeriod] = useState<Period>('week');
  const [stats, setStats] = useState<PeriodReadingStats | null>(null);
  const [dailyHours, setDailyHours] = useState<DailyHourStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalTime, setTotalTime] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const chartScrollRef = useRef<ScrollView | null>(null);
  const hasAutoScrolledRef = useRef(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Redirect non-vip users
  useEffect(() => {
    if (!isVip) {
      navigation.navigate('MemberBenefits');
    }
  }, [isVip, navigation]);

  if (!isVip) {
    return null;
  }

  // Fetch summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const api = getApiClient();
        const res = await api.getReadingTimeSummary();
        if (res.success && res.data) {
          setTotalTime(res.data.totalSecs);
        }
      } catch (err) {
        console.error('Failed to fetch reading summary:', err);
      }
    };
    fetchSummary();
  }, []);

  // Fetch period stats
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const api = getApiClient();
        const res = await api.getPeriodReadingStats(period);
        if (res.success && res.data) {
          setStats(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch period stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [period]);

  // Fetch daily hours when period is day
  useEffect(() => {
    if (period !== 'day') {
      setDailyHours(null);
      return;
    }
    const fetchDaily = async () => {
      try {
        const api = getApiClient();
        const res = await api.getDailyReadingHours();
        if (res.success && res.data) {
          setDailyHours(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch daily hours:', err);
      }
    };
    fetchDaily();
  }, [period]);

  const chartData = useMemo(() => {
    if (period === 'day' && dailyHours) {
      return dailyHours.hours.map((h) => ({
        label: `${h.hour}时`,
        durationSecs: h.durationSecs,
      }));
    }
    if (stats) {
      return stats.breakdown;
    }
    return [];
  }, [period, stats, dailyHours]);

  const maxValue = useMemo(() => {
    return Math.max(...chartData.map((d) => d.durationSecs), 1);
  }, [chartData]);

  // Width of a single bar column. Week view splits the available chart width
  // evenly between the 7 columns (so 7 columns always fill the screen), while
  // other periods keep a fixed 28pt column and rely on horizontal scrolling.
  const chartViewportWidth = windowWidth - spacing.md * 2 - spacing.lg * 2;
  const weekColumnWidth = useMemo(() => {
    if (chartViewportWidth <= 0 || 7 === 0) return 0;
    return (chartViewportWidth - spacing.xs * 2 - 6 * 6) / 7;
  }, [chartViewportWidth]);

  const barColumnWidth = period === 'week' ? weekColumnWidth : 28;

  // Auto-scroll to the bar that represents "now" once data is ready so the
  // user lands on the most relevant column instead of staring at the start
  // of the period. Day view focuses the current hour; month view focuses
  // today's column; other periods still land on the last column.
  const focusIndex = useMemo(() => {
    if (chartData.length === 0) return -1;
    if (period === 'day') {
      const currentHour = new Date().getHours();
      const idx = chartData.findIndex((d) => d.label === `${currentHour}时`);
      return idx >= 0 ? idx : Math.min(currentHour, chartData.length - 1);
    }
    if (period === 'month') {
      const today = new Date();
      const day = today.getDate();
      const idx = chartData.findIndex((d) => d.label === `${day}日`);
      if (idx >= 0) return idx;
      const numeric = chartData.findIndex((d) => {
        const m = String(d.label).match(/^(\d+)/);
        return m ? Number(m[1]) === day : false;
      });
      return numeric >= 0 ? numeric : chartData.length - 1;
    }
    return chartData.length - 1;
  }, [period, chartData]);

  useEffect(() => {
    if (loading) return;
    if (chartData.length === 0) return;
    if (focusIndex < 0) return;
    if (hasAutoScrolledRef.current) return;

    const columnWidth = barColumnWidth;
    if (!columnWidth || columnWidth <= 0) return;

    const timer = setTimeout(() => {
      const gap = 6;
      const targetX = focusIndex * (columnWidth + gap);
      chartScrollRef.current?.scrollTo({
        x: Math.max(0, targetX),
        y: 0,
        animated: false,
      });
      hasAutoScrolledRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [loading, chartData.length, focusIndex, barColumnWidth]);

  // Reset the auto-scroll flag whenever the user switches period, so switching
  // back to day/month/year still lands on the "now" column.
  useEffect(() => {
    hasAutoScrolledRef.current = false;
  }, [period]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>阅读统计</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary Cards */}
        <View style={styles.summaryCards}>
          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>累计阅读</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatDuration(totalTime)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name="book-outline" size={20} color={theme.colors.primary} />
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>本周期</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {stats ? formatDuration(stats.totalDurationSecs) : '0分钟'}
            </Text>
          </View>
        </View>

        {/* Period Tabs */}
        <View style={[styles.tabBar, { backgroundColor: theme.colors.surface }]}>
          {(['day', 'week', 'month', 'year'] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.tabItem, period === p && { backgroundColor: theme.colors.primary }]}
              onPress={() => setPeriod(p)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: period === p ? '#fff' : theme.colors.textSecondary },
                ]}
              >
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart */}
        <View style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <>
              <Text style={[styles.chartTitle, { color: theme.colors.text }]}>
                {period === 'day' ? '24小时分布' : `${PERIOD_LABELS[period]}阅读分布`}
              </Text>
              {stats && stats.totalDurationSecs > 0 ? (
                <View style={styles.chartContainerViewport}>
                  <ScrollView
                    ref={chartScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chartContainer}
                  >
                    {chartData.map((item, i) => {
                      const height = maxValue > 0 ? (item.durationSecs / maxValue) * 100 : 0;
                      return (
                        <View
                          key={i}
                          style={[styles.barContainer, { width: barColumnWidth }]}
                        >
                          <View style={styles.barWrapper}>
                            <View
                              style={[
                                styles.bar,
                                {
                                  height: `${Math.max(height, 2)}%`,
                                  backgroundColor: theme.colors.primary,
                                },
                              ]}
                            />
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[styles.barLabel, { color: theme.colors.textSecondary }]}
                          >
                            {item.label}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="book-outline" size={48} color={theme.colors.textSecondary} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <Text style={{ color: theme.colors.textSecondary, fontSize: fontSizes.md }}>暂无阅读数据</Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: fontSizes.sm, marginTop: 4, opacity: 0.7 }}>
                    {PERIOD_LABELS[period]}内还没有阅读记录
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Breakdown List */}
        {stats && stats.totalDurationSecs > 0 && (
          <View style={[styles.breakdownCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.breakdownTitle, { color: theme.colors.text }]}>阅读明细</Text>
            {stats.breakdown
              .filter((b) => b.durationSecs > 0)
              .map((b, i) => (
                <View key={i} style={styles.breakdownItem}>
                  <Text style={{ color: theme.colors.text }}>{b.label}</Text>
                  <Text style={[styles.breakdownValue, { color: theme.colors.primary }]}>
                    {formatDuration(b.durationSecs)}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xl + 8,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
    },
    summaryCards: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    summaryCard: {
      flex: 1,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
      alignItems: 'center',
    },
    summaryLabel: {
      fontSize: fontSizes.sm,
    },
    summaryValue: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
    },
    tabBar: {
      flexDirection: 'row',
      padding: spacing.xs,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
    },
    tabText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    chartCard: {
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      minHeight: 280,
    },
    chartTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      marginBottom: spacing.lg,
    },
    chartContainerViewport: {
      height: 220,
    },
    chartContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: spacing.xs,
      gap: 6,
      height: 200,
    },
    barContainer: {
      alignItems: 'center',
      gap: spacing.xs,
    },
    barWrapper: {
      width: '100%',
      height: 180,
      justifyContent: 'flex-end',
    },
    bar: {
      width: '100%',
      borderRadius: 4,
      minHeight: 2,
    },
    barLabel: {
      fontSize: 10,
    },
    loadingContainer: {
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
    },
    breakdownCard: {
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    breakdownTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      marginBottom: spacing.sm,
    },
    breakdownItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    breakdownValue: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
  });
