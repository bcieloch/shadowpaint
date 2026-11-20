import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CanvasSettings } from '@/core/types';

export class Orbit3D {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(domElement: HTMLElement, onChange: () => void) {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    this.camera.position.set(18, 10, 110);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.16;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.enabled = false;
    this.controls.addEventListener('change', onChange);
  }

  setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  setAspect(width: number, height: number): void {
    const safeH = Math.max(1, height);
    const nextAspect = Math.max(1, width) / safeH;
    if (Math.abs(this.camera.aspect - nextAspect) < 1e-6) return;
    this.camera.aspect = nextAspect;
    this.camera.updateProjectionMatrix();
  }

  resetView(canvas: CanvasSettings): void {
    const diag = Math.max(1, Math.hypot(canvas.widthCm, canvas.heightCm));
    this.camera.near = Math.max(0.1, diag * 0.005);
    this.camera.far = Math.max(2000, diag * 40);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const halfTan = Math.tan(fovRad / 2);
    const distY = canvas.heightCm / 2 / halfTan;
    const distX = canvas.widthCm / 2 / (halfTan * Math.max(0.1, this.camera.aspect));
    const dist = Math.max(distX, distY) * 1.28;

    this.camera.position.set(dist * 0.22, dist * 0.12, dist);
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = Math.max(1, diag * 0.05);
    this.controls.maxDistance = Math.max(1000, diag * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  update(): boolean {
    if (!this.controls.enabled) return false;
    return this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
