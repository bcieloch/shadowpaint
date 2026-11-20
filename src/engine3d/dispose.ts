import * as THREE from 'three';

const TEXTURE_MATERIAL_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
] as const;

export interface DisposeOptions {
  disposeTextures?: boolean;
}

export function disposeMaterial(material: THREE.Material, options: DisposeOptions = {}): void {
  if (options.disposeTextures) {
    const record = material as unknown as Record<string, unknown>;
    for (const key of TEXTURE_MATERIAL_KEYS) {
      const value = record[key];
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform?.value instanceof THREE.Texture) {
          uniform.value.dispose();
        }
      }
    }
  }
  material.dispose();
}

export function disposeObject3D(root: THREE.Object3D, options: DisposeOptions = {}): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry instanceof THREE.BufferGeometry) {
      mesh.geometry.dispose();
    }
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        disposeMaterial(m, options);
      }
    } else if (mat) {
      disposeMaterial(mat, options);
    }
  });
}

export interface RendererMemoryInfo {
  geometries: number;
  textures: number;
  programs: number;
}

export function getRendererMemoryInfo(renderer: THREE.WebGLRenderer): RendererMemoryInfo {
  return {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
  };
}
