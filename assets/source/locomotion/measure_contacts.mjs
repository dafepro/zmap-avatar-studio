/** Measure source FK foot travel; no simulated ground lock or motion correction. */
import fs from "node:fs";

const data = JSON.parse(
  fs.readFileSync(new URL("./source-samples.json", import.meta.url)),
);
const index = (name) => data.joints.findIndex((joint) => joint.name === name);
const point = (sample, name) =>
  sample.positions.slice(index(name) * 3, index(name) * 3 + 3);
const range = (points, axis) => [
  Math.min(...points.map((p) => p[axis])),
  Math.max(...points.map((p) => p[axis])),
];
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    (sorted[Math.floor((sorted.length - 1) / 2)] +
      sorted[Math.ceil((sorted.length - 1) / 2)]) /
    2
  );
};
const output = {
  source: "source-samples.json",
  method:
    "Conservative flat toe contact: both toe-base and toe-end Y between 0 and 0.025m, with their vertical difference <=0.008m. This excludes heel-only contact and toe-off; fractions are not total stance durations. Interval speed requires both bounding samples in contact. Last duplicate loop sample omitted from fractions. Speed is -dz/dt in the in-place source. Ankle travel includes foot roll; planted toe speed is the steadier pace calibration.",
  clips: {},
};
for (const name of ["Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop"]) {
  const clip = data.clips[name],
    samples = clip.samples;
  const measured = { duration: clip.duration, sides: {} };
  for (const side of ["left", "right"]) {
    const contact = samples.map((sample) => {
      const toe = point(sample, side + "Toe")[1],
        end = point(sample, side + "ToeEnd")[1];
      return (
        toe >= 0 &&
        toe <= 0.025 &&
        end >= 0 &&
        end <= 0.025 &&
        Math.abs(toe - end) <= 0.008
      );
    });
    const intervals = [];
    for (let i = 0; i < samples.length - 1; i++)
      if (contact[i] && contact[i + 1]) {
        const dt = samples[i + 1].time - samples[i].time;
        intervals.push({
          startFrame: i,
          endFrame: i + 1,
          ankleSpeed:
            -(
              point(samples[i + 1], side + "Ankle")[2] -
              point(samples[i], side + "Ankle")[2]
            ) / dt,
          toeSpeed:
            -(
              point(samples[i + 1], side + "Toe")[2] -
              point(samples[i], side + "Toe")[2]
            ) / dt,
        });
      }
    measured.sides[side] = {
      flatContactFrames: contact.flatMap((value, i) => (value ? [i] : [])),
      flatContactFraction:
        contact.slice(0, -1).filter(Boolean).length / (samples.length - 1),
      ankleYRange: range(
        samples.map((sample) => point(sample, side + "Ankle")),
        1,
      ),
      ankleZRange: range(
        samples.map((sample) => point(sample, side + "Ankle")),
        2,
      ),
      toeYRange: range(
        samples.map((sample) => point(sample, side + "Toe")),
        1,
      ),
      toeZRange: range(
        samples.map((sample) => point(sample, side + "Toe")),
        2,
      ),
      medianContactAnkleSpeed: median(
        intervals.map((interval) => interval.ankleSpeed),
      ),
      medianContactToeSpeed: median(
        intervals.map((interval) => interval.toeSpeed),
      ),
      contactToeSpeedRange: [
        Math.min(...intervals.map((interval) => interval.toeSpeed)),
        Math.max(...intervals.map((interval) => interval.toeSpeed)),
      ],
      intervals,
    };
  }
  output.clips[name] = measured;
}
function round(value) {
  if (Array.isArray(value)) return value.map(round);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, round(item)]),
    );
  return typeof value === "number" ? +value.toFixed(6) : value;
}
const result = round(output);
fs.writeFileSync(
  new URL("./source-contact-measurements.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
for (const [name, clip] of Object.entries(result.clips))
  console.log(
    name,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(clip.sides).map(([side, value]) => [
          side,
          {
            toePace: value.medianContactToeSpeed,
            flatContactFraction: value.flatContactFraction,
          },
        ]),
      ),
    ),
  );
