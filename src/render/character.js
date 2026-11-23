import * as THREE from 'three';
import { Proto, GEO, mat } from './builder.js';

/** The visitor: a small round explorer with a glowing antenna and a backpack. */
export function createCharacter(material) {
  const root = new THREE.Group();
  const body = new Proto();
  const teal = [0.25, 0.78, 0.82], belly = [0.95, 0.96, 0.9], dark = [0.08, 0.1, 0.16], orange = [1, 0.6, 0.25];
  body.add(GEO.sphereHi, mat({ y: 0.95, sx: 0.48, sy: 0.55, sz: 0.44 }), (x, y, z, lx, ly, lz) => (lz > 0.45 && ly < 0.4 ? belly : teal));
  body.add(GEO.box, mat({ y: 1.0, z: -0.42, sx: 0.55, sy: 0.6, sz: 0.28 }), orange);
  body.add(GEO.box, mat({ y: 1.25, z: -0.42, sx: 0.58, sy: 0.08, sz: 0.3 }), dark);
  // goggles
  body.add(GEO.torus, mat({ x: 0.17, y: 1.2, z: 0.38, sx: 0.14, sy: 0.14, sz: 0.4 }), dark);
  body.add(GEO.torus, mat({ x: -0.17, y: 1.2, z: 0.38, sx: 0.14, sy: 0.14, sz: 0.4 }), dark);
  body.add(GEO.sphere, mat({ x: 0.17, y: 1.2, z: 0.37, sx: 0.12, sy: 0.12, sz: 0.06 }), [0.7, 0.95, 1], { glow: 0.8 });
  body.add(GEO.sphere, mat({ x: -0.17, y: 1.2, z: 0.37, sx: 0.12, sy: 0.12, sz: 0.06 }), [0.7, 0.95, 1], { glow: 0.8 });
  body.add(GEO.box, mat({ y: 1.2, z: 0.36, sx: 0.1, sy: 0.04, sz: 0.04 }), dark);
  body.add(GEO.halfTorus, mat({ y: 0.98, z: 0.42, rz: Math.PI, sx: 0.09, sy: 0.06, sz: 0.06 }), dark);
  body.add(GEO.cyl, mat({ y: 1.45, x: 0.05, rz: -0.25, sx: 0.02, sy: 0.45, sz: 0.02 }), dark);
  body.add(GEO.sphere, mat({ y: 1.9, x: 0.16, sx: 0.08 }), [1, 0.95, 0.4], { glow: 1.5 });
  const bodyMesh = new THREE.Mesh(body.toGeometry(), material);
  bodyMesh.castShadow = true;
  root.add(bodyMesh);
  const legP = new Proto();
  legP.add(GEO.cyl, mat({ y: -0.48, sx: 0.09, sy: 0.48, sz: 0.09 }), dark);
  legP.add(GEO.sphere, mat({ y: -0.48, z: 0.06, sx: 0.13, sy: 0.08, sz: 0.17 }), orange);
  const legGeo = legP.toGeometry();
  const armP = new Proto();
  armP.add(GEO.cyl, mat({ y: -0.4, sx: 0.06, sy: 0.4, sz: 0.06 }), teal);
  armP.add(GEO.sphereLo, mat({ y: -0.42, sx: 0.08 }), belly);
  const armGeo = armP.toGeometry();
  const mk = (g, x, y) => { const m = new THREE.Mesh(g, material); m.position.set(x, y, 0); m.castShadow = true; root.add(m); return m; };
  const legs = [mk(legGeo, 0.18, 0.5), mk(legGeo, -0.18, 0.5)];
  const arms = [mk(armGeo, 0.47, 1.1), mk(armGeo, -0.47, 1.1)];
  arms[0].rotation.z = 0.25; arms[1].rotation.z = -0.25;
  let phase = 0;
  return {
    root,
    animate(dt, speed, onGround, gliding, swimming) {
      phase += dt * (3 + speed * 1.6);
      const amp = onGround ? Math.min(0.9, speed * 0.12) : 0.3;
      legs[0].rotation.x = Math.sin(phase) * amp;
      legs[1].rotation.x = -Math.sin(phase) * amp;
      if (gliding) {
        arms[0].rotation.z = 1.4 + Math.sin(phase * 2) * 0.1; arms[1].rotation.z = -1.4 - Math.sin(phase * 2) * 0.1;
        arms[0].rotation.x = 0; arms[1].rotation.x = 0;
      } else if (swimming) {
        arms[0].rotation.x = Math.sin(phase) * 1.2; arms[1].rotation.x = Math.sin(phase + Math.PI) * 1.2;
        arms[0].rotation.z = 0.5; arms[1].rotation.z = -0.5;
      } else {
        arms[0].rotation.x = -Math.sin(phase) * amp; arms[1].rotation.x = Math.sin(phase) * amp;
        arms[0].rotation.z = 0.25; arms[1].rotation.z = -0.25;
      }
      bodyMesh.position.y = onGround ? Math.abs(Math.sin(phase)) * Math.min(0.08, speed * 0.01) : 0;
    },
  };
}
