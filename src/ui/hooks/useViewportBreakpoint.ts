import { useEffect, useState } from 'react';
import { getViewportBreakpoint, type ViewportBreakpoint } from '@/core/layout';

function readWindowBreakpoint(): ViewportBreakpoint {
  if (typeof window === 'undefined') return 'desktop';
  return getViewportBreakpoint(window.innerWidth);
}

export function useViewportBreakpoint(): ViewportBreakpoint {
  const [breakpoint, setBreakpoint] = useState<ViewportBreakpoint>(readWindowBreakpoint);

  useEffect(() => {
    const update = () => {
      const next = readWindowBreakpoint();
      setBreakpoint((prev) => (prev === next ? prev : next));
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, []);

  return breakpoint;
}
