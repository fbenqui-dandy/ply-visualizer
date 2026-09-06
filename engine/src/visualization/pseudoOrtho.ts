import * as THREE from 'three';
import { applyClipPlanesForView } from '../cameraClipping';

/**
 * Pseudo-orthographic projection.
 *
 * MeshLab's orthographic view is visually the fov -> 0 limit of a perspective
 * one, so instead of introducing a real THREE.OrthographicCamera - which would
 * mean per-mode branches in every control class, in EDL's depth linearization,
 * clipping, point picking, fit-to-view, keyframes and the camera-intrinsics
 * paths, all of which type the camera as PerspectiveCamera - we narrow the fov
 * hard and dolly the camera back by the reciprocal factor. The visible extent
 * at the pivot is unchanged, and the camera stays a genuine perspective camera
 * so everything downstream keeps working, EDL included.
 *
 * The residual convergence across the object is ORTHO_FOV (~2 degrees):
 * invisible when comparing scans, findable by anyone doing real orthographic
 * measurement. Going narrower makes the depth-precision problem worse, not
 * better - see applyClipPlanesForView.
 */

export const PERSPECTIVE_FOV = 75;
export const ORTHO_FOV = 2;

/** Controls expose these; the schemes differ in which they define. */
interface OrthoTunableControls {
  target: THREE.Vector3;
  update(): void;
  panSpeed?: number;
  minDistance?: number;
  maxDistance?: number;
}

type TunedProperty = 'panSpeed' | 'minDistance' | 'maxDistance';

/**
 * The values a controls instance was built with, snapshotted the first time it
 * is tuned so that re-tuning scales the pristine baseline rather than
 * compounding on itself. Reading the constants out of initializeControls
 * instead would duplicate them, and would be wrong for the schemes that leave
 * a limit at its three.js default: TrackballControls ships maxDistance
 * Infinity, and writing 50000 would introduce a clamp it never had.
 */
const baselines = new WeakMap<object, Partial<Record<TunedProperty, number>>>();

function baselineOf(controls: OrthoTunableControls, property: TunedProperty): number | undefined {
  let baseline = baselines.get(controls);
  if (!baseline) {
    baseline = {};
    baselines.set(controls, baseline);
  }
  if (!(property in baseline)) {
    const current = controls[property];
    baseline[property] = typeof current === 'number' ? current : undefined;
  }
  return baseline[property];
}

function scaleFromBaseline(
  controls: OrthoTunableControls,
  property: TunedProperty,
  factor: number
): void {
  const baseline = baselineOf(controls, property);
  if (baseline === undefined) {
    return;
  }
  controls[property] = baseline * factor;
}

export interface PseudoOrthoHost {
  camera: THREE.PerspectiveCamera;
  controls: OrthoTunableControls;
  controlType: 'trackball' | 'orbit' | 'legacy-trackball' | 'arcball';
  pseudoOrtho: boolean;
  /**
   * How much further from the pivot the camera sits than perspective framing
   * would put it; exactly 1 outside pseudo-ortho mode. Point sizes and the
   * legacy-trackball pan speed both derive from this one number, so there is
   * nothing to keep in sync.
   */
  viewDollyFactor: number;
  /**
   * The fov in effect when ortho was entered, restored on the way out. Without
   * it, toggling off would snap to PERSPECTIVE_FOV and quietly rescale the view
   * for anyone who had moved the fov slider first.
   */
  perspectiveFov: number;
  requestRender(): void;
  refreshAllPointSizes(): void;
}

/** tan of the half-angle - the quantity that scales linearly with view size. */
function halfTan(fovDegrees: number): number {
  return Math.tan((fovDegrees * Math.PI) / 360);
}

/** Distance from the camera to the orbit pivot. */
function pivotDistance(host: PseudoOrthoHost): number {
  return host.camera.position.distanceTo(host.controls.target);
}

/**
 * Re-apply the control tuning that ortho mode needs. Call on toggle and after
 * anything that rebuilds the controls, since initializeControls reassigns the
 * hard-coded speeds and distance limits from scratch.
 */
export function applyPseudoOrthoControlTuning(host: PseudoOrthoHost): void {
  const controls = host.controls;
  const k = host.viewDollyFactor;

  // three.js TrackballControls - the default 'legacy-trackball' scheme - pans
  // by `eye.length() * panSpeed`, with no tan(fov/2) term, so the dolly makes
  // panning ~44x too fast. The three hand-written classes in controls.ts use
  // `2 * tan(fov/2) * distance / height`, where the fov and distance changes
  // cancel exactly, and must be left alone.
  if (host.controlType === 'legacy-trackball') {
    scaleFromBaseline(controls, 'panSpeed', 1 / k);
  }

  // Every scheme but legacy-trackball clamps the dolly at 50000, which ortho
  // distances blow straight past - wheel zoom-out would stick.
  scaleFromBaseline(controls, 'minDistance', k);
  scaleFromBaseline(controls, 'maxDistance', k);
}

/**
 * Keep the depth range matched to the viewing distance while in ortho mode.
 * The pivot distance grows on every wheel notch, and the fixed near plane of
 * 0.001 against a camera ~44x further out leaves depth resolution measured in
 * whole world units - coplanar faces z-fight badly. Cheap enough to call on
 * every camera move.
 */
export function refreshPseudoOrthoClipPlanes(host: PseudoOrthoHost): void {
  if (!host.pseudoOrtho) {
    return;
  }
  applyClipPlanesForView(host.camera, true, pivotDistance(host));
}

/**
 * Set the dolly factor and push it everywhere it is read.
 *
 * three.js size attenuation is `size * (height / 2) / -mvPosition.z` - there is
 * no fov term in it - so the dolly shrinks every point by the same factor even
 * though the model's apparent size is unchanged. Compensating through a
 * view-only multiplier rather than by rewriting pointSizes[] keeps the per-file
 * sliders showing the size the user chose, and keeps a toggle round trip exact.
 */
function setDollyFactor(host: PseudoOrthoHost, factor: number): void {
  host.viewDollyFactor = factor;
  host.refreshAllPointSizes();
  applyPseudoOrthoControlTuning(host);
}

export function setPseudoOrthographic(host: PseudoOrthoHost, enabled: boolean): void {
  if (enabled === host.pseudoOrtho) {
    return;
  }

  const camera = host.camera;
  const target = host.controls.target;
  if (enabled) {
    host.perspectiveFov = camera.fov;
  }
  const newFov = enabled ? ORTHO_FOV : host.perspectiveFov;
  // Derived from the fov actually in effect rather than from the constants, so
  // that a user who moved the fov slider first keeps their framing, and so
  // that the return trip undoes exactly what the outbound one did.
  const k = halfTan(camera.fov) / halfTan(newFov);

  const eye = new THREE.Vector3().subVectors(camera.position, target);
  if (eye.lengthSq() > 1e-18) {
    camera.position.copy(target).add(eye.multiplyScalar(k));
  }

  camera.fov = newFov;
  camera.updateProjectionMatrix();
  camera.lookAt(target);

  host.pseudoOrtho = enabled;
  setDollyFactor(host, enabled ? k : 1);
  applyClipPlanesForView(camera, enabled, pivotDistance(host));

  host.controls.update();
  host.requestRender();
}

/**
 * Leave ortho mode without moving the camera, for the paths that set fov from
 * something other than this toggle - the fov slider, and the COLMAP/E57 camera
 * intrinsics in cameraFrames. They own the fov from that point on, so the flag
 * has to drop or the toggle would lie about its state.
 */
export function clearPseudoOrthographic(host: PseudoOrthoHost): void {
  if (!host.pseudoOrtho) {
    return;
  }
  host.pseudoOrtho = false;
  setDollyFactor(host, 1);
  applyClipPlanesForView(host.camera, false, pivotDistance(host));
}
