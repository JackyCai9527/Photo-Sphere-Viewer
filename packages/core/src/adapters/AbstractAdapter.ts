import { Mesh, ShaderMaterial, ShaderMaterialParameters } from 'three';
import { PanoData, PanoDataProvider, PanoramaPosition, Position, TextureData } from '../model';
import type { Viewer } from '../Viewer';
import { PSVError } from '../PSVError';

/**
 * Base class for adapters
 * @template TPanorama type of the panorama object
 * @template TTexture type of the loaded texture
 * @template TData type of the panorama metadata
 */
export abstract class AbstractAdapter<TPanorama, TTexture, TData> {
    /**
     * Unique identifier of the adapter
     */
    static readonly id: string;

    /**
     * Indicates if the adapter supports panorama download natively
     */
    static readonly supportsDownload: boolean = false;

    /**
     * @deprecated
     */
    static readonly supportsOverlay: boolean = false;

    constructor(protected readonly viewer: Viewer) {}

    /**
     * Initializes the adapter
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    init(): void {}

    /**
     * Destroys the adapter
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    destroy(): void {}

    /**
     * Indicates if the adapter supports transitions between panoramas
     */
    // @ts-ignore unused parameter
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    supportsTransition(panorama: TPanorama): boolean {
        return false;
    }

    /**
     * Indicates if the adapter supports preload of a panorama
     */
    // @ts-ignore unused parameter
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    supportsPreload(panorama: TPanorama): boolean {
        return false;
    }

    /**
     * Converts pixel texture coordinates to spherical radians coordinates
     * @throws {@link PSVError} when the current adapter does not support texture coordinates
     */
    // @ts-ignore unused parameter
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    textureCoordsToSphericalCoords(point: PanoramaPosition, data: TData): Position {
        throw new PSVError('Current adapter does not support texture coordinates.');
    }

    /**
     * Converts spherical radians coordinates to pixel texture coordinates
     * @throws {@link PSVError} when the current adapter does not support texture coordinates
     */
    // @ts-ignore unused parameter
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sphericalCoordsToTextureCoords(position: Position, data: TData): PanoramaPosition {
        throw new PSVError('Current adapter does not support texture coordinates.');
    }

    /**
     * Loads the panorama texture
     */
    abstract loadTexture(
        panorama: TPanorama,
        newPanoData?: PanoData | PanoDataProvider,
        loader?: boolean,
        useXmpPanoData?: boolean
    ): Promise<TextureData<TTexture, TPanorama, TData>>;

    /**
     * Creates the mesh
     */
    abstract createMesh(scale?: number): Mesh;

    /**
     * Applies the texture to the mesh
     */
    abstract setTexture(mesh: Mesh, textureData: TextureData<TTexture, TPanorama, TData>, transition?: boolean): void;

    /**
     * Changes the opacity of the mesh
     */
    abstract setTextureOpacity(mesh: Mesh, opacity: number): void;

    /**
     * Clear a loaded texture from memory
     */
    abstract disposeTexture(textureData: TextureData<TTexture, TPanorama, TData>): void;

    /**
     * @deprecated
     */
    // @ts-ignore unused parameter
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setOverlay(mesh: Mesh, textureData: TextureData<TTexture, TPanorama, TData>, opacity: number): void {
        throw new PSVError('Current adapter does not support overlay');
    }

    /**
     * @internal
     */
    static OVERLAY_UNIFORMS = {
        panorama: 'panorama',
        overlay: 'overlay',
        globalOpacity: 'globalOpacity',
        overlayOpacity: 'overlayOpacity',
    };

    /**
     * @internal
     */
    static createOverlayMaterial({
        additionalUniforms,
        overrideVertexShader,
    }: {
        additionalUniforms?: ShaderMaterialParameters['uniforms'];
        overrideVertexShader?: ShaderMaterialParameters['vertexShader'];
    } = {}): ShaderMaterial {
        return new ShaderMaterial({
            uniforms: {
                ...additionalUniforms,
                [AbstractAdapter.OVERLAY_UNIFORMS.panorama]: { value: null },
                [AbstractAdapter.OVERLAY_UNIFORMS.overlay]: { value: null },
                [AbstractAdapter.OVERLAY_UNIFORMS.globalOpacity]: { value: 1.0 },
                [AbstractAdapter.OVERLAY_UNIFORMS.overlayOpacity]: { value: 0.0 },
            },

            vertexShader:
                overrideVertexShader ||
                `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix *  modelViewMatrix * vec4( position, 1.0 );
}`,

            fragmentShader: `
uniform sampler2D ${AbstractAdapter.OVERLAY_UNIFORMS.panorama};
uniform sampler2D ${AbstractAdapter.OVERLAY_UNIFORMS.overlay};
uniform float ${AbstractAdapter.OVERLAY_UNIFORMS.globalOpacity};
uniform float ${AbstractAdapter.OVERLAY_UNIFORMS.overlayOpacity};

varying vec2 vUv;

void main() {
  vec4 tColor1 = texture2D( ${AbstractAdapter.OVERLAY_UNIFORMS.panorama}, vUv );
  vec4 tColor2 = texture2D( ${AbstractAdapter.OVERLAY_UNIFORMS.overlay}, vUv );
  gl_FragColor = vec4(
    mix( tColor1.rgb, tColor2.rgb, tColor2.a * ${AbstractAdapter.OVERLAY_UNIFORMS.overlayOpacity} ),
    ${AbstractAdapter.OVERLAY_UNIFORMS.globalOpacity}
  );
}`,
        });
    }
}

// prettier-ignore
export type AdapterConstructor = (new (viewer: Viewer, config?: any) => AbstractAdapter<any, any, any>);

/**
 * Returns the adapter constructor from the imported object
 * @internal
 */
export function adapterInterop(adapter: any): AdapterConstructor & typeof AbstractAdapter {
    if (adapter) {
        for (const [, p] of [['_', adapter], ...Object.entries(adapter)]) {
            if (p.prototype instanceof AbstractAdapter) {
                return p;
            }
        }
    }
    return null;
}
