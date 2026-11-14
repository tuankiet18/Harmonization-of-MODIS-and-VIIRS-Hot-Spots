import type { ReactNode } from 'react';

const Svg = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconDownload = () => (
  <Svg>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </Svg>
);
export const IconDraw = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="14" rx="1" strokeDasharray="4 3" />
  </Svg>
);
export const IconCoords = () => (
  <Svg>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconPrev = () => (
  <Svg>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconCalendar = () => (
  <Svg>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);
export const IconNext = () => (
  <Svg>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);

export const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="#17221D" />
    <rect x="6" y="6" width="5.5" height="5.5" rx="1" fill="#FBE6AE" />
    <rect x="13.25" y="6" width="5.5" height="5.5" rx="1" fill="#F29A35" />
    <rect x="20.5" y="6" width="5.5" height="5.5" rx="1" fill="#E0621B" />
    <rect x="6" y="13.25" width="5.5" height="5.5" rx="1" fill="#F29A35" />
    <rect x="13.25" y="13.25" width="5.5" height="5.5" rx="1" fill="#BC380D" />
    <rect x="20.5" y="13.25" width="5.5" height="5.5" rx="1" fill="#F8C566" />
    <rect x="6" y="20.5" width="5.5" height="5.5" rx="1" fill="#4A5750" />
    <rect x="13.25" y="20.5" width="5.5" height="5.5" rx="1" fill="#FBE6AE" />
    <rect x="20.5" y="20.5" width="5.5" height="5.5" rx="1" fill="#4A5750" />
  </svg>
);
export const IconLink = () => (
  <Svg>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const IconOverview = () => (
  <Svg>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="10" width="8" height="11" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
  </Svg>
);
