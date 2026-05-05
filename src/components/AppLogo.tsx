import { memo } from 'react';
import appLogo from '@/assets/app-logo.webp';

interface AppLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Centralized, memoized logo component with proper HTML attribute casing
// Uses native img attributes to avoid React fetchPriority warnings
const AppLogoInner = ({ className, size = 'md' }: AppLogoProps) => {
  const sizeClass = size === 'sm' 
    ? 'h-8 w-8 xs:h-9 xs:w-9 sm:h-10 sm:w-10' 
    : size === 'lg' 
      ? 'h-11 w-11 sm:h-12 sm:w-12'
      : 'h-10 w-10 sm:h-11 sm:w-11';

  return (
    <img
      src={appLogo}
      alt="Flowist"
      className={className || `${sizeClass} flex-shrink-0`}
      loading="eager"
      decoding="async"
      // Use lowercase to avoid React DOM warning
      // @ts-ignore - React types use fetchPriority but DOM expects fetchpriority
      fetchpriority="high"
    />
  );
};

export const AppLogo = memo(AppLogoInner);
