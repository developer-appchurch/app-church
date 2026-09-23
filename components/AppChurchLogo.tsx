import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  showSubtitle?: boolean;
}

export const AppChurchLogo: React.FC<LogoProps> = ({
  className = 'h-16',
  variant = 'light',
}) => {
  const isDark = variant === 'dark';
  const textColor = isDark ? '#041e3a' : '#ffffff';

  return (
    <div className={`inline-flex flex-col items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 300 170"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full max-w-full drop-shadow-sm"
        aria-label="Logo Oficial App Church"
      >
        {/* Linha 1: 'app' */}
        <text
          x="150"
          y="70"
          textAnchor="middle"
          fill={textColor}
          style={{
            fontFamily:
              '"Plus Jakarta Sans", "Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '80px',
            fontWeight: 900,
            letterSpacing: '-3.2px',
          }}
        >
          app
        </text>

        {/* Linha 2: 'Church' */}
        <text
          x="150"
          y="150"
          textAnchor="middle"
          fill={textColor}
          style={{
            fontFamily:
              '"Plus Jakarta Sans", "Outfit", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '84px',
            fontWeight: 900,
            letterSpacing: '-3.8px',
          }}
        >
          Church
        </text>
      </svg>
    </div>
  );
};



