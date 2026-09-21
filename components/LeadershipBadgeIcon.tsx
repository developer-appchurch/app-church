import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

export const LeadershipBadgeIcon: React.FC<IconProps> = ({
  className = 'w-7 h-7 text-[#0e3056]',
  size = 28,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Notebook/badge outer frame with rounded corners */}
      <rect x="7" y="3" width="20" height="26" rx="4" ry="4" stroke="currentColor" fill="none" />
      {/* Binding rings / side tabs on the left */}
      <line x1="4" y1="8" x2="7" y2="8" stroke="currentColor" strokeWidth="2.4" />
      <line x1="4" y1="14" x2="7" y2="14" stroke="currentColor" strokeWidth="2.4" />
      <line x1="4" y1="20" x2="7" y2="20" stroke="currentColor" strokeWidth="2.4" />
      <line x1="4" y1="26" x2="7" y2="26" stroke="currentColor" strokeWidth="2.4" />
      {/* User profile head */}
      <circle cx="17" cy="11" r="3.2" stroke="currentColor" fill="none" />
      {/* User profile shoulder arc */}
      <path d="M12 21 C12 17.5, 22 17.5, 22 21" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
};
