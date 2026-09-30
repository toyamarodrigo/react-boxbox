import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import {
  BattleCard,
  battleCardLabel,
  battleTrend,
  formatBattleInterval,
  formatBattleTrend,
} from '@/registry/boxbox/ui/battle-card';

const card = () => document.querySelector('[data-slot="battle-card"]');
const part = (slot: string) => document.querySelector(`[data-slot="battle-card-${slot}"]`);
const codes = () =>
  [...document.querySelectorAll('[data-slot="battle-card-car"]')].map((car) =>
    car.getAttribute('data-code'),
  );

const battle = {
  position: 3,
  ahead: { code: 'EVO', color: '#C78B46' },
  behind: { code: 'MSO', color: '#3A7BD5' },
  interval: 0.482,
  trend: -0.3,
} as const;

describe('formatBattleInterval', () => {
  it('prints the interval the way the tower does', () => {
    expect(formatBattleInterval(0.482)).toBe('+0.482');
    expect(formatBattleInterval(1.5)).toBe('+1.500');
    expect(formatBattleInterval(12.34)).toBe('+12.3');
  });

  it('shows a dash for no figure and never runs below zero', () => {
    expect(formatBattleInterval(null)).toBe('—');
    expect(formatBattleInterval(undefined)).toBe('—');
    expect(formatBattleInterval(-0.1)).toBe('+0.000');
  });
});

describe('formatBattleTrend and battleTrend', () => {
  it('prints the change per lap with a true minus while closing', () => {
    expect(formatBattleTrend(-0.3)).toBe('−0.3 s/lap');
    expect(battleTrend(-0.3)).toBe('closing');
  });

  it('prints a plus while the car ahead pulls away', () => {
    expect(formatBattleTrend(0.24)).toBe('+0.2 s/lap');
    expect(battleTrend(0.24)).toBe('pulling-away');
  });

  it('calls anything that rounds to zero steady', () => {
    expect(formatBattleTrend(-0.04)).toBe('0.0 s/lap');
    expect(battleTrend(-0.04)).toBe('steady');
    expect(battleTrend(0.04)).toBe('steady');
  });

  it('shows a dash for no trend', () => {
    expect(formatBattleTrend(null)).toBe('—');
  });
});

describe('battleCardLabel', () => {
  it('reads the whole battle in one sentence', () => {
    expect(battleCardLabel(battle)).toBe(
      'Battle for P3, EVO ahead of MSO, interval 0.482 seconds, closing 0.3 seconds a lap.',
    );
  });

  it('says pulling away and steady in words', () => {
    expect(battleCardLabel({ ...battle, trend: 0.2 })).toMatch(
      /, pulling away 0\.2 seconds a lap\.$/,
    );
    expect(battleCardLabel({ ...battle, trend: 0 })).toMatch(/, interval steady\.$/);
  });

  it('says who overtook whom right after a pass', () => {
    expect(battleCardLabel({ ...battle, overtake: true, trend: null })).toBe(
      'Battle for P3, EVO overtook MSO, interval 0.482 seconds.',
    );
  });

  it('leaves out what it does not know', () => {
    expect(battleCardLabel({ ...battle, interval: null, trend: undefined })).toBe(
      'Battle for P3, EVO ahead of MSO.',
    );
  });
});

describe('BattleCard', () => {
  it('paints both cars ahead first, the positions, the interval and the trend', () => {
    render(<BattleCard {...battle} />);
    expect(card()).toHaveAttribute('data-position', '3');
    expect(card()).toHaveAttribute('data-trend', 'closing');
    expect(card()).toHaveAttribute('data-overtake', 'false');
    expect(codes()).toEqual(['EVO', 'MSO']);
    const places = [...document.querySelectorAll('[data-slot="battle-card-position"]')];
    expect(places.map((place) => place.textContent)).toEqual(['P3', 'P4']);
    expect(part('color')).toHaveStyle({ backgroundColor: '#C78B46' });
    expect(part('interval-figure')).toHaveTextContent('+0.482');
    expect(part('trend-figure')).toHaveTextContent('−0.3 s/lap');
    expect(part('overtake')).toBeNull();
  });

  it('swaps the cars and keeps the positions when the car behind gets past', () => {
    const { rerender } = render(<BattleCard {...battle} />);
    rerender(
      <BattleCard
        position={3}
        ahead={battle.behind}
        behind={battle.ahead}
        interval={0.311}
        trend={null}
        overtake
      />,
    );
    expect(codes()).toEqual(['MSO', 'EVO']);
    const places = [...document.querySelectorAll('[data-slot="battle-card-position"]')];
    expect(places.map((place) => place.textContent)).toEqual(['P3', 'P4']);
    expect(card()).toHaveAttribute('data-overtake', 'true');
    expect(part('overtake')).toHaveTextContent('OVERTAKE');
    expect(card()).not.toHaveAttribute('data-trend');
    expect(part('trend-figure')).toHaveTextContent('—');
  });

  it('reads one sentence and hides everything painted', () => {
    render(<BattleCard {...battle} />);
    expect(
      screen.getByText(
        'Battle for P3, EVO ahead of MSO, interval 0.482 seconds, closing 0.3 seconds a lap.',
      ),
    ).toHaveClass('sr-only');
    for (const slot of ['header', 'cars', 'interval', 'trend']) {
      expect(part(slot)).toHaveAttribute('aria-hidden');
    }
  });

  it('keeps every figure under reduced motion, swaps at once, and leaves at once', async () => {
    const { rerender } = render(
      <MotionConfig reducedMotion="always">
        <AnimatePresence>
          <BattleCard key="battle" {...battle} size="sm" />
        </AnimatePresence>
      </MotionConfig>,
    );
    expect(card()).toHaveAttribute('data-size', 'sm');
    // No wipe: the card is fully drawn from its first frame.
    expect((card() as HTMLElement).style.clipPath).not.toBe('inset(0 100% 0 0)');

    rerender(
      <MotionConfig reducedMotion="always">
        <AnimatePresence>
          <BattleCard
            key="battle"
            {...battle}
            ahead={battle.behind}
            behind={battle.ahead}
            overtake
            size="sm"
          />
        </AnimatePresence>
      </MotionConfig>,
    );
    expect(codes()).toEqual(['MSO', 'EVO']);
    expect((part('overtake') as HTMLElement).style.opacity).not.toBe('0');
    for (const car of document.querySelectorAll<HTMLElement>('[data-slot="battle-card-car"]')) {
      expect(car.style.transform).toBe('');
    }

    rerender(
      <MotionConfig reducedMotion="always">
        <AnimatePresence>{null}</AnimatePresence>
      </MotionConfig>,
    );
    await waitFor(() => expect(card()).toBeNull());
  });

  it('wipes in from the left when it mounts', () => {
    render(<BattleCard {...battle} />);
    expect((card() as HTMLElement).style.clipPath).toBe('inset(0 100% 0 0)');
  });
});
