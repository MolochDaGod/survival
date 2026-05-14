/**
 * Minimal TypeScript declarations for YUKA 0.7.8
 * Covers only the APIs used by NPCBrain and NPCManager.
 * Extend as needed when new YUKA features are consumed.
 */

declare module 'yuka' {

  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    multiplyScalar(s: number): this;
    length(): number;
    distanceTo(v: Vector3): number;
    normalize(): this;
    clone(): Vector3;
  }

  class Matrix4 {
    elements: number[];
    copy(m: Matrix4): this;
  }

  class GameEntity {
    position:    Vector3;
    rotation:    any;
    scale:       Vector3;
    worldMatrix: Matrix4;
    uuid:        string;
    name:        string;
    active:      boolean;
    neighbors:   GameEntity[];
    update(delta: number): this;
  }

  class MovingEntity extends GameEntity {
    velocity:    Vector3;
    mass:        number;
    maxSpeed:    number;
    maxForce:    number;
  }

  class Vehicle extends MovingEntity {
    steering:    SteeringManager;
    constructor();
    update(delta: number): this;
  }

  class SteeringManager {
    add(behavior: SteeringBehavior): void;
    remove(behavior: SteeringBehavior): void;
  }

  class SteeringBehavior {
    weight:  number;
    active:  boolean;
    calculate(vehicle: Vehicle, force: Vector3, delta: number): void;
  }

  class SeekBehavior extends SteeringBehavior {
    target: Vector3;
    constructor(target?: Vector3);
  }

  class ArriveBehavior extends SteeringBehavior {
    target:         Vector3;
    deceleration:   number;
    tolerance:      number;
    constructor(target?: Vector3, deceleration?: number, tolerance?: number);
  }

  class FleeBehavior extends SteeringBehavior {
    target:    Vector3;
    panicDist: number;
    constructor(target?: Vector3, panicDist?: number);
  }

  class WanderBehavior extends SteeringBehavior {
    radius:   number;
    distance: number;
    jitter:   number;
    constructor();
  }

  class SeparationBehavior extends SteeringBehavior {
    constructor();
  }

  class AlignmentBehavior extends SteeringBehavior {
    constructor();
  }

  class CohesionBehavior extends SteeringBehavior {
    constructor();
  }

  class PursuitBehavior extends SteeringBehavior {
    evader:           MovingEntity | null;
    predictionFactor: number;
    constructor(evader?: MovingEntity | null, predictionFactor?: number);
  }

  class EvadeBehavior extends SteeringBehavior {
    pursuer:          MovingEntity | null;
    predictionFactor: number;
    panicDistance:    number;
    constructor(pursuer?: MovingEntity | null, predictionFactor?: number, panicDistance?: number);
  }

  class InterposeBehavior extends SteeringBehavior {
    agentA: MovingEntity | null;
    agentB: MovingEntity | null;
    constructor(agentA?: MovingEntity | null, agentB?: MovingEntity | null);
  }

  class EntityManager {
    entities: GameEntity[];
    add(entity: GameEntity): this;
    remove(entity: GameEntity): this;
    update(delta: number): this;
    getEntityByName(name: string): GameEntity | null;
  }
}
