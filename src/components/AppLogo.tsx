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
    ? 'h-6 w-6 sm:h-7 sm:w-7' 
    : size === 'lg' 
      ? 'h-8 w-8 sm:h-9 sm:w-9'
      : 'h-7 w-7 sm:h-8 sm:w-8';

  return (
    <img
      src={appLogo}
      alt="Flowist app logo"
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
