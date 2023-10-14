import { TypedEvent } from '@photo-sphere-viewer/core';
import type { OverlaysPlugin } from './OverlaysPlugin';

/**
 * Triggered when an overlay is clicked
 */
export class OverlayClickEvent extends TypedEvent<OverlaysPlugin> {
    static override readonly type = 'overlay-click';
    override type: 'overlay-click';

    constructor(public readonly overlayId: string) {
        super(OverlayClickEvent.type);
    }
}

export type OverlaysPluginEvents = OverlayClickEvent;
