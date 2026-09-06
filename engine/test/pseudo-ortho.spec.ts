import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Pseudo-orthographic projection: a 2 degree fov plus a compensating dolly,
 * rather than a real OrthographicCamera. What has to hold is that the toggle
 * changes nothing the user can see except the convergence - framing, point
 * pixel size and pan speed all stay put - and that toggling back restores the
 * view exactly. See engine/src/visualization/pseudoOrtho.ts.
 */
test.describe('Pseudo-orthographic projection', () => {
  const pointCloud = path.resolve('../testfiles/open3d/sample_pointcloud.ply');

  const viewState = async (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const viewer: any = (window as any).visualizer;
      const material: any = viewer.meshes[0]?.material;
      return {
        pseudoOrtho: viewer.pseudoOrtho,
        fov: viewer.camera.fov,
        dolly: viewer.viewDollyFactor,
        distance: viewer.camera.position.distanceTo(viewer.controls.target),
        near: viewer.camera.near,
        far: viewer.camera.far,
        panSpeed: (viewer.controls as any).panSpeed,
        maxDistance: (viewer.controls as any).maxDistance,
        // The user's chosen size, which must never be rewritten...
        storedPointSize: viewer.pointSizes[0],
        // ...and the size actually handed to the GPU, which must be.
        materialPointSize: material?.size,
      };
    });

  const toggleOrtho = async (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as any).visualizer.togglePseudoOrthographic());

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#three-canvas');
    await page.locator('#hiddenFileInput').setInputFiles(pointCloud);
    await expect(page.locator('#file-list .file-item')).toHaveCount(1);
  });

  test('trades fov for distance and restores the view on the way back', async ({ page }) => {
    const perspective = await viewState(page);
    expect(perspective.pseudoOrtho).toBe(false);
    expect(perspective.dolly).toBe(1);

    await toggleOrtho(page);
    const ortho = await viewState(page);

    // tan(75/2) / tan(2/2), about 44x.
    const k = Math.tan((75 * Math.PI) / 360) / Math.tan((2 * Math.PI) / 360);
    expect(ortho.pseudoOrtho).toBe(true);
    expect(ortho.fov).toBe(2);
    expect(ortho.dolly).toBeCloseTo(k, 6);
    expect(ortho.distance).toBeCloseTo(perspective.distance * k, 3);

    // The apparent extent at the pivot - distance * tan(fov / 2) - is what the
    // dolly is there to preserve, and it is the whole point of the feature.
    const extent = (s: typeof ortho) => s.distance * Math.tan((s.fov * Math.PI) / 360);
    expect(extent(ortho)).toBeCloseTo(extent(perspective), 6);

    await toggleOrtho(page);
    const restored = await viewState(page);
    expect(restored.pseudoOrtho).toBe(false);
    expect(restored.fov).toBe(perspective.fov);
    expect(restored.dolly).toBe(1);
    expect(restored.distance).toBeCloseTo(perspective.distance, 6);
    expect(restored.near).toBe(perspective.near);
    expect(restored.far).toBe(perspective.far);
  });

  test('keeps points the same pixel size without touching the stored size', async ({ page }) => {
    // Raise the size off DEFAULT_POINT_SIZE, which WebGL clamps to 1px anyway
    // and would hide the whole problem.
    await page.evaluate(() => (window as any).visualizer.updatePointSize(0, 0.05));
    const perspective = await viewState(page);
    expect(perspective.materialPointSize).toBeCloseTo(0.05, 9);

    await toggleOrtho(page);
    const ortho = await viewState(page);

    // three.js size attenuation is size * (height / 2) / -mvPosition.z, with no
    // fov term, so the world size has to grow with the distance or every point
    // shrinks ~44x and effectively disappears.
    expect(ortho.materialPointSize).toBeCloseTo(0.05 * ortho.dolly, 6);
    expect(ortho.storedPointSize).toBeCloseTo(0.05, 9);

    await toggleOrtho(page);
    const restored = await viewState(page);
    expect(restored.materialPointSize).toBeCloseTo(0.05, 9);
    expect(restored.storedPointSize).toBeCloseTo(0.05, 9);
  });

  test('rescales legacy-trackball pan speed and the dolly clamp', async ({ page }) => {
    const perspective = await viewState(page);
    await toggleOrtho(page);
    const ortho = await viewState(page);

    // three.js TrackballControls pans by eye.length() * panSpeed with no
    // tan(fov/2) term, so the dolly would otherwise make panning ~44x too fast.
    expect(ortho.panSpeed).toBeCloseTo(perspective.panSpeed / ortho.dolly, 6);
    // TrackballControls leaves maxDistance at Infinity, and scaling has to
    // leave it there rather than introducing the 50000 clamp the other schemes
    // carry. Those are covered by the control-scheme switch test below.
    if (Number.isFinite(perspective.maxDistance)) {
      expect(ortho.maxDistance).toBeCloseTo(perspective.maxDistance * ortho.dolly, 3);
    } else {
      expect(ortho.maxDistance).toBe(perspective.maxDistance);
    }

    await toggleOrtho(page);
    expect((await viewState(page)).panSpeed).toBeCloseTo(perspective.panSpeed, 6);
  });

  test('brackets the depth range around the viewing distance while in ortho', async ({ page }) => {
    await toggleOrtho(page);
    const ortho = await viewState(page);

    // The fixed 0.001 / 1e7 range leaves depth resolution in whole world units
    // at ortho distances, and coplanar faces z-fight.
    expect(ortho.near).toBeCloseTo(ortho.distance * 0.01, 6);
    expect(ortho.far).toBeCloseTo(ortho.distance * 10, 3);
    expect(ortho.near).toBeGreaterThan(0.001);
  });

  test('P and the panel button toggle it, and the fov slider drops back out', async ({ page }) => {
    const orthoButton = page.locator('#toggle-pseudo-ortho');
    const fovSlider = page.locator('#camera-fov');

    await page.locator('#three-canvas').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('p');
    await expect.poll(() => page.evaluate(() => (window as any).visualizer.pseudoOrtho)).toBe(true);
    await expect(orthoButton).toHaveClass(/active/);

    await page.click('[data-tab="camera"]');
    await expect(orthoButton).toBeVisible();

    // Round trip through the button itself, not just the shortcut.
    await orthoButton.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).visualizer.pseudoOrtho))
      .toBe(false);
    await orthoButton.click();
    await expect(orthoButton).toHaveClass(/active/);

    // The slider changes fov with no compensating dolly, so it has to take the
    // camera out of ortho rather than leave the toggle claiming otherwise.
    await fovSlider.fill('60');
    await expect
      .poll(() => page.evaluate(() => (window as any).visualizer.pseudoOrtho))
      .toBe(false);
    await expect(orthoButton).not.toHaveClass(/active/);
    await expect
      .poll(() => page.evaluate(() => (window as any).visualizer.viewDollyFactor))
      .toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).visualizer.camera.fov)).toBe(60);
  });

  test('survives fit, reset and a control-scheme switch', async ({ page }) => {
    await toggleOrtho(page);
    const dolly = (await viewState(page)).dolly;

    for (const action of ['fitCameraToAllObjects', 'resetCameraToDefault'] as const) {
      await page.evaluate(name => (window as any).visualizer[name](), action);
      const after = await viewState(page);
      expect(after.pseudoOrtho, `${action} must stay in ortho`).toBe(true);
      expect(after.fov).toBe(2);
      // applyFixedClipPlanes used to stomp the ortho range after every fit.
      expect(after.near).toBeCloseTo(after.distance * 0.01, 6);
    }

    // initializeControls reassigns the hard-coded pan speed and distance
    // limits, so the ortho tuning has to be re-applied after a switch.
    await page.evaluate(() => (window as any).visualizer.switchToOrbitControls());
    const orbit = await viewState(page);
    expect(orbit.pseudoOrtho).toBe(true);
    expect(orbit.maxDistance).toBeCloseTo(50000 * dolly, 3);
    expect(orbit.maxDistance).toBeGreaterThan(orbit.distance);
  });
});
