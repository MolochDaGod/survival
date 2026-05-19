/**
 * LandVehicleSystem — rideable ground vehicles for the ARPG world.
 *
 * Adapted from uMMORPG REMASTERED's CustomVehicle addon design:
 *   • Multi-seat:  seat 0 = driver (steers), seat 1 = passenger
 *   • Keys:        W/S gas/brake · A/D steering · Space handbrake
 *                  L lights · O auto-forward
 *   • Exit:        E (near vehicle) to board / disembark, H to exit any seat
 *   • Fuel:        drains while throttle applied; engine dies at 0
 *   • Hull HP:     vehicles take damage; onDestroyed fires when HP hits 0
 *   • Terrain:     Y is locked to groundY(x,z) each frame so vehicles hug hills
 *   • Wheels:      4 CylinderGeometry wheels; front pair steers visually,
 *                  all four spin proportional to speed
 *   • Headlights:  two SpotLights toggled with L
 *
 * Mirrors the BoatSystem API so GameEngine can treat both identically:
 *   setPlayer · spawn · attach/detach · update(dt) · isMounted · dispose
 */

import * as THREE from 'three';
import { KEYBINDS } from '../../constants';
import { LAYERS, setLayerRecursive } from '../../Layers';
import { groundY } from '../../GroundSampler';
import type { PlayerController } from '../../PlayerController';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VehicleType = 'car' | 'buggy' | 'cart';

interface VehicleSeat {
    /** 0 = driver (steers), 1+ = passengers. */
    idx: number;
    /** Local-space offset from the vehicle origin. */
    localOffset: THREE.Vector3;
    /** Cosmetic plank/seat mesh — already added to the vehicle group. */
    mesh: THREE.Mesh;
}

export interface LandVehicleOpts {
    id?: string;
    type?: VehicleType;
    position: THREE.Vector3;
    yaw?: number;
    color?: number;
    /** Body color for a two-tone look. Defaults to same as color. */
    accentColor?: number;
    fuelMax?: number;
    hullMaxHP?: number;
    /** 0..1 initial fuel fraction. Default 1. */
    fuelFill?: number;
}

const WHEEL_RADIUS = 0.28;
const MAX_STEER_ANGLE = 0.45; // radians — front wheel visual turn limit
const GROUND_OFFSET = WHEEL_RADIUS + 0.05; // vehicle pivot Y above ground

/** Per-type physics tuning.  Values are close to the uMMORPG car feel. */
const VEHICLE_TUNING = {
    car: {
        maxSpeed: 12,   // m/s forward
        maxReverse: 5,    // m/s backward
        accel: 7,
        brakeForce: 14,
        drag: 0.90, // speed * drag^dt each frame
        hbDrag: 0.30, // handbrake drag multiplier (much higher)
        turnRate: 1.5,  // rad/s at full speed
        fuelDrain: 0.8,  // % per second at full throttle
        hullMaxHP: 300,
        fuelMax: 100,
    },
    buggy: {
        maxSpeed: 16,
        maxReverse: 4,
        accel: 10,
        brakeForce: 18,
        drag: 0.88,
        hbDrag: 0.20,
        turnRate: 2.0,
        fuelDrain: 1.1,
        hullMaxHP: 150,
        fuelMax: 60,
    },
    cart: {
        maxSpeed: 5,
        maxReverse: 2,
        accel: 3,
        brakeForce: 8,
        drag: 0.95,
        hbDrag: 0.50,
        turnRate: 0.9,
        fuelDrain: 0.3,
        hullMaxHP: 100,
        fuelMax: 40,
    },
} as const;

interface Vehicle {
    id: string;
    type: VehicleType;
    group: THREE.Group;
    /** Body mesh — separate from wheels/lights so we can tint it. */
    body: THREE.Mesh;
    /** World-space yaw in radians. */
    yaw: number;
    speed: number;
    autoForward: boolean;
    handbrakeActive: boolean;
    // Tuning (copied from VEHICLE_TUNING at spawn)
    maxSpeed: number;
    maxReverse: number;
    accel: number;
    brakeForce: number;
    drag: number;
    hbDrag: number;
    turnRate: number;
    // Wheels
    wheelFL: THREE.Mesh;
    wheelFR: THREE.Mesh;
    wheelBL: THREE.Mesh;
    wheelBR: THREE.Mesh;
    wheelSpin: number;    // accumulated spin angle (radians)
    steerAngle: number;   // current visual steer angle (radians)
    // Headlights
    headlightsOn: boolean;
    lightL: THREE.SpotLight;
    lightR: THREE.SpotLight;
    lightLTarget: THREE.Object3D;
    lightRTarget: THREE.Object3D;
    // Fuel & health
    fuelLevel: number;
    fuelMax: number;
    fuelDrain: number;    // %/s at full throttle
    hullHP: number;
    hullMaxHP: number;
    // Seats
    seats: VehicleSeat[];
    /** Index of the seat the LOCAL player is currently in (-1 = not mounted). */
    occupiedSeat: number;
}

// ─── System ───────────────────────────────────────────────────────────────────

export class LandVehicleSystem {
    private scene: THREE.Scene;
    private vehicles: Vehicle[] = [];
    private player: PlayerController | null = null;
    /** Id of the vehicle the local player is currently in (null = on foot). */
    private mountedVehicleId: string | null = null;
    private prompt: string | null = null;

    onPrompt: ((label: string | null) => void) | null = null;
    onDestroyed: ((id: string) => void) | null = null;
    onFuelEmpty: ((id: string) => void) | null = null;
    onHullDamage: ((id: string, hp: number, maxHp: number) => void) | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    setPlayer(player: PlayerController): void {
        this.player = player;
    }

    // ── Spawn ──────────────────────────────────────────────────────────────────

    spawn(opts: LandVehicleOpts): string {
        const id = opts.id ?? `vehicle-${this.vehicles.length + 1}`;
        const type = opts.type ?? 'car';
        const tuning = VEHICLE_TUNING[type];
        const bodyColor = opts.color ?? 0x3a6fce;
        const accentColor = opts.accentColor ?? 0x1a2a4a;
        const fuelMax = opts.fuelMax ?? tuning.fuelMax;
        const hpMax = opts.hullMaxHP ?? tuning.hullMaxHP;
        const fuelFill = opts.fuelFill ?? 1.0;

        const group = new THREE.Group();
        group.name = `Vehicle:${id}`;

        // ── Body ─────────────────────────────────────────────────────────
        const bodyGeo = type === 'buggy'
            ? new THREE.BoxGeometry(1.6, 0.6, 3.0)
            : type === 'cart'
                ? new THREE.BoxGeometry(1.4, 0.5, 2.4)
                : new THREE.BoxGeometry(1.7, 0.65, 3.4);

        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, metalness: 0.3 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.6;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Cabin / roof
        if (type !== 'cart') {
            const cabinH = type === 'buggy' ? 0.5 : 0.6;
            const cabinL = type === 'buggy' ? 1.6 : 1.8;
            const cabin = new THREE.Mesh(
                new THREE.BoxGeometry(1.5, cabinH, cabinL),
                new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4, metalness: 0.4 }),
            );
            cabin.position.set(0, 0.6 + cabinH / 2 + 0.3, -0.2);
            cabin.castShadow = true;
            group.add(cabin);
        }

        // Bumpers
        const bumperMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.6, metalness: 0.5 });
        const bumperW = type === 'buggy' ? 1.6 : 1.7;
        [-1, 1].forEach((sign) => {
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(bumperW, 0.2, 0.15), bumperMat);
            bumper.position.set(0, 0.35, sign * (type === 'cart' ? 1.2 : type === 'buggy' ? 1.5 : 1.7));
            group.add(bumper);
        });

        // ── Wheels ─────────────────────────────────────────────────────────
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.1 });
        const hubMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.7 });
        const wheelXOffset = type === 'buggy' ? 0.95 : 0.95;
        const wheelZFront = type === 'cart' ? 0.9 : type === 'buggy' ? 1.1 : 1.2;
        const wheelZBack = type === 'cart' ? -0.9 : type === 'buggy' ? -1.1 : -1.2;

        function makeWheel(): THREE.Mesh {
            // Wheel = tyre cylinder
            const tyre = new THREE.Mesh(
                new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.22, 16),
                wheelMat,
            );
            tyre.rotation.z = Math.PI / 2; // cylinder axis = X axis (wheel rolls forward)
            tyre.castShadow = true;
            // Hub cap
            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.10, 0.10, 0.23, 8),
                hubMat,
            );
            hub.rotation.z = Math.PI / 2;
            tyre.add(hub);
            return tyre;
        }

        const wheelFL = makeWheel(); wheelFL.position.set(-wheelXOffset, WHEEL_RADIUS, wheelZFront); group.add(wheelFL);
        const wheelFR = makeWheel(); wheelFR.position.set(wheelXOffset, WHEEL_RADIUS, wheelZFront); group.add(wheelFR);
        const wheelBL = makeWheel(); wheelBL.position.set(-wheelXOffset, WHEEL_RADIUS, wheelZBack); group.add(wheelBL);
        const wheelBR = makeWheel(); wheelBR.position.set(wheelXOffset, WHEEL_RADIUS, wheelZBack); group.add(wheelBR);

        // ── Seats ──────────────────────────────────────────────────────────
        const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.95 });
        const seatDefs: Array<{ offset: THREE.Vector3; label: string }> = [
            { offset: new THREE.Vector3(0, 1.0, 0.1), label: 'driver' },    // driver
            { offset: new THREE.Vector3(0, 1.0, -0.8), label: 'passenger' }, // rear passenger
        ];
        const seats: VehicleSeat[] = seatDefs.map(({ offset, label }, idx) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.45), seatMat);
            mesh.position.copy(offset).sub(new THREE.Vector3(0, 0.04, 0));
            mesh.name = `Seat:${label}`;
            group.add(mesh);
            return { idx, localOffset: offset.clone(), mesh };
        });

        // Fuel cap (green cylinder — matching uMMORPG description)
        const fuelCap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8),
            new THREE.MeshStandardMaterial({ color: 0x22aa44, roughness: 0.5, emissive: 0x114422 }),
        );
        fuelCap.position.set(0.75, 0.95, 0.3);
        fuelCap.name = 'FuelCap';
        group.add(fuelCap);

        // ── Headlights ────────────────────────────────────────────────────
        const lightL = new THREE.SpotLight(0xfff5e0, 0, 24, Math.PI / 9, 0.25, 1.5);
        const lightR = new THREE.SpotLight(0xfff5e0, 0, 24, Math.PI / 9, 0.25, 1.5);
        const lightLTarget = new THREE.Object3D();
        const lightRTarget = new THREE.Object3D();
        lightL.position.set(-0.6, 0.65, type === 'cart' ? 1.2 : type === 'buggy' ? 1.5 : 1.8);
        lightR.position.set(0.6, 0.65, type === 'cart' ? 1.2 : type === 'buggy' ? 1.5 : 1.8);
        lightLTarget.position.set(-0.6, 0, 15);
        lightRTarget.position.set(0.6, 0, 15);
        lightL.target = lightLTarget;
        lightR.target = lightRTarget;
        group.add(lightL, lightR, lightLTarget, lightRTarget);

        // Headlight lens meshes (cosmetic)
        const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0a0, emissiveIntensity: 0 });
        const lensGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12);
        const lensL = new THREE.Mesh(lensGeo, lensMat.clone()); lensL.name = 'LensL';
        const lensR = new THREE.Mesh(lensGeo, lensMat.clone()); lensR.name = 'LensR';
        lensL.rotation.z = Math.PI / 2;
        lensR.rotation.z = Math.PI / 2;
        lensL.position.copy(lightL.position);
        lensR.position.copy(lightR.position);
        group.add(lensL, lensR);

        // ── Scene placement ──────────────────────────────────────────────
        group.position.copy(opts.position);
        group.position.y = groundY(opts.position.x, opts.position.z) + GROUND_OFFSET;
        group.rotation.y = opts.yaw ?? 0;
        setLayerRecursive(group, LAYERS.WORLD);
        this.scene.add(group);

        this.vehicles.push({
            id,
            type,
            group,
            body,
            yaw: opts.yaw ?? 0,
            speed: 0,
            autoForward: false,
            handbrakeActive: false,
            maxSpeed: tuning.maxSpeed,
            maxReverse: tuning.maxReverse,
            accel: tuning.accel,
            brakeForce: tuning.brakeForce,
            drag: tuning.drag,
            hbDrag: tuning.hbDrag,
            turnRate: tuning.turnRate,
            wheelFL,
            wheelFR,
            wheelBL,
            wheelBR,
            wheelSpin: 0,
            steerAngle: 0,
            headlightsOn: false,
            lightL,
            lightR,
            lightLTarget,
            lightRTarget,
            fuelLevel: fuelMax * fuelFill,
            fuelMax,
            fuelDrain: tuning.fuelDrain,
            hullHP: hpMax,
            hullMaxHP: hpMax,
            seats,
            occupiedSeat: -1,
        });
        return id;
    }

    // ── Mount / dismount ───────────────────────────────────────────────────────

    /**
     * Mount the local player into `vehicleId`.  Prefers the driver seat (0) if
     * empty, otherwise the first available passenger seat.  Blocks boarding
     * passenger seats when nobody is in the driver seat (uMMORPG pattern).
     */
    mount(vehicleId: string): boolean {
        if (!this.player || this.mountedVehicleId) return false;
        const v = this.vehicles.find((x) => x.id === vehicleId);
        if (!v) return false;

        // Choose seat: driver first, then first free passenger
        let seatIdx = -1;
        if (v.occupiedSeat !== 0) {
            seatIdx = 0; // driver seat is free
        } else {
            // Driver is in — try passenger seats
            seatIdx = 1; // currently only 2 seats; extend for more
        }
        if (seatIdx < 0 || seatIdx >= v.seats.length) return false;

        v.occupiedSeat = seatIdx;
        this.mountedVehicleId = vehicleId;
        (this.player as unknown as { mountedBoat: string | null }).mountedBoat = vehicleId;
        return true;
    }

    /**
     * Try to mount the nearest vehicle within `range` metres.
     * Used by the key handler — finds the closest vehicle and calls mount().
     */
    tryMountNearest(range: number = 3.0): boolean {
        if (!this.player) return false;
        const p = this.player.position;
        let nearest: Vehicle | null = null;
        let bestD2 = range * range;
        for (const v of this.vehicles) {
            const dx = v.group.position.x - p.x;
            const dz = v.group.position.z - p.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; nearest = v; }
        }
        if (!nearest) return false;
        return this.mount(nearest.id);
    }

    dismount(): void {
        if (!this.player || !this.mountedVehicleId) return;
        const v = this.vehicles.find((x) => x.id === this.mountedVehicleId);
        if (v) {
            v.occupiedSeat = -1;
            // Place the player beside the driver door
            const side = new THREE.Vector3(-Math.sin(v.yaw + Math.PI / 2), 0, -Math.cos(v.yaw + Math.PI / 2));
            this.player.position.copy(v.group.position).addScaledVector(side, 1.8);
            this.player.position.y = v.group.position.y + 0.2;
        }
        this.mountedVehicleId = null;
        (this.player as unknown as { mountedBoat: string | null }).mountedBoat = null;
        this.player.velocity.set(0, 0, 0);
    }

    /** Force-eject on player death (uMMORPG OnRespawn pattern). */
    ejectOnDeath(): void {
        this.dismount();
    }

    // ── Fuel & damage ──────────────────────────────────────────────────────────

    /** Add fuel to a vehicle (drag-drop from inventory; pass positive amount). */
    refuel(vehicleId: string, amount: number): void {
        const v = this.vehicles.find((x) => x.id === vehicleId);
        if (v) v.fuelLevel = Math.min(v.fuelMax, v.fuelLevel + amount);
    }

    /** Deal damage to the vehicle hull. Returns remaining HP. */
    takeDamage(vehicleId: string, dmg: number): number {
        const v = this.vehicles.find((x) => x.id === vehicleId);
        if (!v) return 0;
        v.hullHP = Math.max(0, v.hullHP - dmg);
        this.onHullDamage?.(vehicleId, v.hullHP, v.hullMaxHP);
        if (v.hullHP === 0) {
            this.onDestroyed?.(vehicleId);
            // Force dismount any occupant
            if (this.mountedVehicleId === vehicleId) this.dismount();
        }
        return v.hullHP;
    }

    // ── Key listeners ──────────────────────────────────────────────────────────

    attach(): void {
        document.addEventListener('keydown', this._onKeyDown);
    }
    detach(): void {
        document.removeEventListener('keydown', this._onKeyDown);
    }

    private _onKeyDown = (e: KeyboardEvent): void => {
        if (e.repeat || !this.player) return;
        const mounted = this.mountedVehicleId;

        // E: board or disembark (same key as doors/boats)
        if (e.code === KEYBINDS.INTERACT) {
            if (mounted) {
                this.dismount();
            } else if (this.prompt) {
                this.tryMountNearest();
            }
            return;
        }

        // H: exit any seat (uMMORPG "stand up from any seat" key)
        if (e.code === 'KeyH' && mounted) {
            this.dismount();
            return;
        }

        // L: toggle headlights
        if (e.code === 'KeyL' && mounted) {
            const v = this.vehicles.find((x) => x.id === mounted);
            if (v) this._setHeadlights(v, !v.headlightsOn);
            return;
        }

        // O: toggle auto-forward
        if (e.code === 'KeyO' && mounted) {
            const v = this.vehicles.find((x) => x.id === mounted);
            if (v) v.autoForward = !v.autoForward;
            return;
        }
    };

    // ── Update loop ────────────────────────────────────────────────────────────

    update(dt: number): void {
        for (const v of this.vehicles) {
            this._updateVehicle(v, dt);
        }
        this._updatePrompt();
    }

    private _updateVehicle(v: Vehicle, dt: number): void {
        const isMounted = this.mountedVehicleId === v.id;
        const isDriver = isMounted && v.occupiedSeat === 0;

        // ── Input (driver seat only) ──────────────────────────────────────
        let throttle = 0;
        let steerInput = 0;
        let braking = false;

        if (isDriver && this.player) {
            const k = this.player.keys;
            const fwd = k['KeyW'] ? 1 : 0;
            const rev = k['KeyS'] ? 1 : 0;
            const fuelOk = v.fuelLevel > 0;

            // Gas / brake
            if (fwd > 0 && fuelOk) throttle = fwd;
            if (rev > 0) {
                if (v.speed > 0.1) braking = true;   // S brakes if moving forward
                else if (fuelOk) throttle = -rev;   // S reverses if already stopped
            }

            // Auto-forward (O key): sustain forward throttle when no input
            if (v.autoForward && throttle === 0 && !braking && fuelOk) throttle = 1;

            steerInput = (k['KeyA'] ? 1 : 0) - (k['KeyD'] ? 1 : 0);
            v.handbrakeActive = !!k['Space'];
        }

        // ── Physics ─────────────────────────────────────────────────────
        const engineOn = Math.abs(throttle) > 0.01 || v.autoForward;

        // Acceleration / braking
        if (braking) {
            v.speed -= Math.sign(v.speed) * v.brakeForce * dt;
            if (Math.abs(v.speed) < 0.05) v.speed = 0;
        } else {
            v.speed += throttle * v.accel * dt;
        }

        // Clamp speed
        v.speed = THREE.MathUtils.clamp(v.speed, -v.maxReverse, v.maxSpeed);

        // Drag (higher when handbrake applied — mimics uMMORPG's Space handbrake)
        const effectiveDrag = v.handbrakeActive ? v.hbDrag : v.drag;
        v.speed *= Math.pow(effectiveDrag, dt);
        if (Math.abs(v.speed) < 0.01) v.speed = 0;

        // Steering: turn rate scales with |speed| so vehicle doesn't spin at rest
        const speedFrac = Math.min(1, Math.abs(v.speed) / v.maxSpeed);
        v.yaw += steerInput * v.turnRate * dt * (0.2 + 0.8 * speedFrac);

        // Integrate position
        v.group.position.x += Math.sin(v.yaw) * v.speed * dt;
        v.group.position.z += Math.cos(v.yaw) * v.speed * dt;

        // Terrain follow — snap Y to ground
        const targetY = groundY(v.group.position.x, v.group.position.z) + GROUND_OFFSET;
        v.group.position.y = THREE.MathUtils.lerp(v.group.position.y, targetY, Math.min(1, dt * 10));
        v.group.rotation.y = v.yaw;

        // ── Fuel drain ──────────────────────────────────────────────────
        if (engineOn && v.fuelLevel > 0) {
            v.fuelLevel = Math.max(0, v.fuelLevel - v.fuelDrain * Math.abs(throttle) * dt);
            if (v.fuelLevel === 0) this.onFuelEmpty?.(v.id);
        }

        // ── Wheel visuals ───────────────────────────────────────────────
        // Spin all four wheels proportional to speed
        v.wheelSpin += v.speed * dt / WHEEL_RADIUS;
        // Front wheels roll on X axis (local)
        v.wheelFL.rotation.x = v.wheelSpin;
        v.wheelFR.rotation.x = v.wheelSpin;
        v.wheelBL.rotation.x = v.wheelSpin;
        v.wheelBR.rotation.x = v.wheelSpin;

        // Steer front wheels visually (Ackermann approximation — both same angle)
        const targetSteer = steerInput * MAX_STEER_ANGLE;
        v.steerAngle = THREE.MathUtils.lerp(v.steerAngle, targetSteer, Math.min(1, dt * 8));
        // Front wheel groups exist as children at known positions.
        // We need to rotate the wheel around its own Y axis for steering.
        // CylinderGeometry wheel axis is Z→X due to initial rotation.z=π/2.
        // Steer = rotation around Y in wheel-parent space.
        v.wheelFL.parent!.children; // already added to group
        // Apply steer to FL and FR by composing rotations on the mesh parent frame.
        // Since the wheels are direct children of group, we can set their rotation:
        v.wheelFL.rotation.set(v.wheelSpin, v.steerAngle, Math.PI / 2);
        v.wheelFR.rotation.set(v.wheelSpin, v.steerAngle, Math.PI / 2);
        v.wheelBL.rotation.set(v.wheelSpin, 0, Math.PI / 2);
        v.wheelBR.rotation.set(v.wheelSpin, 0, Math.PI / 2);

        // ── Headlight targets follow road ───────────────────────────────
        if (v.headlightsOn) {
            const ahead = 15;
            const worldFwd = new THREE.Vector3(Math.sin(v.yaw) * ahead, 0, Math.cos(v.yaw) * ahead);
            v.lightLTarget.position.copy(v.group.position).add(worldFwd);
            v.lightRTarget.position.copy(v.group.position).add(worldFwd);
        }

        // ── Seat sync for local player ───────────────────────────────────
        if (isMounted && this.player) {
            const seat = v.seats[v.occupiedSeat];
            if (seat) {
                // Transform local seat offset to world space
                const worldSeat = seat.localOffset.clone().applyEuler(new THREE.Euler(0, v.yaw, 0, 'YXZ'));
                this.player.position.copy(v.group.position).add(worldSeat);
                this.player.yaw = v.yaw;
            }
        }
    }

    private _setHeadlights(v: Vehicle, on: boolean): void {
        v.headlightsOn = on;
        const intensity = on ? 2.5 : 0;
        v.lightL.intensity = intensity;
        v.lightR.intensity = intensity;
        // Lens emissive glow
        v.group.traverse((o) => {
            if (o.name === 'LensL' || o.name === 'LensR') {
                const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = on ? 1.2 : 0;
            }
        });
    }

    private _updatePrompt(): void {
        if (!this.player) return;
        let label: string | null = null;
        if (this.mountedVehicleId) {
            const v = this.vehicles.find((x) => x.id === this.mountedVehicleId);
            const seatLabel = v?.occupiedSeat === 0 ? 'Driver' : 'Passenger';
            label = `${seatLabel} seat · E/H to disembark · L lights · O auto-fwd`;
        } else {
            const p = this.player.position;
            for (const v of this.vehicles) {
                const dx = v.group.position.x - p.x;
                const dz = v.group.position.z - p.z;
                if (dx * dx + dz * dz < 9) {
                    const driverFree = v.occupiedSeat !== 0;
                    label = driverFree ? 'Press E to Drive' : 'Press E to Ride (Passenger)';
                    break;
                }
            }
        }
        if (label !== this.prompt) {
            this.prompt = label;
            this.onPrompt?.(label);
        }
    }

    // ── Queries ────────────────────────────────────────────────────────────────

    isMounted(): boolean { return this.mountedVehicleId !== null; }
    isDriver(): boolean {
        if (!this.mountedVehicleId) return false;
        return this.vehicles.find((v) => v.id === this.mountedVehicleId)?.occupiedSeat === 0;
    }

    getFuelInfo(vehicleId: string): { level: number; max: number } | null {
        const v = this.vehicles.find((x) => x.id === vehicleId);
        return v ? { level: v.fuelLevel, max: v.fuelMax } : null;
    }

    getHullHP(vehicleId: string): { hp: number; max: number } | null {
        const v = this.vehicles.find((x) => x.id === vehicleId);
        return v ? { hp: v.hullHP, max: v.hullMaxHP } : null;
    }

    // ── Dispose ────────────────────────────────────────────────────────────────

    dispose(): void {
        this.detach();
        for (const v of this.vehicles) {
            this.scene.remove(v.group);
            v.group.traverse((o) => {
                if (o instanceof THREE.Mesh) {
                    o.geometry.dispose();
                    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
                    else (o.material as THREE.Material).dispose();
                }
            });
            v.lightL.dispose();
            v.lightR.dispose();
        }
        this.vehicles = [];
    }
}
