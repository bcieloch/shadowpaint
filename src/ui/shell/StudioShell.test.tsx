import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTHOR_NAME, IDEA_AUTHOR_NAME, LICENSE_SPDX, REPOSITORY_URL } from '@/core/constants';
import { useLocaleStore } from '@/i18n/localeStore';
import { useEditorStore } from '@/state/editorStore';
import { TooltipProvider } from '@/ui/components/ui/tooltip';
import { StudioShell } from '@/ui/shell/StudioShell';
import { WebGL2Gate } from '@/ui/shell/WebGL2Gate';

describe('StudioShell and WebGL2Gate', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en');
    useEditorStore.getState().setPanelsHidden(false);
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    });
    window.dispatchEvent(new Event('resize'));
  });

  afterEach(() => {
    cleanup();
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
    expect(screen.getByTestId('btn-open-project')).toHaveTextContent('Open');
    expect(screen.getByTestId('btn-save-menu')).toHaveTextContent('Save');

    fireEvent.click(screen.getByTestId('lang-pl'));
    expect(screen.getByTestId('topbar-project-name')).toHaveTextContent('Bez tytułu');
    expect(screen.getByText('Obszar roboczy i narzędzia')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-project')).toHaveTextContent('Otwórz');
    expect(screen.getByTestId('btn-save-menu')).toHaveTextContent('Zapisz');
  });

  it('renders GitHub repository link and author/idea credits in both EN and PL', () => {
    render(
      <TooltipProvider>
        <WebGL2Gate supported>
          <StudioShell />
        </WebGL2Gate>
      </TooltipProvider>,
    );

    const githubLink = screen.getByTestId('link-github');
    expect(githubLink).toHaveAttribute('href', REPOSITORY_URL);
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');

    const statusbarCredits = screen.getByTestId('statusbar-credits');
    expect(statusbarCredits).toHaveTextContent(`Created by ${AUTHOR_NAME}`);
    expect(statusbarCredits).toHaveTextContent(`Idea by ${IDEA_AUTHOR_NAME}`);

    fireEvent.click(screen.getByTestId('btn-about'));
    const aboutPopover = screen.getByTestId('about-popover');
    expect(aboutPopover).toHaveTextContent(AUTHOR_NAME);
    expect(aboutPopover).toHaveTextContent(IDEA_AUTHOR_NAME);
    expect(aboutPopover).toHaveTextContent(LICENSE_SPDX);
    expect(screen.getByTestId('about-github-link')).toHaveAttribute('href', REPOSITORY_URL);

    fireEvent.click(screen.getByTestId('lang-pl'));
    expect(statusbarCredits).toHaveTextContent(`Stworzone przez: ${AUTHOR_NAME}`);
    expect(statusbarCredits).toHaveTextContent(`Pomysł: ${IDEA_AUTHOR_NAME}`);
    expect(aboutPopover).toHaveTextContent(`Stworzone przez: ${AUTHOR_NAME}`);
    expect(aboutPopover).toHaveTextContent(`Pomysł: ${IDEA_AUTHOR_NAME}`);
  });

  it('switches to slide-over drawers below 1024px and restores docked panels at desktop', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 900,
    });
    window.dispatchEvent(new Event('resize'));

    render(
      <TooltipProvider>
        <WebGL2Gate supported>
          <StudioShell />
        </WebGL2Gate>
      </TooltipProvider>,
    );

    expect(screen.getByTestId('btn-toggle-left-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('btn-toggle-right-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-toggle-panels')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace & Tools')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('btn-toggle-left-drawer'));
    expect(screen.getByTestId('left-drawer-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('tool-brush')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('btn-toggle-right-drawer'));
    expect(screen.getByTestId('right-drawer-sheet')).toBeInTheDocument();
  });

  it('toggles docked panels visibility via TopBar panel button', () => {
    render(
      <TooltipProvider>
        <WebGL2Gate supported>
          <StudioShell />
        </WebGL2Gate>
      </TooltipProvider>,
    );

    const toggleBtn = screen.getByTestId('btn-toggle-panels');
    expect(useEditorStore.getState().panelsHidden).toBe(false);
    fireEvent.click(toggleBtn);
    expect(useEditorStore.getState().panelsHidden).toBe(true);
    fireEvent.click(toggleBtn);
    expect(useEditorStore.getState().panelsHidden).toBe(false);
  });
});
