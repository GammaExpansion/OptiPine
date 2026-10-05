import type { ReactNode, SVGProps } from 'react';
import styles from './Icon.module.css';

const paths = {
  chevron: <path d="M4 6l4 4 4-4" />,
  up: <path d="M4 10l4-4 4 4" />,
  left: <path d="M10 4l-4 4 4 4" />,
  right: <path d="M6 4l4 4-4 4" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  minus: <path d="M3 8h10" />,
  plus: <path d="M8 3v10M3 8h10" />,
  stop: <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" stroke="none" />,
  download: <path d="M8 2v8M4.5 7L8 10.5 11.5 7M2.5 13.5h11" />,
  upload: <path d="M8 10.5v-8M4.5 5.5L8 2l3.5 3.5M2.5 13.5h11" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </>
  ),
  check: <path d="M2.5 6.2l2.4 2.3 4.6-5" strokeWidth="2" />,
  reset: (
    <>
      <path d="M3 8a5 5 0 1 0 1.6-3.7" />
      <path d="M3 2.5V6h3.5" />
    </>
  ),
  marks: (
    <g fill="currentColor" stroke="none">
      <path d="M4 3l3 4.5H1z" />
      <path d="M12 13l-3-4.5h6z" />
    </g>
  ),
  fit: <path d="M2.5 6V2.5H6M13.5 10v3.5H10M10 2.5h3.5V6M6 13.5H2.5V10" />,
  error: (
    <>
      <circle cx="8" cy="8" r="6.5" fill="var(--loss)" stroke="none" />
      <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="var(--panel)" strokeWidth="1.6" />
    </>
  ),
  warning: (
    <>
      <path d="M8 1.8l6.6 11.8H1.4z" fill="var(--primary)" stroke="none" />
      <path d="M8 6.2v3.6" stroke="var(--panel)" strokeWidth="1.6" />
      <circle cx="8" cy="11.6" r="0.9" fill="var(--panel)" stroke="none" />
    </>
  ),
  unsupported: (
    <>
      <circle cx="8" cy="8" r="6" stroke="var(--unsupported)" />
      <path d="M3.9 12.1l8.2-8.2" stroke="var(--unsupported)" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  locate: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M10.5 5.5v-3h-8v8h3" />
    </>
  ),
  spinner: (
    <>
      <circle cx="8" cy="8" r="5.5" stroke="var(--spinner-track)" strokeWidth="2" />
      <path d="M8 2.5A5.5 5.5 0 0 1 13.5 8" stroke="var(--primary)" strokeWidth="2" />
    </>
  ),
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="2" cy="3" r="1" />
      <circle cx="2" cy="8" r="1" />
      <circle cx="2" cy="13" r="1" />
    </g>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" />
    </>
  ),
  play: <path d="M4 2.5v11l9-5.5z" fill="currentColor" stroke="none" />,
  file: (
    <>
      <path d="M4 1.5h5.5L13 5v9.5H4z" />
      <path d="M9.5 1.5V5H13" />
    </>
  ),
  calendar: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
    </>
  ),
  paste: (
    <>
      <rect x="3.5" y="3" width="9" height="11" rx="1.2" />
      <path d="M6 3V1.8h4V3M6 7h4M6 10h4" />
    </>
  ),
  maximize: (
    <>
      <path d="M4 10l4-4 4 4" />
      <path d="M3 3.5h10" />
    </>
  ),
  panel: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M10 2.5v11" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7v4" />
      <circle cx="8" cy="4.5" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  // GitHub's mark: Octicons mark-github-16 (@primer/octicons 19.15.1), MIT License,
  // Copyright (c) 2025 GitHub Inc. The licenses dialog and notices credit it.
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
    />
  ),
  logo: (
    <g stroke="none">
      <rect x="1.5" y="7" width="3.5" height="9" rx="1" fill="var(--primary)" />
      <rect x="7.25" y="2" width="3.5" height="14" rx="1" fill="var(--primary)" />
      <rect x="13" y="9.5" width="3.5" height="6.5" rx="1" fill="var(--logo-muted)" />
    </g>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;
export const iconNames = Object.keys(paths) as IconName[];
export function Icon({
  name,
  size = 14,
  label,
  className = '',
  ...props
}: Omit<SVGProps<SVGSVGElement>, 'name'> & { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      {...props}
      className={`${styles.icon} ${name === 'spinner' ? styles.spinner : ''} ${className}`}
      width={name === 'grip' ? size / 4 : size}
      height={size}
      viewBox={
        name === 'logo'
          ? '0 0 18 18'
          : name === 'check'
            ? '0 0 12 12'
            : name === 'grip'
              ? '0 0 4 16'
              : '0 0 16 16'
      }
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
