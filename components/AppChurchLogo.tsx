import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'official' | 'auto';
  showSubtitle?: boolean;
}

export const AppChurchLogo: React.FC<LogoProps> = ({
  className = 'h-14',
  variant = 'light',
}) => {
  const isDark = variant === 'dark' || variant === 'official';
  const logoSrc = isDark ? '/appchurch-logo-dark.svg' : '/assets/AppChurch Svg.svg';

  return (
    <div
      className={`inline-flex items-center justify-center select-none relative ${className}`}
    >
      <Image
        src={logoSrc}
        alt="AppChurch Logo"
        width={289}
        height={166}
        priority
        unoptimized
        className="w-full h-full max-h-full object-contain drop-shadow-xs"
        referrerPolicy="no-referrer"
        draggable={false}
      />
    </div>
  );
};
