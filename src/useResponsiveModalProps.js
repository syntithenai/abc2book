import { useIsNarrowViewport } from './useMediaQuery';

export function useResponsiveModalProps() {
  const narrow = useIsNarrowViewport();
  return narrow ? { fullscreen: true } : {};
}
