import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * The opening shot must be the one R gives.
 *
 * fitCameraToAllObjects only slides the camera along the direction it already
 * has - deliberately, so loading a second file never swings the view you set
 * up on the first. On the very first file there is no such view to protect, so
 * the opening shot used to inherit the camera constructor's (1, 1, 1)
 * placement and come out on the diagonal; R was needed to straighten it.
 */
test.describe('Opening view', () => {
  const snap = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const v: any = (window as any).visualizer;
      const r = (n: number) => Math.round(n * 1000) / 1000;
      return {
        pos: [r(v.camera.position.x), r(v.camera.position.y), r(v.camera.position.z)],
        quat: [
          r(v.camera.quaternion.x),
          r(v.camera.quaternion.y),
          r(v.camera.quaternion.z),
          r(v.camera.quaternion.w),
        ],
        target: [r(v.controls.target.x), r(v.controls.target.y), r(v.controls.target.z)],
        dist: r(v.camera.position.distanceTo(v.controls.target)),
      };
    });

  const load = async (page: import('@playwright/test').Page, fixture: string) => {
    await page.locator('#hiddenFileInput').setInputFiles(path.resolve('../testfiles/' + fixture));
    await page.waitForFunction(() => (window as any).visualizer?.meshes?.length > 0);
    await page.waitForTimeout(800);
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#three-canvas');
  });

  for (const fixture of [
    'open3d/sample_mesh.ply',
    'open3d/sample_pointcloud.xyz',
    'stl/test_sphere_subdivided.stl',
  ]) {
    test(`opens square on, exactly where R would put it: ${fixture}`, async ({ page }) => {
      await load(page, fixture);
      const onLoad = await snap(page);

      await page.evaluate(() => (window as any).visualizer.resetCameraToDefault());
      await page.waitForTimeout(300);

      expect(onLoad).toEqual(await snap(page));
      // Square on means no rotation at all, looking down -Z at the centre.
      expect(onLoad.quat).toEqual([0, 0, 0, 1]);
      expect(onLoad.pos[2]).toBeCloseTo(onLoad.dist, 2);
    });
  }

  test('a second file leaves the view you set up alone', async ({ page }) => {
    await load(page, 'open3d/sample_mesh.ply');
    await page.evaluate(() => {
      const v: any = (window as any).visualizer;
      v.camera.position.set(3, 2, 1);
      v.camera.lookAt(v.controls.target);
    });
    const before = await snap(page);

    await load(page, 'open3d/sample_pointcloud.xyz');

    // Only the first file may frame the camera; this is what the
    // direction-preserving fit exists to protect.
    expect(await snap(page)).toEqual(before);
  });
});
