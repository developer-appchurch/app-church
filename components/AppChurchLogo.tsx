import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  showSubtitle?: boolean;
}

export const AppChurchLogo: React.FC<LogoProps> = ({
  className = 'h-14',
  variant = 'light',
}) => {
  const isDark = variant === 'dark';
  const textColor = isDark ? '#041e3a' : '#ffffff';

  return (
    <div className={`inline-flex flex-col items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 320 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full max-w-full drop-shadow-sm"
        aria-label="Logo Oficial App Church"
      >
        {/* Linha 1: 'app' */}
        <text
          x="160"
          y="82"
          textAnchor="middle"
          fill={textColor}
          style={{
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Outfit", "Inter", "Segoe UI", Roboto, sans-serif',
            fontSize: '84px',
            fontWeight: 800,
            letterSpacing: '-2px',
          }}
        >
          app
        </text>

        {/* Linha 2: 'Church' */}
        <text
          x="160"
          y="166"
          textAnchor="middle"
          fill={textColor}
          style={{
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Outfit", "Inter", "Segoe UI", Roboto, sans-serif',
            fontSize: '84px',
            fontWeight: 800,
            letterSpacing: '-2.5px',
          }}
        >
          Church
        </text>
      </svg>
    </div>
  );
};


