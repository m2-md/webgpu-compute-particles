export function describeAdapter(adapter: GPUAdapter): string {
  const info = adapter.info;
  if (!info) return "unknown";
  const parts = [info.vendor, info.architecture, info.device].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  return parts.length > 0
    ? parts.join(" ")
    : (info.description ?? "unknown");
}
