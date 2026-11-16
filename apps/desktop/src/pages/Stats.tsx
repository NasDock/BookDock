import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getApiClient, type PeriodReadingStats, type DailyHourStats } from "@bookdock/api-client";
import { useAuthStore } from "../stores/authStore";
import { ArrowLeft, Clock, BookOpen, BarChart3 } from "lucide-react";

type Period = "day" | "week" | "month" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  day: "日",
  week: "周",
  month: "月",
  year: "年",
};

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分钟`;
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

function BarChart({ data, maxValue, labelKey, valueKey }: { data: any[]; maxValue: number; labelKey: string; valueKey: string }) {
  if (maxValue === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        暂无阅读数据
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between h-64 gap-1 px-2">
      {data.map((item, i) => {
        const value = item[valueKey] || 0;
        const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end justify-center" style={{ height: "200px" }}>
              <div
                className="w-full max-w-[32px] bg-blue-500 hover:bg-blue-600 rounded-t transition-all relative group"
                style={{ height: `${Math.max(height, 2)}%` }}
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  {formatDuration(value)}
                </div>
              </div>
            </div>
            <span className="text-[10px] text-gray-500 truncate w-full text-center">
              {item[labelKey]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Stats() {
  const navigate = useNavigate();
  const { user, isVip } = useAuthStore();
  const [period, setPeriod] = useState<Period>("week");
  const [stats, setStats] = useState<PeriodReadingStats | null>(null);
  const [dailyHours, setDailyHours] = useState<DailyHourStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalTime, setTotalTime] = useState(0);

  // Redirect non-vip users to membership page
  useEffect(() => {
    if (!isVip) {
      navigate("/membership");
    }
  }, [isVip, navigate]);

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
        console.error("Failed to fetch reading summary:", err);
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
        console.error("Failed to fetch period stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [period]);

  // Fetch daily hours when period is day
  useEffect(() => {
    if (period !== "day") {
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
        console.error("Failed to fetch daily hours:", err);
      }
    };
    fetchDaily();
  }, [period]);

  const chartData = useMemo(() => {
    if (period === "day" && dailyHours) {
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">阅读统计</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm">累计阅读时长</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatDuration(totalTime)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <BookOpen className="w-4 h-4" />
              <span className="text-sm">本周期阅读</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats ? formatDuration(stats.totalDurationSecs) : "0分钟"}
            </p>
          </div>
        </div>

        {/* Period Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-6">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {(["day", "week", "month", "year"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  period === p
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {period === "day" ? "24小时分布" : `${PERIOD_LABELS[period]}阅读分布`}
                  </h3>
                  <span className="text-xs text-gray-400">
                    共 {stats?.bookCount || 0} 本书
                  </span>
                </div>
                {stats && stats.totalDurationSecs === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <BookOpen className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">暂无阅读数据</p>
                    <p className="text-xs mt-1 text-gray-400">{PERIOD_LABELS[period]}内还没有阅读记录</p>
                  </div>
                ) : (
                  <BarChart
                    data={chartData}
                    maxValue={maxValue}
                    labelKey="label"
                    valueKey="durationSecs"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Book List */}
        {stats && stats.totalDurationSecs > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              本周期阅读明细
            </h3>
            <div className="space-y-2">
              {stats.breakdown
                .filter((b) => b.durationSecs > 0)
                .map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{b.label}</span>
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      {formatDuration(b.durationSecs)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
