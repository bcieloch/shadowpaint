import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '@/i18n/localeStore';
import { TooltipProvider } from '@/ui/components/ui/tooltip';
import { StudioShell } from '@/ui/shell/StudioShell';
import { WebGL2Gate } from '@/ui/shell/WebGL2Gate';

describe('StudioShell and WebGL2Gate', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en');
  });

  it('shows WebGL2 error message when WebGL2 is unavailable', () => {
    render(
      <WebGL2Gate supported={false}>
        <div>studio</div>
      </WebGL2Gate>,
    );
    expect(screen.getByText('WebGL2 is required')).toBeInTheDocument();
    expect(screen.queryByText('studio')).not.toBeInTheDocument();
  });

  it('switches UI language between English and Polish', () => {
    render(
      <TooltipProvider>
        <WebGL2Gate supported>
          <StudioShell />
        </WebGL2Gate>
      </TooltipProvider>,
    );

    expect(screen.getByTestId('topbar-project-name')).toHaveTextContent('Untitled');
    expect(screen.getByText('Workspace & Tools')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lang-pl'));
    expect(screen.getByTestId('topbar-project-name')).toHaveTextContent('Bez tytułu');
    expect(screen.getByText('Obszar roboczy i narzędzia')).toBeInTheDocument();
  });
});
