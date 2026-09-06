import * as THREE from 'three';

export const FIXED_CAMERA_NEAR = 0.001;
export const FIXED_CAMERA_FAR = 10_000_000;

/** Restore the viewer's fixed clip range after fitting or resetting a camera. */
export function applyFixedClipPlanes(camera: THREE.PerspectiveCamera): void {
  camera.near = FIXED_CAMERA_NEAR;
  camera.far = FIXED_CAMERA_FAR;
  camera.updateProjectionMatrix();
}

/**
 * Clip range for the current projection mode.
 *
 * The fixed range is deliberately permissive - it never clips anything a user
 * loads - and that is affordable at normal viewing distances. Pseudo-ortho
 * mode parks the camera ~44x further out, where a near plane of 0.001 against
 * a far of 1e7 leaves depth resolution measured in whole world units and
 * coplanar faces z-fight. Bracket the range around the actual viewing distance
 * instead; the object subtends a ~2 degree cone about the pivot, so a decade
 * either side is generous.
 */
export function applyClipPlanesForView(
  camera: THREE.PerspectiveCamera,
  pseudoOrtho: boolean,
  pivotDistance: number
): void {
  if (!pseudoOrtho || !Number.isFinite(pivotDistance) || pivotDistance <= 0) {
    applyFixedClipPlanes(camera);
    return;
  }
  camera.near = pivotDistance * 0.01;
  camera.far = pivotDistance * 10;
  camera.updateProjectionMatrix();
}
