/**
 * 零原生依赖的二维码视图。
 * qrcode-generator 只做矩阵计算,渲染用纯 RN View,因此 iOS / Android / Expo Web 通用,
 * 不需要 react-native-svg,也不会触发真机重新编译原生模块。
 *
 * 53x53 矩阵逐格渲染会产生 2800+ 原生节点,这里按行做行程合并(连续同色格合成一个 View),
 * 节点数降到约一半,避免登录页掉帧。
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';

interface QrCodeViewProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  /** 静区(白边)模块数,二维码规范要求 >= 4,这里默认 2 以适配登录页 160px 尺寸 */
  quietZone?: number;
}

interface QrRun {
  dark: boolean;
  length: number;
}

interface QrMatrix {
  count: number;
  rows: QrRun[][];
}

export function QrCodeView({
  value,
  size = 160,
  color = '#111827',
  backgroundColor = '#FFFFFF',
  quietZone = 2,
}: QrCodeViewProps) {
  const matrix = useMemo<QrMatrix | null>(() => {
    if (!value) return null;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(value, 'Byte');
      qr.make();
      const count = qr.getModuleCount();
      const rows: QrRun[][] = [];
      for (let row = 0; row < count; row++) {
        const runs: QrRun[] = [];
        for (let col = 0; col < count; col++) {
          const dark = qr.isDark(row, col);
          const last = runs[runs.length - 1];
          if (last && last.dark === dark) {
            last.length += 1;
          } else {
            runs.push({ dark, length: 1 });
          }
        }
        rows.push(runs);
      }
      return { count, rows };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return <View style={{ width: size, height: size, backgroundColor }} />;
  }

  const total = matrix.count + quietZone * 2;
  const cell = size / total;

  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor,
        padding: quietZone * cell,
      }}
    >
      {matrix.rows.map((runs, rowIndex) => (
        <View
          key={rowIndex}
          style={{ flexDirection: 'row', width: matrix.count * cell, height: cell }}
        >
          {runs.map((run, runIndex) => (
            <View
              key={runIndex}
              style={{
                width: run.length * cell,
                height: cell,
                backgroundColor: run.dark ? color : backgroundColor,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
