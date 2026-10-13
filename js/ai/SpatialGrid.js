/**
 * SpatialGrid.js
 * O(1) 2D Spatial Hash Grid on the XZ plane for high-performance proximity queries,
 * melee/lance hit detection, arrow collision checks, and anti-clumping separation steering.
 */
export class SpatialGrid {
  /**
   * @param {number} cellSize - Size of each grid cell in world meters (default 6m)
   */
  constructor(cellSize = 6) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cells = new Map();
    this._queryBuffer = [];
  }

  /**
   * Clears all cells at the start of a frame before re-inserting active units.
   */
  clear() {
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
    }
  }

  /**
   * Computes integer hash key for cell coordinates (cx, cz).
   */
  _key(cx, cz) {
    return ((cx & 0xffff) << 16) | (cz & 0xffff);
  }

  /**
   * Inserts an entity with world position `entity.position` (or `entity.root.position`).
   * @param {object} entity
   */
  insert(entity) {
    if (!entity || entity.dead) return;
    const pos = entity.position || (entity.root && entity.root.position);
    if (!pos) return;
    const cx = Math.floor(pos.x * this.invCellSize);
    const cz = Math.floor(pos.z * this.invCellSize);
    const key = this._key(cx, cz);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(entity);
  }

  /**
   * Queries all active entities within `radius` meters of `(x, z)`.
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @param {Function} [filterFn]
   * @returns {Array<object>}
   */
  queryRadius(x, z, radius, filterFn = null) {
    const results = [];
    const rSq = radius * radius;
    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCz = Math.floor((z - radius) * this.invCellSize);
    const maxCz = Math.floor((z + radius) * this.invCellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.cells.get(this._key(cx, cz));
        if (!bucket || bucket.length === 0) continue;
        for (let i = 0; i < bucket.length; i++) {
          const ent = bucket[i];
          if (ent.dead) continue;
          if (filterFn && !filterFn(ent)) continue;
          const pos = ent.position || ent.root.position;
          const dx = pos.x - x;
          const dz = pos.z - z;
          if (dx * dx + dz * dz <= rSq) {
            results.push(ent);
          }
        }
      }
    }
    return results;
  }

  /**
   * Finds the single nearest entity within `maxRadius` matching `filterFn`.
   * @param {number} x
   * @param {number} z
   * @param {number} maxRadius
   * @param {Function} [filterFn]
   * @returns {object|null}
   */
  findNearest(x, z, maxRadius, filterFn = null) {
    let best = null;
    let bestDistSq = maxRadius * maxRadius;

    const minCx = Math.floor((x - maxRadius) * this.invCellSize);
    const maxCx = Math.floor((x + maxRadius) * this.invCellSize);
    const minCz = Math.floor((z - maxRadius) * this.invCellSize);
    const maxCz = Math.floor((z + maxRadius) * this.invCellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.cells.get(this._key(cx, cz));
        if (!bucket || bucket.length === 0) continue;
        for (let i = 0; i < bucket.length; i++) {
          const ent = bucket[i];
          if (ent.dead) continue;
          if (filterFn && !filterFn(ent)) continue;
          const pos = ent.position || ent.root.position;
          const dx = pos.x - x;
          const dz = pos.z - z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            best = ent;
          }
        }
      }
    }
    return best;
  }

  /**
   * Computes smooth anti-clumping separation vector `(sepX, sepZ)` for a unit.
   * @param {object} selfUnit
   * @param {number} desiredSeparation
   * @returns {{ x: number, z: number }}
   */
  computeSeparation(selfUnit, desiredSeparation = 1.65) {
    const pos = selfUnit.position || selfUnit.root.position;
    const x = pos.x;
    const z = pos.z;
    const minCx = Math.floor((x - desiredSeparation) * this.invCellSize);
    const maxCx = Math.floor((x + desiredSeparation) * this.invCellSize);
    const minCz = Math.floor((z - desiredSeparation) * this.invCellSize);
    const maxCz = Math.floor((z + desiredSeparation) * this.invCellSize);

    let sepX = 0;
    let sepZ = 0;
    let count = 0;
    const sepSq = desiredSeparation * desiredSeparation;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.cells.get(this._key(cx, cz));
        if (!bucket || bucket.length === 0) continue;
        for (let i = 0; i < bucket.length; i++) {
          const other = bucket[i];
          if (other === selfUnit || other.dead) continue;
          const opos = other.position || other.root.position;
          const dx = x - opos.x;
          const dz = z - opos.z;
          const dSq = dx * dx + dz * dz;
          if (dSq > 0.0001 && dSq < sepSq) {
            const dist = Math.sqrt(dSq);
            const strength = (desiredSeparation - dist) / desiredSeparation;
            sepX += (dx / dist) * strength;
            sepZ += (dz / dist) * strength;
            count++;
          }
        }
      }
    }

    if (count > 0) {
      sepX /= count;
      sepZ /= count;
    }
    return { x: sepX, z: sepZ };
  }
}
