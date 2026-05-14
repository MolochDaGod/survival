declare module 'troika-three-text' {
  import * as THREE from 'three';

  export class Text extends THREE.Mesh {
    text: string;
    fontSize: number;
    color: number | string | THREE.Color;
    outlineWidth: number | string;
    outlineColor: number | string | THREE.Color;
    anchorX: 'left' | 'center' | 'right' | number | string;
    anchorY: 'top' | 'middle' | 'bottom' | 'top-baseline' | 'bottom-baseline' | number | string;
    font?: string;
    maxWidth?: number;
    lineHeight?: number | string;
    letterSpacing?: number;
    textAlign?: 'left' | 'right' | 'center' | 'justify';
    material: THREE.Material;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
