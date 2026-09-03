export const WORKGROUP_SIZE = 64;

// dispatchWorkgroups wants the number of GROUPS, not THREADS.
// The last group must be launched even if it is not full; the shader discards the surplus invocations.
export function workgroupCount(
  particleCount: number,
  size = WORKGROUP_SIZE,
): number {
  if (particleCount <= 0) return 0;
  return Math.ceil(particleCount / size);
}

// How many workgroups are allowed in a single dispatch dimension?
// maxComputeWorkgroupsPerDimension defaults to 65535.
export function fitsInOneDispatch(
  particleCount: number,
  size = WORKGROUP_SIZE,
  maxPerDimension = 65535,
): boolean {
  return workgroupCount(particleCount, size) <= maxPerDimension;
}
