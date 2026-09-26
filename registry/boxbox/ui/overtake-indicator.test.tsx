import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OvertakeMode, OvertakeState } from '@/registry/boxbox/ui/overtake-indicator';
import { OvertakeIndicator, overtakeAriaLabel } from '@/registry/boxbox/ui/overtake-indicator';

function indicator(container: HTMLElement) {
  return container.querySelector('[data-slot="overtake-indicator"]');
}

describe('overtakeAriaLabel', () => {
  it.each([
    ['drs', 'off', undefined, 'DRS off'],
    ['drs', 'active', undefined, 'DRS active'],
    ['overtake', 'available', undefined, 'Overtake available'],
    ['overtake', 'active', 'PUSH', 'PUSH active'],
  ] as [OvertakeMode, OvertakeState, string | undefined, string][])(
    'names %s in state %s',
    (mode, state, label, expected) => {
      expect(overtakeAriaLabel(mode, state, label)).toBe(expected);
    },
  );
});

describe('OvertakeIndicator', () => {
  it('defaults to DRS off and records mode and state on the root', () => {
    const { container } = render(<OvertakeIndicator />);
    const root = indicator(container);
    expect(root).toHaveAttribute('data-mode', 'drs');
    expect(root).toHaveAttribute('data-state', 'off');
    expect(root).toHaveTextContent('DRS');
  });

  it.each([
    ['drs', 'DRS'],
    ['overtake', 'OVT'],
  ] as [OvertakeMode, string][])('labels %s mode as %s', (mode, expected) => {
    const { container } = render(<OvertakeIndicator mode={mode} />);
    expect(indicator(container)).toHaveTextContent(expected);
  });

  it('paints a custom label instead of the default one', () => {
    const { container } = render(<OvertakeIndicator mode="overtake" label="PUSH" />);
    expect(indicator(container)).toHaveTextContent('PUSH');
    expect(screen.queryByText('OVT')).not.toBeInTheDocument();
  });

  it.each(['off', 'available', 'active'] as OvertakeState[])(
    'records the %s state and speaks it',
    (state) => {
      const { container } = render(<OvertakeIndicator state={state} />);
      const root = indicator(container);
      expect(root).toHaveAttribute('data-state', state);
      expect(root).toHaveAttribute('aria-label', `DRS ${state}`);
    },
  );

  it('names the system rather than the abbreviation in overtake mode', () => {
    const { container } = render(<OvertakeIndicator mode="overtake" state="available" />);
    expect(indicator(container)).toHaveAttribute('aria-label', 'Overtake available');
  });

  it('keeps one label through a change of state', () => {
    const { container, rerender } = render(<OvertakeIndicator state="available" />);
    rerender(<OvertakeIndicator state="active" />);
    expect(container.querySelectorAll('[data-slot="overtake-indicator"]')).toHaveLength(1);
    expect(screen.getAllByText('DRS')).toHaveLength(1);
  });

  it('passes the class name and the rest of the props to the root', () => {
    const { container } = render(<OvertakeIndicator className="mt-1" id="ovt" />);
    const root = indicator(container);
    expect(root).toHaveClass('mt-1');
    expect(root).toHaveAttribute('id', 'ovt');
  });
});
