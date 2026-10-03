import type { Asset } from "../src/core";
export function loadCapsuleParts(
  directory: string,
  baseIds?: string[],
): Promise<Asset[]>;
