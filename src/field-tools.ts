import * as THREE from "three";
import type { WieldBehaviorRegistry } from "./wield-runtime.js";

/** Presentation supplied by a consuming simulation; no world force is created here. */
export type FieldToolPresentation = {
  phase: "idle" | "reeling" | "braced" | "charging" | "cooldown";
  progress?: number;
  /** Optional accepted simulation clock in seconds; frozen state freezes mechanisms. */
  time?: number;
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
          const indicatorMatrix = new THREE.Matrix4(),
            offset = new THREE.Matrix4().makeTranslation(0, 0, 0.004);
          let pressed = false,
            elapsed = 0,
            previousAcceptedTime: number | undefined;
          return {
            input(event) {
              pressed = event.type === "press";
            },
            update(frame) {
              const state = read?.(context.itemId);
              const active = read
                ? !!state &&
                  ["reeling", "braced", "charging"].includes(state.phase)
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
              }
              if (frame.reducedMotion || !active) return;
              if (id === "tether-winch") node.rotation.x += elapsed * 6;
              if (id === "wake-driver") {
                const progress = state?.progress;
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
