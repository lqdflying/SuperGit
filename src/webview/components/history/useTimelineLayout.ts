import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeDayWidth,
  computeLx,
  computeSvgWidth,
  DEFAULT_CONTAINER_WIDTH,
  shouldShowHashLabels,
  shouldShowRemoteMarkers
} from "./timelineLayout";

export function useTimelineLayout(totalDays: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(DEFAULT_CONTAINER_WIDTH);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      setContainerW(element.clientWidth || DEFAULT_CONTAINER_WIDTH);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const dayWidth = useMemo(() => computeDayWidth(containerW, totalDays), [containerW, totalDays]);
  const svgWidth = useMemo(() => computeSvgWidth(containerW), [containerW]);
  const lx = useMemo(() => {
    return (day: number, rangeStart = 0) => computeLx(day, rangeStart, dayWidth);
  }, [dayWidth]);

  return {
    containerRef,
    containerW,
    dayWidth,
    svgWidth,
    lx,
    showHashLabels: shouldShowHashLabels(dayWidth),
    showRemoteMarkers: shouldShowRemoteMarkers(dayWidth)
  };
}
