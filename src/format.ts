export const SUPPORTED_CANVAS_FORMATS = ["bgra8unorm", "rgba8unorm"] as const;
export type CanvasFormat = (typeof SUPPORTED_CANVAS_FORMATS)[number];

// Platformun tercihini kabul et, tanımadığımız bir format gelirse güvenli olana düş
export function pickCanvasFormat(preferred: string): CanvasFormat {
  return (SUPPORTED_CANVAS_FORMATS as readonly string[]).includes(preferred)
    ? (preferred as CanvasFormat)
    : "rgba8unorm";
}
