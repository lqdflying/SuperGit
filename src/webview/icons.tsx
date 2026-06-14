import type { CSSProperties, ReactElement } from "react";
import { useThemeColors } from "./ThemeProvider";

export type IconName =
  | "branch"
  | "commit"
  | "history"
  | "tag"
  | "merge"
  | "remote"
  | "search"
  | "filter"
  | "refresh"
  | "push"
  | "pull"
  | "fetch"
  | "graph"
  | "calendar"
  | "chevLeft"
  | "chevRight"
  | "check"
  | "up"
  | "down"
  | "x"
  | "copy"
  | "plus"
  | "trash"
  | "defaultBranch";

interface IconProps {
  type: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Icon({ type, size = 14, color, style }: IconProps): ReactElement {
  const theme = useThemeColors();
  const strokeColor = color ?? theme.fgDim;
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: strokeColor,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { flexShrink: 0, display: "block", ...style }
  };

  const icons: Record<IconName, ReactElement> = {
    branch: (
      <>
        <line x1="6" y1="3" x2="6" y2="10" />
        <circle cx="6" cy="12" r="1.5" />
        <circle cx="6" cy="3" r="1.5" />
        <path d="M6 5C6 7 10 7 10 9" />
        <circle cx="10" cy="10.5" r="1.5" />
      </>
    ),
    commit: (
      <>
        <circle cx="8" cy="8" r="3" />
        <line x1="8" y1="1" x2="8" y2="5" />
        <line x1="8" y1="11" x2="8" y2="15" />
      </>
    ),
    history: (
      <>
        <line x1="2" y1="4" x2="14" y2="4" />
        <line x1="2" y1="8" x2="14" y2="8" />
        <line x1="2" y1="12" x2="14" y2="12" />
        <circle cx="5" cy="4" r="1.2" fill={strokeColor} />
        <circle cx="10" cy="8" r="1.2" fill={strokeColor} />
        <circle cx="7" cy="12" r="1.2" fill={strokeColor} />
      </>
    ),
    tag: (
      <>
        <path d="M2 8.5V3.5a1 1 0 011-1h5l5.5 5.5a1 1 0 010 1.41L9.41 13.5a1 1 0 01-1.41 0L2 8.5z" />
        <circle cx="5.5" cy="5.5" r="1" fill={strokeColor} />
      </>
    ),
    merge: (
      <>
        <circle cx="4" cy="4" r="1.5" />
        <circle cx="12" cy="4" r="1.5" />
        <circle cx="8" cy="13" r="1.5" />
        <path d="M4 5.5V8c0 2 2 3.5 4 3.5m4-6V8c0 2-2 3.5-4 3.5" />
      </>
    ),
    remote: (
      <>
        <circle cx="8" cy="3" r="2" />
        <path d="M3 13c0-3 2-5 5-5s5 2 5 5" />
      </>
    ),
    search: (
      <>
        <circle cx="7" cy="7" r="4" />
        <line x1="10" y1="10" x2="14" y2="14" />
      </>
    ),
    filter: (
      <>
        <path d="M2 3h12M4 7h8M6 11h4" />
      </>
    ),
    refresh: (
      <>
        <path d="M2 8a6 6 0 0111-3M14 8a6 6 0 01-11 3" />
        <polyline points="2,3 2,8 7,8" />
        <polyline points="14,13 14,8 9,8" />
      </>
    ),
    push: (
      <>
        <line x1="8" y1="14" x2="8" y2="3" />
        <polyline points="4,6 8,2 12,6" />
      </>
    ),
    pull: (
      <>
        <line x1="8" y1="2" x2="8" y2="13" />
        <polyline points="4,10 8,14 12,10" />
      </>
    ),
    fetch: (
      <>
        <circle cx="8" cy="4" r="2" />
        <line x1="8" y1="6" x2="8" y2="13" />
        <polyline points="5,10 8,13 11,10" />
      </>
    ),
    graph: (
      <>
        <circle cx="4" cy="4" r="1.5" />
        <circle cx="12" cy="8" r="1.5" />
        <circle cx="4" cy="12" r="1.5" />
        <line x1="4" y1="5.5" x2="4" y2="10.5" />
        <path d="M5.2 5L10.8 7" />
      </>
    ),
    calendar: (
      <>
        <rect x="2" y="3" width="12" height="11" rx="1" />
        <line x1="2" y1="7" x2="14" y2="7" />
        <line x1="5" y1="1" x2="5" y2="4" />
        <line x1="11" y1="1" x2="11" y2="4" />
      </>
    ),
    chevLeft: <polyline points="10,3 5,8 10,13" />,
    chevRight: <polyline points="6,3 11,8 6,13" />,
    check: <polyline points="3,8 7,12 13,4" />,
    up: <polyline points="4,10 8,5 12,10" />,
    down: <polyline points="4,6 8,11 12,6" />,
    x: (
      <>
        <line x1="4" y1="4" x2="12" y2="12" />
        <line x1="12" y1="4" x2="4" y2="12" />
      </>
    ),
    copy: (
      <>
        <rect x="5" y="5" width="8" height="8" rx="1" />
        <path d="M3 10V3h7" />
      </>
    ),
    plus: (
      <>
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
      </>
    ),
    trash: (
      <>
        <path d="M3 5h10" />
        <path d="M5 5V4a1 1 0 011-1h4a1 1 0 011 1v1" />
        <path d="M6 8v4M10 8v4" />
        <path d="M4 5l.5 8a1 1 0 001 1h5a1 1 0 001-1L12 5" />
      </>
    ),
    defaultBranch: (
      <>
        <path
          d="M8 2.5l1.45 2.94 3.24.47-2.34 2.28.55 3.23L8 9.88 5.1 11.42l.55-3.23L3.31 5.91l3.24-.47L8 2.5z"
          fill={strokeColor}
          fillOpacity={0.22}
        />
        <path d="M8 2.5l1.45 2.94 3.24.47-2.34 2.28.55 3.23L8 9.88 5.1 11.42l.55-3.23L3.31 5.91l3.24-.47L8 2.5z" />
      </>
    )
  };

  return <svg {...p}>{icons[type]}</svg>;
}
