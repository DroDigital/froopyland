import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from './core/math.js';
import { createCharacter } from './render/character.js';
import { WATER_LEVEL } from './world/terrain.js';

const GRAVITY = 22;

/** Third/first-person character controller with jumping, gliding, swimming and bouncing. */
export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.22;
    this.facing = 0;
    this.onGround = false;
    this.view = 'third';
    this.camDist = 7;
    this.model = createCharacter(game.materials.world);
    this.radius = 0.4;
    this.sprinting = false;
    this.gliding = false;
    this.swimming = false;
    this.inWater = false;
    this.inRiver = false;
    this.jumpsLeft = 0;
    this.boosts = {};
    this.camPos = new THREE.Vector3();
    this.camDir = new THREE.Vector3(0, 0, -1);
    this.distance = 0;
    this.lastGround = 0;
    this.bump = new THREE.Vector3();
    this._flow = [0, 0];
  }

  place(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.facing = yaw + Math.PI;
    this.camPos.set(x, y + 3, z + 6);
  }

  update(dt, input, world, allowControl) {
    const g = this.game;
    const fx = world.cfg.effects;
    const sens = g.settings.mouseSensitivity;
    // look
    if (allowControl) {
      this.yaw -= input.lookX * 0.0025 * sens + input.padLookX * 2.6 * dt * sens;
      const dy = input.lookY * 0.0025 * sens + input.padLookY * 2.0 * dt * sens;
      this.pitch -= (g.settings.invertY ? -dy : dy);
      this.pitch = clamp(this.pitch, -1.35, 1.2);
      if (input.zoom) this.camDist = clamp(this.camDist + input.zoom, 2.5, 18);
    }
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let mx = allowControl ? input.moveX : 0, my = allowControl ? input.moveY : 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const wishX = fwdX * my + rightX * mx, wishZ = fwdZ * my + rightZ * mx;
    const wishLen = Math.hypot(wishX, wishZ);

    const rainbow = this.boosts.rainbow > 0;
    this.sprinting = allowControl && input.sprint && wishLen > 0.1;
    let speed = (this.sprinting ? 11 : 6.2) * fx.speedMul * (rainbow ? 1.4 : 1);

    // water state
    const ground = this.groundHeight(world, this.pos.x, this.pos.z, this.pos.y);
    const depth = WATER_LEVEL - ground.h;
    this.inWater = this.pos.y < WATER_LEVEL - 0.3 && depth > 0.3;
    this.swimming = depth > 1.25 && this.pos.y < WATER_LEVEL - 0.6;
    if (this.inWater) speed *= this.swimming ? 0.55 : 0.75;

    // horizontal velocity
    const accel = this.onGround || this.swimming ? 40 : 9;
    const tx = wishX * speed, tz = wishZ * speed;
    this.vel.x = damp(this.vel.x, tx, accel / 6, dt);
    this.vel.z = damp(this.vel.z, tz, accel / 6, dt);

    // river current carries you
    const ev = world.terrain.evaluate(this.pos.x, this.pos.z);
    this.inRiver = this.inWater && ev.river > 0.25;
    if (this.inRiver) {
      world.terrain.flow(this.pos.x, this.pos.z, this._flow);
      const cs = 3.2 * fx.riverMul * ev.river;
      this.pos.x += this._flow[0] * cs * dt;
      this.pos.z += this._flow[1] * cs * dt;
    }

    // jumping
    const grav = GRAVITY * fx.gravityMul * (rainbow ? 0.75 : 1);
    if (allowControl && input.jumpPressed) {
      if (this.onGround) {
        this.vel.y = 9.2 * (rainbow ? 1.2 : 1);
        this.onGround = false;
        this.jumpsLeft = 1;
        g.audio.jump();
      } else if (this.swimming) {
        this.vel.y = 6.5;
      } else if (this.jumpsLeft > 0) {
        this.vel.y = 7.5;
        this.jumpsLeft--;
        g.audio.jump(1.3);
      }
    }
    // gliding: hold jump while falling
    this.gliding = allowControl && !this.onGround && !this.swimming && input.jumpHeld && this.vel.y < 0;
    if (this.swimming) {
      const targetY = WATER_LEVEL - 0.95;
      this.vel.y = damp(this.vel.y, (targetY - this.pos.y) * 4, 6, dt);
      if (allowControl && input.jumpHeld && this.vel.y < 4) this.vel.y += 25 * dt;
    } else {
      this.vel.y -= grav * dt;
      if (this.gliding) {
        this.vel.y = Math.max(this.vel.y, rainbow ? -1.2 : -2.6);
        const gs = rainbow ? 14 : 10.5;
        if (wishLen > 0.1) { this.vel.x = damp(this.vel.x, wishX * gs, 2, dt); this.vel.z = damp(this.vel.z, wishZ * gs, 2, dt); }
      }
      if (this.inWater) this.vel.y = Math.max(this.vel.y, -4);
    }

    // knockback from grumpy residents
    if (this.bump.lengthSq() > 0.01) {
      this.vel.x += this.bump.x; this.vel.z += this.bump.z; this.vel.y = Math.max(this.vel.y, this.bump.y);
      this.onGround = false;
      this.bump.set(0, 0, 0);
    }

    // integrate
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    this.collide(world);

    // containment wall
    const R = world.cfg.radius - 6;
    const dc = Math.hypot(this.pos.x, this.pos.z);
    if (dc > R) {
      const k = R / dc;
      this.pos.x *= k; this.pos.z *= k;
      g.nearWall = 1.5;
    }

    // ground / platforms
    const gnd = this.groundHeight(world, this.pos.x, this.pos.z, prevY);
    if (this.pos.y <= gnd.h) {
      const impact = this.vel.y;
      this.pos.y = gnd.h;
      const plat = gnd.platform;
      const bouncyGround = !plat && fx.bouncyBiome >= 0 && ev.dom === fx.bouncyBiome && !this.inWater;
      if (plat && plat.launch) {
        this.vel.y = plat.launch * (allowControl && input.jumpHeld ? 1.12 : 1);
        this.onGround = false;
        g.audio.boing(0.6);
      } else if ((plat && plat.bounce) || (bouncyGround && impact < -6)) {
        const b = plat ? plat.bounce : 0.8;
        this.vel.y = clamp(-impact * 0.85 * b + 5 + (allowControl && input.jumpHeld ? 4 : 0), 9, 27);
        this.onGround = false;
        this.jumpsLeft = 1;
        g.audio.boing(clamp(-impact / 20, 0.3, 1));
      } else {
        if (impact < -18 && !this.inWater) g.shake = 0.3;
        this.vel.y = 0;
        this.onGround = true;
        this.jumpsLeft = 1;
      }
      this.standing = plat;
    } else {
      this.onGround = this.pos.y - gnd.h < 0.05 && this.vel.y <= 0;
      if (this.onGround) this.pos.y = gnd.h;
      this.standing = null;
    }
    if (this.swimming) this.onGround = false;

    // facing & animation
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5) this.facing = dampAngle(this.facing, Math.atan2(this.vel.x, this.vel.z), 12, dt);
    this.distance += hs * dt;
    for (const k of Object.keys(this.boosts)) this.boosts[k] = Math.max(0, this.boosts[k] - dt);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.model.root.rotation.z = this.gliding ? Math.sin(performance.now() * 0.003) * 0.08 : 0;
    this.model.animate(dt, hs, this.onGround, this.gliding, this.swimming);
    this.model.root.visible = this.view === 'third' || this.camDist < 0;
    this.speedH = hs;
  }

  /** Highest supporting surface under the player: terrain, water bed, or a platform. */
  groundHeight(world, x, z, fromY) {
    let h = world.chunks.heightAt(x, z);
    let platform = null;
    for (const inst of world.landmarks.near(x, z, 40)) {
      for (const p of inst.platforms) {
        if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r && fromY >= p.y - 0.35 && p.y > h) { h = p.y; platform = p; }
      }
    }
    world.chunks.forNear(x, z, (c) => {
      for (const p of c.platforms) {
        if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r && fromY >= p.y - 0.35 && p.y > h) { h = p.y; platform = p; }
      }
    });
    return { h, platform };
  }

  collide(world) {
    const r = this.radius;
    const resolve = (c) => {
      if (this.pos.y > c.y1 - 0.2 || this.pos.y + 1.6 < c.y0) return;
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 1e-4) {
        this.pos.x = c.x + (dx / d) * min;
        this.pos.z = c.z + (dz / d) * min;
      }
    };
    world.chunks.forNear(this.pos.x, this.pos.z, (c) => { for (const col of c.colliders) resolve(col); });
    for (const inst of world.landmarks.near(this.pos.x, this.pos.z, 40)) for (const col of inst.colliders) resolve(col);
  }

  updateCamera(dt, camera, world) {
    const head = new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.camDir.copy(dir);
    if (this.view === 'first') {
      camera.position.copy(head).addScaledVector(dir, 0.25);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camPos.copy(camera.position);
      return;
    }
    // over-the-shoulder framing keeps the crosshair clear of the character
    const target = head.clone().add(new THREE.Vector3(Math.cos(this.yaw) * 0.75, 0.55, -Math.sin(this.yaw) * 0.75));
    const want = target.clone().addScaledVector(dir, -this.camDist);
    // keep camera above terrain along the boom
    for (let i = 1; i <= 4; i++) {
      const p = target.clone().lerp(want, i / 4);
      const gh = world.chunks.heightAt(p.x, p.z) + 0.6;
      if (p.y < gh) want.y += (gh - p.y) * (i / 4) * 1.2;
    }
    const gh = Math.max(world.chunks.heightAt(want.x, want.z), -0.2) + 0.6;
    if (want.y < gh) want.y = gh;
    this.camPos.lerp(want, 1 - Math.exp(-18 * dt));
    camera.position.copy(this.camPos);
    camera.lookAt(target);
  }
}
