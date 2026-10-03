import type { ReactNode } from 'react';
import styles from './Icon.module.css';

const paths = {
  chevron: <path d="M4 6l4 4 4-4" />,
  up: <path d="M4 10l4-4 4 4" />,
  left: <path d="M10 4l-4 4 4 4" />,
  right: <path d="M6 4l4 4-4 4" />,
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
  logo: (
    <g stroke="none">
      <rect x="1.5" y="7" width="3.5" height="9" rx="1" fill="var(--primary)" />
      <rect x="7.25" y="2" width="3.5" height="14" rx="1" fill="var(--primary)" />
      <rect x="13" y="9.5" width="3.5" height="6.5" rx="1" fill="#7a5a26" />
    </g>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;
export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox={name === 'logo' ? '0 0 18 18' : '0 0 16 16'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
