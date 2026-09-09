import * as THREE from "three";
import type { WieldBehaviorRegistry } from "./wield-runtime.js";

/** Presentation supplied by a consuming simulation; no world force is created here. */
export type FieldToolPresentation = {
  phase:
    | "idle"
    | "reeling"
    | "braced"
    | "charging"
    | "leaping"
    | "impact"
    | "recoiling"
    | "cooldown";
  progress?: number;
  /** Optional accepted simulation clock in seconds; frozen state freezes mechanisms. */
  time?: number;
  /** Accepted event age in seconds. Local button presses cannot create impact feedback. */
  impact?: { id: number; age: number; kind: "rebound" | "boost" | "pulse" };
  /** Current carrier chest pitch in radians, for a level striking plate. */
  carrierPitch?: number;
};

/** The same authored mechanism works in a turntable or in a networked world. */
export function fieldToolBehaviors(
  read?: (itemId: string) => FieldToolPresentation | undefined,
): WieldBehaviorRegistry {
  return Object.fromEntries(
    [
      ["tether-winch", "spool"],
      ["rebound-panel", "impact"],
      ["wake-driver", "piston"],
    ].map(([id, mechanism]) => [
      id,
      {
        requiredAnchors:
          id === "tether-winch"
            ? ["spool", "cable"]
            : id === "rebound-panel"
              ? ["face", "impact"]
              : ["piston", "ground"],
        create(context) {
          const node = context.anchor(mechanism),
            position = node.position.clone(),
            rotation = node.rotation.clone();
          // The panel has a rigid surface, not a translating mechanism. A small face
          // indicator communicates its braced state while keeping all source frames fixed.
          const indicator =
            id === "rebound-panel"
              ? new THREE.Mesh(
                  new THREE.RingGeometry(0.025, 0.036, 12),
                  new THREE.MeshBasicMaterial({
                    color: "#ffc65c",
                    transparent: true,
                    opacity: 0.9,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                  }),
                )
              : undefined;
          if (indicator) {
            indicator.name = "field-panel-ready";
            indicator.userData.wieldEffect = true;
            indicator.userData.comicSkip = true;
            indicator.visible = false;
            context.effects.add(indicator);
          }
          // A shield-sized edge makes the active interception area legible at game
          // scale. These effects share the rigid face frame; neither cuts source hair
          // nor edits a protected grip branch. 120 triangles, including the indicator.
          const field = indicator ? new THREE.Group() : undefined;
          let edge:
            | THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
            | undefined;
          let ripple:
            THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | undefined;
          if (field) {
            field.name = "field-panel-surface";
            field.userData.wieldEffect = true;
            field.userData.comicSkip = true;
            field.visible = false;
            const points = [
              [-0.27, 0.27],
              [0.27, 0.27],
              [0.39, 0.14],
              [0.37, -0.14],
              [0.24, -0.27],
              [-0.24, -0.27],
              [-0.37, -0.14],
              [-0.39, 0.14],
            ];
            const vertices: number[] = [],
              indices: number[] = [];
            for (const [x, y] of points)
              vertices.push(x, y, 0, x * 0.94, y * 0.93, 0);
            for (let i = 0; i < points.length; i++) {
              const a = i * 2,
                b = ((i + 1) % points.length) * 2;
              indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
            edge = new THREE.Mesh(
              new THREE.BufferGeometry()
                .setAttribute(
                  "position",
                  new THREE.Float32BufferAttribute(vertices, 3),
                )
                .setIndex(indices),
              new THREE.MeshBasicMaterial({
                color: "#ffcf69",
                transparent: true,
                opacity: 0.92,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            );
            edge.name = "field-panel-edge";
            const surface = new THREE.Mesh(
              new THREE.CircleGeometry(0.245, 16),
              new THREE.MeshBasicMaterial({
                color: "#77d8ec",
                transparent: true,
                opacity: 0.14,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            );
            surface.scale.x = 1.4;
            surface.position.z = -0.001;
            surface.name = "field-panel-plane";
            ripple = new THREE.Mesh(
              new THREE.RingGeometry(0.89, 1, 32),
              new THREE.MeshBasicMaterial({
                color: "#fff3c1",
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            );
            ripple.name = "field-panel-impact";
            ripple.position.z = 0.003;
            ripple.visible = false;
            field.add(edge, surface, ripple);
            context.effects.add(field);
          }
          const indicatorMatrix = new THREE.Matrix4(),
            offset = new THREE.Matrix4().makeTranslation(0, 0, 0.004);
          let pressed = false,
            elapsed = 0,
            previousAcceptedTime: number | undefined;
          return {
            objectPose(frame) {
              const state = read?.(context.itemId),
                age = state?.impact?.age;
              const kick =
                age !== undefined &&
                Number.isFinite(age) &&
                age >= 0 &&
                age < 0.32
                  ? Math.exp(-age * 12)
                  : 0;
              if (id === "rebound-panel")
                return frame.reducedMotion
                  ? {}
                  : {
                      position: [0, 0, -0.035 * kick],
                      rotation: [-0.04 * kick, 0, 0],
                    };
              if (id === "wake-driver" && state) {
                const pitch =
                  state.carrierPitch !== undefined &&
                  Number.isFinite(state.carrierPitch)
                    ? THREE.MathUtils.clamp(state.carrierPitch, -0.5, 0.5)
                    : 0;
                return { position: [0, 0.012, 0.02], rotation: [-pitch, 0, 0] };
              }
              return {};
            },
            input(event) {
              pressed = event.type === "press";
            },
            update(frame) {
              const state = read?.(context.itemId);
              const active = read
                ? !!state &&
                  [
                    "reeling",
                    "braced",
                    "charging",
                    "leaping",
                    "impact",
                    "recoiling",
                  ].includes(state.phase)
                : pressed;
              let dt = frame.dt;
              if (state?.time !== undefined) {
                dt =
                  Number.isFinite(state.time) &&
                  previousAcceptedTime !== undefined
                    ? THREE.MathUtils.clamp(
                        state.time - previousAcceptedTime,
                        0,
                        0.1,
                      )
                    : 0;
                previousAcceptedTime = Number.isFinite(state.time)
                  ? state.time
                  : undefined;
              } else previousAcceptedTime = undefined;
              elapsed = active && !frame.reducedMotion ? elapsed + dt : 0;
              node.position.copy(position);
              node.rotation.copy(rotation);
              if (indicator) {
                indicator.visible = active;
                if (active) {
                  const face = context.anchor("face");
                  face.updateWorldMatrix(true, false);
                  context.effects.updateWorldMatrix(true, false);
                  indicatorMatrix
                    .copy(context.effects.matrixWorld)
                    .invert()
                    .multiply(face.matrixWorld)
                    .multiply(offset)
                    .decompose(
                      indicator.position,
                      indicator.quaternion,
                      indicator.scale,
                    );
                  indicator.material.opacity = frame.reducedMotion
                    ? 0.9
                    : 0.78 + 0.12 * Math.sin(elapsed * 5);
                }
                if (field && edge && ripple) {
                  field.visible = active;
                  field.position.copy(indicator.position);
                  field.quaternion.copy(indicator.quaternion);
                  field.scale.copy(indicator.scale);
                  const age = state?.impact?.age;
                  const responding =
                    active &&
                    age !== undefined &&
                    Number.isFinite(age) &&
                    age >= 0 &&
                    age < 0.4;
                  edge.material.color.set(responding ? "#fff4c2" : "#ffcf69");
                  edge.material.opacity = responding ? 1 : 0.92;
                  ripple.visible = responding;
                  if (responding) {
                    const radius = frame.reducedMotion
                      ? 0.23
                      : 0.06 + age * 0.62;
                    ripple.scale.set(radius * 1.25, radius, 1);
                    ripple.material.opacity = frame.reducedMotion
                      ? 0.8
                      : 1 - age / 0.4;
                  }
                }
              }
              if (frame.reducedMotion || !active) return;
              if (id === "tether-winch") node.rotation.x += elapsed * 6;
              if (id === "wake-driver") {
                const progress =
                  state?.phase === "impact" ? 1 : state?.progress;
                const amount =
                  progress !== undefined && Number.isFinite(progress)
                    ? THREE.MathUtils.clamp(progress, 0, 1)
                    : 0.5 - 0.5 * Math.cos(elapsed * 9);
                node.position.y -= 0.025 * amount;
              }
            },
            dispose() {
              node.position.copy(position);
              node.rotation.copy(rotation);
              // The controller owns indicator resources and disposes them with effects.
            },
          };
        },
      },
    ]),
  );
}
