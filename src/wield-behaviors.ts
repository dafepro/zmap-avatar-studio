import * as THREE from "three";
import type {
  WieldBehaviorRegistry,
  WieldBehaviorContext,
  WieldFrame,
} from "./wield-runtime.js";

/** Approved presentation behaviors. Applications decide what emitted intents do. */
const palette = {
  mint: 0x78d7c4,
  coral: 0xf28570,
  gold: 0xffd66b,
  ink: 0x284348,
};
const materials = (root: THREE.Object3D) => {
  const result: THREE.Material[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !object.userData.comicOutline)
      result.push(
        ...(Array.isArray(object.material)
          ? object.material
          : [object.material]),
      );
  });
  return result;
};
function markEffect(object: THREE.Object3D) {
  object.userData.comicSkip = true;
  object.userData.wieldEffect = true;
  return object;
}
function worldPoint(context: WieldBehaviorContext, name: string) {
  return context.anchor(name).getWorldPosition(new THREE.Vector3());
}

/** Fixed allocation, world-space lifetime; no timers or per-particle objects. */
class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private entries: {
    point: THREE.Vector3;
    velocity: THREE.Vector3;
    age: number;
    life: number;
    size: number;
  }[];
  private cursor = 0;
  private scratch = new THREE.Object3D();
  constructor(
    private parent: THREE.Group,
    count: number,
    bubbles = false,
  ) {
    const geometry = bubbles
      ? new THREE.SphereGeometry(1, 6, 4)
      : new THREE.OctahedronGeometry(1, 0);
    const material = new THREE.MeshBasicMaterial({
      color: bubbles ? 0xbceeea : palette.gold,
      transparent: bubbles,
      opacity: bubbles ? 0.5 : 1,
      depthWrite: !bubbles,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.name = bubbles ? "Wield bubbles" : "Wield confetti";
    markEffect(this.mesh);
    parent.add(this.mesh);
    this.entries = Array.from({ length: count }, () => ({
      point: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      age: 1,
      life: 1,
      size: 0,
    }));
    this.clear();
  }
  add(
    point: THREE.Vector3,
    velocity: THREE.Vector3,
    size: number,
    life: number,
  ) {
    const entry = this.entries[this.cursor++ % this.entries.length];
    entry.point.copy(point);
    entry.velocity.copy(velocity);
    entry.size = size;
    entry.life = life;
    entry.age = 0;
  }
  clear() {
    for (const entry of this.entries) entry.age = entry.life;
    this.draw(0);
  }
  draw(dt: number) {
    this.parent.updateWorldMatrix(true, false);
    let active = 0;
    for (const entry of this.entries) {
      entry.age += dt;
      if (entry.age >= entry.life) continue;
      entry.point.addScaledVector(entry.velocity, dt);
      this.scratch.position.copy(this.parent.worldToLocal(entry.point.clone()));
      const fade = Math.min(1, (entry.life - entry.age) * 4);
      this.scratch.scale.setScalar(entry.size * fade);
      this.scratch.rotation.set(entry.age, entry.age * 0.7, 0);
      this.scratch.updateMatrix();
      this.mesh.setMatrixAt(active++, this.scratch.matrix);
    }
    this.mesh.count = active;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

function bubbleComet(context: WieldBehaviorContext) {
  const pool = new ParticlePool(context.effects, 6, true);
  let credit = 0,
    serial = 0;
  return {
    input(event: { type: string }) {
      if (event.type !== "press") credit = 0;
      if (event.type === "cancel") pool.clear();
    },
    update(frame: WieldFrame) {
      if (frame.reducedMotion) {
        credit = 0;
        pool.clear();
        return;
      }
      if (frame.pressed) {
        credit = Math.min(1, credit + frame.dt * 3.5);
        if (credit >= 1) {
          credit -= 1;
          serial++;
          const origin = worldPoint(context, "emitter"),
            direction = new THREE.Vector3(0, 0, 1).transformDirection(
              context.anchor("emitter").matrixWorld,
            );
          direction
            .multiplyScalar(0.16)
            .add(new THREE.Vector3(Math.sin(serial * 2.4) * 0.025, 0.13, 0));
          pool.add(origin, direction, 0.025 + (serial % 3) * 0.009, 1.45);
          context.emit({ type: "bubble", anchor: "emitter" });
        }
      }
      pool.draw(frame.dt);
    },
    dispose() {
      pool.dispose();
    },
  };
}

function bonkBouquet(context: WieldBehaviorContext) {
  const pool = new ParticlePool(context.effects, 10);
  let clock = 0,
    started = -Infinity,
    impact = false;
  return {
    input(event: { type: string }) {
      if (event.type === "press" && clock - started >= 0.7) {
        started = clock;
        impact = false;
      }
      if (event.type === "cancel") {
        started = -Infinity;
        pool.clear();
      }
    },
    pose(frame: WieldFrame) {
      const phase = (frame.elapsed - started) / 0.55;
      const swing =
        phase >= 0 && phase <= 1 && !frame.reducedMotion
          ? Math.sin(phase * Math.PI)
          : 0;
      return {
        forearm: [-0.65 * swing, 0, 0] as [number, number, number],
        wrist: [0.18 * swing, 0, 0] as [number, number, number],
      };
    },
    update(frame: WieldFrame) {
      clock = frame.elapsed;
      if (!impact && clock - started >= 0.22 && clock - started <= 0.65) {
        impact = true;
        context.emit({ type: "bonk", anchor: "impact", value: 1 });
        if (!frame.reducedMotion) {
          const origin = worldPoint(context, "impact");
          for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI * 0.2;
            pool.add(
              origin,
              new THREE.Vector3(
                Math.cos(angle) * 0.2,
                0.08 + Math.sin(angle) * 0.13,
                0.08,
              ),
              0.016,
              0.55,
            );
          }
        }
      }
      if (frame.reducedMotion) pool.clear();
      else pool.draw(frame.dt);
    },
    dispose() {
      pool.dispose();
    },
  };
}

function fireflyLantern(context: WieldBehaviorContext) {
  const core = context.anchor("core"),
    haloGeometry = new THREE.IcosahedronGeometry(1, 0),
    haloMaterial = new THREE.MeshBasicMaterial({
      color: palette.gold,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      toneMapped: false,
    }),
    halo = new THREE.Mesh(haloGeometry, haloMaterial),
    fireflies = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.009),
      new THREE.MeshBasicMaterial({ color: 0xffed9d, toneMapped: false }),
      3,
    ),
    light = new THREE.PointLight(0xffd477, 0, 0.85, 2),
    dummy = new THREE.Object3D();
  markEffect(halo);
  markEffect(fireflies);
  light.castShadow = false;
  halo.name = "Lantern soft glow";
  fireflies.name = "Lantern fireflies";
  halo.scale.setScalar(0.09);
  fireflies.frustumCulled = false;
  context.effects.add(halo, fireflies, light);
  let lit = false;
  return {
    input(event: { type: string }) {
      if (event.type === "press") {
        lit = !lit;
        context.emit({ type: "light", anchor: "light", value: lit ? 1 : 0 });
      }
    },
    update(frame: WieldFrame) {
      for (const material of materials(core)) {
        const painted = material as THREE.MeshBasicMaterial;
        if (painted.color) painted.color.setHex(lit ? 0xffef9f : 0x8a8460);
      }
      const origin = worldPoint(context, "light");
      context.effects.updateWorldMatrix(true, false);
      halo.position.copy(context.effects.worldToLocal(origin.clone()));
      light.position.copy(halo.position);
      halo.visible = lit;
      light.intensity = lit ? 0.45 : 0;
      fireflies.count = lit ? 3 : 0;
      for (let i = 0; i < 3; i++) {
        const angle =
          (i * Math.PI * 2) / 3 +
          (frame.reducedMotion ? 0 : frame.elapsed * 1.6);
        dummy.position
          .copy(origin)
          .add(
            new THREE.Vector3(
              Math.cos(angle) * 0.115,
              Math.sin(angle * 1.7) * 0.05,
              Math.sin(angle) * 0.115,
            ),
          );
        context.effects.worldToLocal(dummy.position);
        dummy.updateMatrix();
        fireflies.setMatrixAt(i, dummy.matrix);
      }
      fireflies.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const object of [halo, fireflies, light]) object.removeFromParent();
      haloGeometry.dispose();
      haloMaterial.dispose();
      fireflies.geometry.dispose();
      (fireflies.material as THREE.Material).dispose();
      fireflies.dispose();
      light.dispose();
    },
  };
}

function doodleRocket(context: WieldBehaviorContext) {
  const maximum = 32,
    geometry = new THREE.BufferGeometry(),
    positions = new Float32Array(maximum * 2 * 3),
    indices: number[] = [];
  for (let i = 0; i < maximum - 1; i++)
    indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({
      color: palette.mint,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    }),
    ribbon = new THREE.Mesh(geometry, material),
    points: { position: THREE.Vector3; born: number }[] = [];
  markEffect(ribbon);
  ribbon.name = "Temporary doodle ribbon";
  ribbon.frustumCulled = false;
  context.effects.add(ribbon);
  let lastSample = -Infinity;
  return {
    input(event: { type: string }) {
      if (event.type === "press" || event.type === "cancel") {
        points.length = 0;
        geometry.setDrawRange(0, 0);
        lastSample = -Infinity;
      }
    },
    pose(frame: WieldFrame) {
      const motion = frame.pressed && !frame.reducedMotion ? 1 : 0;
      return {
        forearm: [Math.sin(frame.elapsed * 4) * 0.09 * motion, 0, 0] as [
          number,
          number,
          number,
        ],
        wrist: [0, Math.sin(frame.elapsed * 5) * 0.25 * motion, 0] as [
          number,
          number,
          number,
        ],
      };
    },
    update(frame: WieldFrame) {
      while (points.length && frame.elapsed - points[0].born > 1.6)
        points.shift();
      if (frame.reducedMotion) points.length = 0;
      if (
        frame.pressed &&
        !frame.reducedMotion &&
        frame.elapsed - lastSample >= 1 / 24
      ) {
        const position = worldPoint(context, "tip"),
          distance = points.length
            ? position.distanceTo(points.at(-1)!.position)
            : 0;
        if (distance > 0.25) points.length = 0;
        if (!points.length || distance > 0.006) {
          points.push({ position, born: frame.elapsed });
          if (points.length > maximum) points.shift();
          lastSample = frame.elapsed;
          context.emit({ type: "ink-point", anchor: "tip", value: 0.014 });
        }
      }
      context.effects.updateWorldMatrix(true, false);
      for (let i = 0; i < points.length; i++) {
        const direction = points[Math.min(points.length - 1, i + 1)].position
            .clone()
            .sub(points[Math.max(0, i - 1)].position),
          across = new THREE.Vector3().crossVectors(
            direction,
            new THREE.Vector3(0, 1, 0),
          );
        if (across.lengthSq() < 1e-8) across.set(1, 0, 0);
        across.normalize().multiplyScalar(0.007);
        for (let side = 0; side < 2; side++) {
          const point = points[i].position
            .clone()
            .addScaledVector(across, side ? 1 : -1);
          context.effects
            .worldToLocal(point)
            .toArray(positions, (i * 2 + side) * 3);
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.setDrawRange(0, Math.max(0, points.length - 1) * 6);
    },
    dispose() {
      ribbon.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

function whirlPop(context: WieldBehaviorContext) {
  const rotor = context.anchor("rotor"),
    rest = rotor.quaternion.clone(),
    axis = new THREE.Vector3(0, 0, 1),
    turn = new THREE.Quaternion();
  let velocity = 0,
    angle = 0;
  return {
    input(event: { type: string }) {
      if (event.type === "cancel") velocity = 0;
      else
        context.emit({
          type: event.type === "press" ? "spin-start" : "spin-release",
          anchor: "rotor",
        });
    },
    update(frame: WieldFrame) {
      if (frame.reducedMotion) {
        velocity = 0;
        angle = 0;
      } else {
        velocity = frame.pressed
          ? Math.min(14, velocity + frame.dt * 16)
          : velocity * Math.exp(-frame.dt * 2.5);
        angle = (angle + velocity * frame.dt) % (Math.PI * 2);
      }
      rotor.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, angle));
    },
    dispose() {
      rotor.quaternion.copy(rest);
    },
  };
}

/** Applications may add their own trusted factories; manifests never contain code. */
export function playfulWieldBehaviors(): WieldBehaviorRegistry {
  return {
    "bubble-comet": { requiredAnchors: ["emitter"], create: bubbleComet },
    "bonk-bouquet": { requiredAnchors: ["impact"], create: bonkBouquet },
    "firefly-lantern": {
      requiredAnchors: ["light", "core"],
      create: fireflyLantern,
    },
    "doodle-rocket": { requiredAnchors: ["tip"], create: doodleRocket },
    "whirl-pop": { requiredAnchors: ["rotor"], create: whirlPop },
  };
}
