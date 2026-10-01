import type { SVGProps } from 'react';

/**
 * Lucide-style line icons drawn inline so the bundle ships no icon font.
 * Stroke width is 1.5 to match the Figma source.
 */

const paths: Record<string, React.ReactNode> = {
  'shield-check': (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  'badge-check': (
    <>
      <path d="m8.5 11.5 2.5 2.5 4.5-5" />
      <path d="M12 2.5 14.6 5l3.4-.3.6 3.4 3 1.6-1.5 3 1.5 3-3 1.6-.6 3.4-3.4-.3L12 21.5 9.4 19l-3.4.3-.6-3.4-3-1.6L4 11.3 2.5 8.3l3-1.6L6.1 3.3 9.5 3.6z" />
    </>
  ),
  'layout-dashboard': (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </>
  ),
  'user-round': (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.7 7.7 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.6 6.6 0 0 1 13 0" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.4A6.6 6.6 0 0 1 21.5 20" />
    </>
  ),
  phone: (
    <path d="M6.6 3h3l1.5 4-2 1.4a12.5 12.5 0 0 0 5.5 5.5l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z" />
  ),
  'phone-call': (
    <>
      <path d="M6.6 3h3l1.5 4-2 1.4a12.5 12.5 0 0 0 5.5 5.5l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z" />
      <path d="M15.5 4.5a4.5 4.5 0 0 1 4 4M15.5 7.5a1.6 1.6 0 0 1 1.4 1.4" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </>
  ),
  'log-out': (
    <>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="m15.5 16.5 4.5-4.5-4.5-4.5M20 12H9" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.8A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.4 4.1" />
      <path d="M6.4 7.4A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  'arrow-right': <path d="M4 12h15m-6-6 6 6-6 6" />,
  'arrow-left': <path d="M20 12H5m6-6-6 6 6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.8 2.8L16 9.5" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-down': <path d="m5 9 7 7 7-7" />,
  'chevron-up': <path d="m5 15 7-7 7 7" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  home: (
    <>
      <path d="m3.5 10.5 8.5-7 8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  navigation: <path d="M21 3 3 10.5l8 2.5 2.5 8z" />,
  car: (
    <>
      <path d="M4.5 16.5v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2" />
      <path d="M19.5 16.5v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2" />
      <path d="M3 16.5v-4l2-5.5A2 2 0 0 1 6.9 5.5h10.2a2 2 0 0 1 1.9 1.5l2 5.5v4z" />
      <path d="M3.5 12.5h17" />
      <circle cx="7.5" cy="15" r="1.2" />
      <circle cx="16.5" cy="15" r="1.2" />
    </>
  ),
  'car-front': (
    <>
      <path d="M4 16.5v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2" />
      <path d="M20 16.5v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2" />
      <path d="M3 16.5v-4l2-5.5A2 2 0 0 1 6.9 5.5h10.2a2 2 0 0 1 1.9 1.5l2 5.5v4z" />
      <path d="M7 13.5h.01M17 13.5h.01" />
      <path d="M9 8.5h6" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
      <path d="M12 8v13M12 8S10.5 3.5 8 4.5 9.5 8 12 8zM12 8s1.5-4.5 4-3.5S14.5 8 12 8z" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
      <path d="M16.5 13.5h.01" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  siren: (
    <>
      <path d="M7 17v-5a5 5 0 0 1 10 0v5" />
      <rect x="4" y="17" width="16" height="4" rx="1.5" />
      <path d="M12 3v2M5.6 5.6 7 7M18.4 5.6 17 7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.4 19.5l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.4 11H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.3 2" />
    </>
  ),
  'file-check': (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="m9 14.5 2 2 4-4" />
    </>
  ),
  'trending-up': <path d="M3 17 9.5 10.5l4 4L21 7M15 7h6v6" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  'message-square': <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5.2A8 8 0 1 1 21 12z" />,
  'refresh-cw': (
    <>
      <path d="M20 5.5v5h-5" />
      <path d="M4 18.5v-5h5" />
      <path d="M19.2 10.5a7.5 7.5 0 0 0-13-3.2L4 10.5M4.8 13.5a7.5 7.5 0 0 0 13 3.2L20 13.5" />
    </>
  ),
  wifi: (
    <path d="M2.5 8.5a15 15 0 0 1 19 0M5.5 12.3a10.5 10.5 0 0 1 13 0M8.7 16a6 6 0 0 1 6.6 0M12 19.5h.01" />
  ),
  'wifi-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.7 16a6 6 0 0 1 6.6 0" />
      <path d="M5.5 12.3a10.5 10.5 0 0 1 4-2.4M14.6 10a10.5 10.5 0 0 1 3.9 2.3" />
      <path d="M2.5 8.5a15 15 0 0 1 5-3.1M12.5 5.2a15 15 0 0 1 9 3.3" />
      <path d="M12 19.5h.01" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-2.5 6 2.5 6-2.5v14L15 20l-6-2.5L3 20z" />
      <path d="M9 3.5v14M15 6v14" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M17 4l3 3M14.5 6.5l3 3" />
    </>
  ),
  id: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2.2" />
      <path d="M5.8 16.2a3.6 3.6 0 0 1 6.4 0M15 10h4M15 13.5h3" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4" />
    </>
  ),
  'shield-alert': (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 8v4M12 15.5h.01" />
    </>
  ),
  'route': (
    <>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M15.5 5H10a4 4 0 0 0 0 8h4a4 4 0 0 1 0 8H8.5" />
    </>
  ),
  'power': (
    <>
      <path d="M12 3v9" />
      <path d="M18.4 6.6a8.5 8.5 0 1 1-12.8 0" />
    </>
  ),
  'credit-card': (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h3" />
    </>
  ),
  'life-buoy': (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string;
  size?: number;
}

export function Icon({ name, size = 18, className, ...rest }: IconProps) {
  const content = paths[name];
  if (!content) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {content}
    </svg>
  );
}

export function hasIcon(name: string): boolean {
  return name in paths;
}
