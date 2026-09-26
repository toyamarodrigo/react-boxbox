/**
 * jsdom reports every element as zero by zero, and Recharts measures its container with
 * `getBoundingClientRect()` before it draws anything: without a size the chart renders an empty
 * `<div>` and there are no lines to assert on. Mocking the measurement rather than
 * `ResponsiveContainer` keeps the real component in the test.
 *
 * Call the returned function to put the real measurement back.
 */
export function stubElementSize(width = 640, height = 320): () => void {
  const original = Element.prototype.getBoundingClientRect;
  const rect: DOMRect = {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  Element.prototype.getBoundingClientRect = () => rect;
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}
