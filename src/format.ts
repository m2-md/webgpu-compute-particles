export const SUPPORTED_CANVAS_FORMATS = ["bgra8unorm", "rgba8unorm"] as const;
export type CanvasFormat = (typeof SUPPORTED_CANVAS_FORMATS)[number];

// Accept the platform's preference; fall back to the safe one if a format we do not know shows up
export function pickCanvasFormat(preferred: string): CanvasFormat {
  return (SUPPORTED_CANVAS_FORMATS as readonly string[]).includes(preferred)
    ? (preferred as CanvasFormat)
    : "rgba8unorm";
}
