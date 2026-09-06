import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * "Normal" lighting is a MeshLab-style headlight: the key and fill lights hang
 * off the camera so orbiting never swings a face out of the light. The old
 * layout put a single world-fixed DirectionalLight in the scene, which left
 * every away-facing surface on an ambient floor of ~0.15 luminance.
 */
test.describe('Normal lighting headlight', () => {
  const meshPly = path.resolve('../testfiles/open3d/sample_mesh.ply');

  const lightCounts = async (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const viewer: any = (window as any).visualizer;
      const isLight = (o: any) => o.isLight === true;
      const isDirectional = (o: any) => o.isDirectionalLight === true;
      return {
        cameraInScene: viewer.camera.parent === viewer.scene,
        sceneLights: viewer.scene.children.filter(isLight).length,
        sceneDirectional: viewer.scene.children.filter(isDirectional).length,
        cameraLights: viewer.camera.children.filter(isLight).length,
        cameraDirectional: viewer.camera.children.filter(isDirectional).length,
      };
    });

  const setLightingMode = async (
    page: import('@playwright/test').Page,
    mode: 'normal' | 'flat' | 'unlit'
  ) =>
    // Mirrors the handlers in components/ControlsTabTop.svelte.
    page.evaluate(selected => {
      const viewer: any = (window as any).visualizer;
      viewer.lightingMode = selected;
      viewer.useFlatLighting = selected === 'flat';
      viewer.useUnlitPly = selected === 'unlit';
      viewer.rebuildAllPlyMaterials();
      viewer.initSceneLighting();
    }, mode);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#three-canvas');
  });

  test('parents the key and fill lights to the camera, not the scene', async ({ page }) => {
    // A camera-attached light only contributes if the camera itself is in the
    // rendered graph - it is not there by default.
    await expect.poll(async () => (await lightCounts(page)).cameraInScene).toBe(true);

    const counts = await lightCounts(page);
    expect(counts.cameraDirectional).toBe(2); // key + fill
    expect(counts.sceneDirectional).toBe(0);
    expect(counts.sceneLights).toBe(1); // hemisphere ambient only
  });

  test('does not accumulate lights across mode switches', async ({ page }) => {
    const baseline = await lightCounts(page);

    for (const mode of ['flat', 'unlit', 'normal', 'flat', 'normal'] as const) {
      await setLightingMode(page, mode);
    }

    // The removal sweep has to cover both holders; sweeping only scene.children
    // leaves the camera's key/fill behind and doubles them every cycle.
    expect(await lightCounts(page)).toEqual(baseline);
  });

  test('gives meshes a specular material', async ({ page }) => {
    await page.locator('#hiddenFileInput').setInputFiles(meshPly);
    await expect(page.locator('#file-list .file-item')).toHaveCount(1);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const mesh: any = (window as any).visualizer.meshes[0];
          const material: any = mesh?.material;
          return material
            ? {
                type: material.type,
                shininess: material.shininess,
                doubleSided: material.side === 2, // THREE.DoubleSide
                hasNormals: mesh.geometry.getAttribute('normal') !== undefined,
              }
            : null;
        })
      )
      .toEqual({
        type: 'MeshPhongMaterial',
        shininess: 40,
        doubleSided: true,
        hasNormals: true,
      });
  });

  test('never forces flat shading on a mesh shipped without normals', async ({ page }) => {
    // MeshBuilder computes smooth vertex normals whenever a file has none;
    // `flatShading = !data.hasNormals` used to throw them straight away, so a
    // normal-less mesh rendered faceted for no reason.
    const flatShading = await page.evaluate(() => {
      const viewer: any = (window as any).visualizer;
      const material: any = viewer.createMaterialForFile(
        { faceCount: 1, vertexCount: 3, hasNormals: false, hasColors: false, metadata: {} },
        0
      );
      return material.flatShading;
    });
    expect(flatShading).toBe(false);
  });

  test('leaves the unlit path unlit', async ({ page }) => {
    await page.locator('#hiddenFileInput').setInputFiles(meshPly);
    await expect(page.locator('#file-list .file-item')).toHaveCount(1);

    await setLightingMode(page, 'unlit');
    await expect
      .poll(() => page.evaluate(() => (window as any).visualizer.meshes[0]?.material?.type))
      .toBe('MeshBasicMaterial');
  });
});
