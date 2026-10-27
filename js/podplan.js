// The escape pod (reference files/Station 9 Escape Pod Spec Sheet.png): where it sits in the Escape
// Pod Bay, and its parts. Plain data, no engine, so layout.js, the decor and Node tests can read it.
// It lies lengthwise along the middle of the bay, nose (and door ramp) facing east.

export const POD = {
  center: { x: 7, z: 33 },    // cell (3, 16): the bay is at the far west, a long run from Comms
  length: 4.5, width: 2.2, height: 2.1,
  nose: { x: 1, z: 0 },       // the way the nose points (+x, east)
  rampLength: 1.15,           // the door, open, lies this far out from the nose on the floor
  // The door control ("ESCAPE POD / LAUNCH?"): on the south flank by the nose, facing the walkway.
  panel: { x: 8.35, y: 1.2, z: 34.13, facing: { x: 0, z: 1 } },
  solidCells: [[2, 16], [3, 16], [4, 16]],
};

// The pod's floor footprint (ramp included), for decor and models to keep clear of.
export function podFootprint() {
  const { center: c, length, width, rampLength } = POD;
  return { x0: c.x - length / 2, x1: c.x + length / 2 + rampLength, z0: c.z - width / 2, z1: c.z + width / 2 };
}
