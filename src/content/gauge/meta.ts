import type { ComponentMeta } from '../types';

const meta = {
  slug: 'gauge',
  name: 'Gauge',
  category: 'broadcast',
  description:
    'The engine widget: revolutions as an arc round the gear the car is in, turning red past the redline.',
  registryName: 'gauge',
  dependencies: ['motion'],
  status: 'stable',
  notes: [
    'The demo is driven by a fictional engine model, not by telemetry: revolutions climb through each gear, the box shifts up near the limiter and comes back down under braking. The Replay page runs on lap-time data, which carries no engine speed or gear, so this item never appears there.',
    'The arc is one `strokeDashoffset` transition on the tick duration, with no layout animation and no spring, because a gauge is fed many times a second. The gear rolls with the shared Rolling Number, upward on an upshift and downward on a downshift; neutral and reverse are plain text. Under reduced motion the arc jumps straight to its new length and the redline still reads as the colour change.',
    'The drawing is hidden from assistive technology behind one spoken sentence, `Gear 6, 11,200 rpm`, with `redline` added past the threshold. Like the Speed Trap, it is not a live region: a value changing twenty times a second must not be announced. Leave that to the page.',
  ],
} satisfies ComponentMeta;

export default meta;
