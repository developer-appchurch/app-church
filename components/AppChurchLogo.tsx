import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'official' | 'auto';
  showSubtitle?: boolean;
}

export const AppChurchLogo: React.FC<LogoProps> = ({
  className = 'h-12',
  variant = 'light',
}) => {
  let logoSrc = '/logo-oficial-appchurch.png';
  if (variant === 'dark') {
    logoSrc = '/logo-oficial-appchurch-dark.png';
  } else if (variant === 'official') {
    logoSrc = '/logo-oficial-appchurch-black.png';
  }

  return (
    <div className={`inline-flex items-center justify-center select-none relative ${className}`}>
      <Image
        src={logoSrc}
        alt="Logo Oficial App Church"
        width={220}
        height={130}
        priority
        unoptimized
        className="w-full h-full object-contain max-h-full"
        referrerPolicy="no-referrer"
        draggable={false}
      />
    </div>
  );
};




