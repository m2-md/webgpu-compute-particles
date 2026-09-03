export const WORKGROUP_SIZE = 64;

// dispatchWorkgroups THREAD değil GRUP sayısı ister.
// Son grup dolmasa da başlatılmalı; artan invocation'ları shader eleyecek.
export function workgroupCount(
  particleCount: number,
  size = WORKGROUP_SIZE,
): number {
  if (particleCount <= 0) return 0;
  return Math.ceil(particleCount / size);
}

// Tek bir dispatch boyutunda kaç workgroup'a izin var?
// maxComputeWorkgroupsPerDimension varsayılanı 65535.
export function fitsInOneDispatch(
  particleCount: number,
  size = WORKGROUP_SIZE,
  maxPerDimension = 65535,
): boolean {
  return workgroupCount(particleCount, size) <= maxPerDimension;
}
