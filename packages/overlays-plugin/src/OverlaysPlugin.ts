import type { AbstractAdapter, PanoData, TextureData, Viewer } from '@photo-sphere-viewer/core';
import {
    AbstractConfigurablePlugin,
    CONSTANTS,
    EquirectangularAdapter,
    PSVError,
    events,
    utils,
} from '@photo-sphere-viewer/core';
import type { CubemapAdapter, CubemapData } from '@photo-sphere-viewer/cubemap-adapter';
import type { CubemapTilesAdapter } from '@photo-sphere-viewer/cubemap-tiles-adapter';
import type { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
import { BoxGeometry, Mesh, MeshBasicMaterial, SphereGeometry, Texture, Vector2, VideoTexture } from 'three';
import { OVERLAY_DATA } from './constants';
import { OverlayClickEvent, OverlaysPluginEvents } from './events';
import {
    CubeOverlayConfig,
    OverlayConfig,
    OverlaysPluginConfig,
    ParsedOverlayConfig,
    SphereOverlayConfig,
} from './model';

const getConfig = utils.getConfigParser<OverlaysPluginConfig>({
    overlays: [],
    autoclear: true,
    cubemapAdapter: null,
});

/**
 * Adds stereo view on mobile devices
 */
export class OverlaysPlugin extends AbstractConfigurablePlugin<
    OverlaysPluginConfig,
    OverlaysPluginConfig,
    never,
    OverlaysPluginEvents
> {
    static override readonly id = 'overlays';
    static override configParser = getConfig;
    static override: Array<keyof OverlaysPluginConfig> = ['overlays', 'cubemapAdapter'];

    private readonly state = {
        overlays: {} as Record<string, { config: ParsedOverlayConfig; mesh: Mesh }>,
    };

    private cubemapAdapter: CubemapAdapter;
    private equirectangularAdapter: EquirectangularAdapter;

    constructor(viewer: Viewer, config?: OverlaysPluginConfig) {
        super(viewer, config);
    }

    /**
     * @internal
     */
    override init() {
        super.init();

        // this.viewer.observeObjects(OVERLAY_DATA);

        this.viewer.addEventListener(events.PanoramaLoadedEvent.type, this, { once: true });
        this.viewer.addEventListener(events.PanoramaLoadEvent.type, this);
        this.viewer.addEventListener(events.ClickEvent.type, this);
    }

    /**
     * @internal
     */
    override destroy() {
        this.clearOverlays();

        this.viewer.removeEventListener(events.PanoramaLoadedEvent.type, this);
        this.viewer.removeEventListener(events.PanoramaLoadEvent.type, this);
        this.viewer.removeEventListener(events.ClickEvent.type, this);

        // this.viewer.unobserveObjects(OVERLAY_DATA);

        delete this.cubemapAdapter;
        delete this.equirectangularAdapter;

        super.destroy();
    }

    /**
     * @internal
     */
    handleEvent(e: Event) {
        if (e instanceof events.PanoramaLoadedEvent) {
            this.config.overlays.forEach((overlay) => {
                this.addOverlay(overlay);
            });
            delete this.config.overlays;
        } else if (e instanceof events.PanoramaLoadEvent) {
            if (this.config.autoclear) {
                this.clearOverlays();
            }
        } else if (e instanceof events.ClickEvent) {
            e.data.objects
                .filter((o) => o.userData[OVERLAY_DATA])
                .map((o) => o.userData[OVERLAY_DATA])
                .filter((id) => !!id)
                .forEach((id) => {
                    this.dispatchEvent(new OverlayClickEvent(id));
                });
        }
    }

    /**
     * Adds a new overlay
     */
    addOverlay(config: OverlayConfig) {
        if (!config.path) {
            throw new PSVError(`Missing overlay "path"`);
        }

        const parsedConfig: ParsedOverlayConfig = {
            id: Math.random().toString(36).substring(2),
            type: 'image',
            mode: typeof config.path === 'string' ? 'sphere' : 'cube',
            opacity: 1,
            zIndex: 0,
            ...config,
        };

        if (this.state.overlays[parsedConfig.id]) {
            throw new PSVError(`Overlay "${parsedConfig.id} already exists.`);
        }

        if (parsedConfig.type === 'video') {
            if (parsedConfig.mode === 'sphere') {
                this.__addSphereVideoOverlay(parsedConfig as any);
            } else {
                throw new PSVError('Video cube overlay are not supported.');
            }
        } else {
            if (parsedConfig.mode === 'sphere') {
                this.__addSphereImageOverlay(parsedConfig as any);
            } else {
                this.__addCubeImageOverlay(parsedConfig as any);
            }
        }
    }

    /**
     * Returns the controller of a video overlay
     */
    getVideo(id: string) {
        if (!this.state.overlays[id]) {
            utils.logWarn(`Overlay "${id}" not found`);
            return null;
        }
        if (this.state.overlays[id].config.type !== 'video') {
            utils.logWarn(`Overlay "${id}" is not a video`);
            return null;
        }
        const material = this.state.overlays[id].mesh.material as MeshBasicMaterial;
        return material.map.image as HTMLVideoElement;
    }

    /**
     * Removes an overlay
     */
    removeOverlay(id: string) {
        if (!this.state.overlays[id]) {
            utils.logWarn(`Overlay "${id}" not found`);
            return;
        }

        const { config, mesh } = this.state.overlays[id];

        if (config.mode === 'sphere' && config.type === 'video') {
            const material = mesh.material as MeshBasicMaterial;
            const video = material.map.image as HTMLVideoElement;
            video.pause();
            this.viewer.needsContinuousUpdate(false);
        }

        this.viewer.renderer.removeObject(mesh);
        this.viewer.needsUpdate();

        delete this.state.overlays[id];
    }

    /**
     * Remove all overlays
     */
    clearOverlays() {
        Object.keys(this.state.overlays).forEach((id) => {
            this.removeOverlay(id);
        });
    }

    /**
     * Create the mesh for a spherical overlay
     */
    private __createSphereMesh(config: SphereOverlayConfig & ParsedOverlayConfig, map: Texture) {
        const adapter = this.__getEquirectangularAdapter();

        // if not position provided, it is a full sphere matching the base one
        const phi = !utils.isNil(config.yaw) ? utils.parseAngle(config.yaw) : -Math.PI;
        const theta = !utils.isNil(config.pitch) ? utils.parseAngle(config.pitch, true) : Math.PI / 2;
        const phiLength = !utils.isNil(config.width) ? utils.parseAngle(config.width) : 2 * Math.PI;
        const thetaLength = !utils.isNil(config.height) ? utils.parseAngle(config.height) : Math.PI;

        const geometry = new SphereGeometry(
            CONSTANTS.SPHERE_RADIUS,
            Math.round((adapter.SPHERE_SEGMENTS / (2 * Math.PI)) * phiLength),
            Math.round((adapter.SPHERE_HORIZONTAL_SEGMENTS / Math.PI) * thetaLength),
            phi + Math.PI / 2,
            phiLength,
            Math.PI / 2 - theta,
            thetaLength
        ).scale(-1, 1, 1);

        const material = new MeshBasicMaterial({
            map,
            transparent: true, // must always be transparent for renderOrder to be respected
            opacity: config.opacity,
            depthTest: false,
        });

        const mesh = new Mesh(geometry, material);
        mesh.renderOrder = 100 + config.zIndex;
        mesh.userData[OVERLAY_DATA] = config.id;

        return mesh;
    }

    /**
     * Create the mesh for a cubemap overlay
     */
    private __createCubeMesh(
        config: CubeOverlayConfig & ParsedOverlayConfig,
        { texture, panoData }: TextureData<Texture[], any, CubemapData>
    ) {
        const cubeSize = CONSTANTS.SPHERE_RADIUS * 2;
        const geometry = new BoxGeometry(cubeSize, cubeSize, cubeSize).scale(1, 1, -1);

        const materials = [];
        for (let i = 0; i < 6; i++) {
            if (panoData.flipTopBottom && (i === 2 || i === 3)) {
                texture[i].center = new Vector2(0.5, 0.5);
                texture[i].rotation = Math.PI;
            }

            materials.push(
                new MeshBasicMaterial({
                    map: texture[i],
                    transparent: true,
                    opacity: config.opacity,
                    depthTest: false,
                })
            );
        }

        const mesh = new Mesh(geometry, materials);
        mesh.renderOrder = 100 + config.zIndex;
        mesh.userData[OVERLAY_DATA] = config.id;

        return mesh;
    }

    /**
     * Add a spherical still image
     */
    private async __addSphereImageOverlay(config: SphereOverlayConfig & ParsedOverlayConfig) {
        const panoData = this.viewer.state.textureData.panoData as PanoData;

        // pano data is only applied if the current texture is equirectangular and if no position is provided
        const applyPanoData =
            panoData?.isEquirectangular
            && utils.isNil(config.yaw)
            && utils.isNil(config.pitch)
            && utils.isNil(config.width)
            && utils.isNil(config.height);

        let texture: Texture;
        if (applyPanoData) {
            // the adapter can only load standard equirectangular textures
            const adapter = this.__getEquirectangularAdapter();

            texture = (
                await adapter.loadTexture(
                    config.path,
                    (image) => {
                        const r = image.width / panoData.croppedWidth;
                        return {
                            isEquirectangular: true,
                            fullWidth: r * panoData.fullWidth,
                            fullHeight: r * panoData.fullHeight,
                            croppedWidth: r * panoData.croppedWidth,
                            croppedHeight: r * panoData.croppedHeight,
                            croppedX: r * panoData.croppedX,
                            croppedY: r * panoData.croppedY,
                        };
                    },
                    false,
                    false
                )
            ).texture;
        } else {
            texture = utils.createTexture(await this.viewer.textureLoader.loadImage(config.path));
        }

        const mesh = this.__createSphereMesh(config, texture);

        this.state.overlays[config.id] = { config, mesh };

        this.viewer.renderer.addObject(mesh);
        this.viewer.needsUpdate();
    }

    /**
     * Add a spherical video
     */
    private __addSphereVideoOverlay(config: SphereOverlayConfig & ParsedOverlayConfig) {
        const video = document.createElement('video');
        video.crossOrigin = this.viewer.config.withCredentials ? 'use-credentials' : 'anonymous';
        video.loop = true;
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.preload = 'metadata';
        video.src = config.path as string;

        const mesh = this.__createSphereMesh({ ...config, opacity: 0 }, new VideoTexture(video));

        this.state.overlays[config.id] = { config, mesh };

        this.viewer.renderer.addObject(mesh);
        this.viewer.needsContinuousUpdate(true);
        video.play();

        video.addEventListener('play', () => {
            mesh.material.opacity = config.opacity;
        }, { once: true });
    }

    /**
     * Add a cubemap still image
     */
    private async __addCubeImageOverlay(config: CubeOverlayConfig & ParsedOverlayConfig) {
        const adapter = this.__getCubemapAdapter();

        const texture = await adapter.loadTexture(config.path, null, false);
        const mesh = this.__createCubeMesh(config, texture);

        this.state.overlays[config.id] = { config, mesh };

        this.viewer.renderer.addObject(mesh);
        this.viewer.needsUpdate();
    }

    private __getEquirectangularAdapter() {
        if (!this.equirectangularAdapter) {
            const id = (this.viewer.adapter.constructor as typeof AbstractAdapter).id;
            if (id === 'equirectangular') {
                this.equirectangularAdapter = this.viewer.adapter as EquirectangularAdapter;
            } else if (id === 'equirectangular-tiles') {
                this.equirectangularAdapter = (this.viewer.adapter as EquirectangularTilesAdapter).getAdapter();
            } else {
                this.equirectangularAdapter = new EquirectangularAdapter(this.viewer, {
                    interpolateBackground: false,
                    useXmpData: false,
                });
            }
        }

        return this.equirectangularAdapter;
    }

    private __getCubemapAdapter() {
        if (!this.cubemapAdapter) {
            const id = (this.viewer.adapter.constructor as typeof AbstractAdapter).id;
            if (id === 'cubemap') {
                this.cubemapAdapter = this.viewer.adapter as CubemapAdapter;
            } else if (id === 'cubemap-tiles') {
                this.cubemapAdapter = (this.viewer.adapter as CubemapTilesAdapter).getAdapter();
            } else if (this.config.cubemapAdapter) {
                this.cubemapAdapter = new this.config.cubemapAdapter(this.viewer) as CubemapAdapter;
            } else {
                throw new PSVError(`Cubemap overlays are only applicable with cubemap adapters`);
            }
        }

        return this.cubemapAdapter;
    }
}
