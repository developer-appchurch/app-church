import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export const AppChurchLogo: React.FC<LogoProps> = ({
  className = 'h-16',
  variant = 'light',
}) => {
  const isDark = variant === 'dark';
  const textColor = isDark ? '#052447' : '#ffffff';

  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 240 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-w-[210px]"
        aria-label="AppChurch Logo"
      >
        {/* "app" */}
        <text
          x="120"
          y="44"
          textAnchor="middle"
          fill={textColor}
          style={{
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '46px',
            fontWeight: 800,
            letterSpacing: '-1.5px',
          }}
        >
          app
        </text>
        {/* Subtle dot above or cross accent */}
        <circle cx="178" cy="22" r="5.5" fill="#38bdf8" />
        {/* "Church" */}
        <text
          x="120"
          y="100"
          textAnchor="middle"
          fill={textColor}
          style={{
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '56px',
            fontWeight: 900,
            letterSpacing: '-2px',
          }}
        >
          Church
        </text>
      </svg>
    </div>
  );
};
