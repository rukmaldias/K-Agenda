import type { SnapshotData } from "../types/snapshot";

export function faceHexFor(snapshot: SnapshotData, todoState: string): string {
  return snapshot.todoKeywords.find((k) => k.name === todoState)?.faceHex ?? "#898781";
}

export function labelFor(snapshot: SnapshotData, todoState: string): string {
  return snapshot.todoKeywords.find((k) => k.name === todoState)?.label ?? todoState;
}

export function isDoneState(snapshot: SnapshotData, todoState: string): boolean {
  return snapshot.todoKeywords.find((k) => k.name === todoState)?.done ?? false;
}

/** Active (not-done) keywords, in their configured sequence order. */
export function activeKeywords(snapshot: SnapshotData) {
  return snapshot.todoKeywords.filter((k) => !k.done);
}
