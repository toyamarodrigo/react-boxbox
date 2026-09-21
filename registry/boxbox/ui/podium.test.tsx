import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Driver, Team } from '@/registry/boxbox/lib/types';
import {
  Podium,
  type PodiumSteps,
  podiumEntryAt,
  podiumStepDelay,
} from '@/registry/boxbox/ui/podium';

const teams: Team[] = [
  { id: 'red', name: 'Aster Forge', color: '#C78B46' },
  { id: 'blue', name: 'Quartz Vale', color: '#8146A8' },
  { id: 'green', name: 'Bracken Arc', color: '#698F70' },
];

const drivers: Driver[] = [
  { id: 'one', code: 'AAA', number: 1, firstName: 'Ada', lastName: 'One', teamId: 'red' },
  { id: 'two', code: 'BBB', number: 2, firstName: 'Bea', lastName: 'Two', teamId: 'blue' },
  { id: 'three', code: 'CCC', number: 3, firstName: 'Cid', lastName: 'Tri', teamId: 'green' },
];

const steps: PodiumSteps = [
  { driver: drivers[0]!, team: teams[0]!, detail: '1:32:04.117' },
  { driver: drivers[1]!, team: teams[1]!, detail: '+4.512' },
  { driver: drivers[2]!, team: teams[2]! },
];

describe('podiumEntryAt', () => {
  it('reads the tuple as P1, P2, P3', () => {
    expect(podiumEntryAt(steps, 1).driver.code).toBe('AAA');
    expect(podiumEntryAt(steps, 2).driver.code).toBe('BBB');
    expect(podiumEntryAt(steps, 3).driver.code).toBe('CCC');
  });
});

describe('podiumStepDelay', () => {
  it('rises last place first, so P1 waits the longest', () => {
    expect(podiumStepDelay(3)).toBe(0);
    expect(podiumStepDelay(2)).toBeGreaterThan(podiumStepDelay(3));
    expect(podiumStepDelay(1)).toBeGreaterThan(podiumStepDelay(2));
  });
});

describe('Podium', () => {
  it('renders three steps laid out as 2, 1, 3', () => {
    const { container } = render(<Podium steps={steps} />);
    const root = container.querySelector('[data-slot="podium"]');
    expect(root).toHaveAttribute('data-size', 'md');
    expect(root).toHaveAttribute('role', 'list');
    const rendered = [...container.querySelectorAll('[data-slot="podium-step"]')];
    expect(rendered.map((step) => step.getAttribute('data-position'))).toEqual(['2', '1', '3']);
    expect(rendered.every((step) => step.getAttribute('role') === 'listitem')).toBe(true);
  });

  it('shows the driver code, the name, and the detail when there is one', () => {
    const { container } = render(<Podium steps={steps} />);
    expect(screen.getByText('AAA')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="podium-step-detail"]')).toHaveLength(2);
    expect(container.querySelector('[data-slot="podium-step-detail"]')).toHaveTextContent('+4.512');
  });

  it('paints each step with its team colour', () => {
    const { container } = render(<Podium steps={steps} />);
    const blocks = [...container.querySelectorAll('[data-slot="podium-step-block"]')];
    expect(blocks[1]).toHaveStyle({ borderColor: '#C78B46' });
  });

  it('speaks the place, the driver, and the team once per step', () => {
    render(<Podium steps={steps} />);
    expect(screen.getByText('1st, Ada One, Aster Forge')).toBeInTheDocument();
    expect(screen.getByText('2nd, Bea Two, Quartz Vale')).toBeInTheDocument();
    expect(screen.getByText('3rd, Cid Tri, Bracken Arc')).toBeInTheDocument();
  });

  it('carries the size onto the root', () => {
    const { container } = render(<Podium steps={steps} size="lg" />);
    expect(container.querySelector('[data-slot="podium"]')).toHaveAttribute('data-size', 'lg');
  });

  it('renders nothing when it is not visible', () => {
    const { container } = render(<Podium steps={steps} visible={false} />);
    expect(container.querySelector('[data-slot="podium"]')).toBeNull();
    expect(container.querySelectorAll('[data-slot="podium-step"]')).toHaveLength(0);
  });

  it('replaces the default step with renderStep', () => {
    const { container } = render(
      <Podium
        steps={steps}
        renderStep={({ entry, position }) => (
          <div data-slot="custom-step">{`${position}:${entry.driver.code}:${entry.team.name}`}</div>
        )}
      />,
    );
    expect(container.querySelectorAll('[data-slot="podium-step"]')).toHaveLength(0);
    const custom = [...container.querySelectorAll('[data-slot="custom-step"]')];
    expect(custom.map((step) => step.textContent)).toEqual([
      '2:BBB:Quartz Vale',
      '1:AAA:Aster Forge',
      '3:CCC:Bracken Arc',
    ]);
  });
});
