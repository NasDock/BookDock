import { useState, useEffect, useCallback } from 'react';
import { Dimensions, type ScaledSize } from 'react-native';

export interface OrientationInfo {
  width: number;
  height: number;
  isLandscape: boolean;
  isPortrait: boolean;
  isFolded: boolean;
  isUnfolded: boolean;
  screenSize: 'small' | 'medium' | 'large' | 'xlarge';
}

function getScreenSize(width: number, height: number): OrientationInfo['screenSize'] {
  const minEdge = Math.min(width, height);
  const maxEdge = Math.max(width, height);
  if (maxEdge >= 1024 && minEdge >= 768) return 'xlarge';
  if (maxEdge >= 900 && minEdge >= 600) return 'large';
  if (maxEdge >= 768 && minEdge >= 480) return 'medium';
  return 'small';
}

function getOrientationInfo(window: ScaledSize): OrientationInfo {
  const { width, height } = window;
  const isLandscape = width > height;
  const isPortrait = !isLandscape;

  // Foldable detection heuristic:
  // When unfolded, the aspect ratio is typically close to square (0.6~1.0)
  // When folded, it's like a normal phone (0.4~0.6)
  const aspectRatio = Math.min(width, height) / Math.max(width, height);
  const isUnfolded = aspectRatio > 0.58 && Math.max(width, height) >= 700;
  const isFolded = !isUnfolded && Math.max(width, height) < 900;

  return {
    width,
    height,
    isLandscape,
    isPortrait,
    isFolded,
    isUnfolded,
    screenSize: getScreenSize(width, height),
  };
}

export function useOrientation() {
  const [orientation, setOrientation] = useState<OrientationInfo>(() =>
    getOrientationInfo(Dimensions.get('window'))
  );

  const handleChange = useCallback(({ window }: { window: ScaledSize }) => {
    setOrientation(getOrientationInfo(window));
  }, []);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', handleChange);
    return () => subscription?.remove();
  }, [handleChange]);

  return orientation;
}
