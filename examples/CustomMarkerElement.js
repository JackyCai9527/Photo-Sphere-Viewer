/**
 * Custom element used for the markers demo
 */
export class CustomMarkerElement extends HTMLElement {
    constructor() {
        super();

        this.fmt = new Intl.NumberFormat({ maximumSignificantDigits: 4 });

        const dom = this.attachShadow({ mode: 'closed' });

        const style = document.createElement('style');
        dom.appendChild(style);
        style.innerText = STYLE;

        const button = document.createElement('button');
        dom.appendChild(button);
        button.innerHTML = ICON;

        this.tooltip = document.createElement('div');
        this.tooltip.classList.add('tooltip');
        dom.appendChild(this.tooltip);
        this.tooltip.innerHTML = '<slot></slot>';

        this.legend = document.createElement('pre');
        this.tooltip.appendChild(this.legend);

        button.addEventListener('mouseenter', () => {
            this.tooltip.classList.add('hovered');
        });
    }

    updateMarker({ marker, position, viewerPosition, zoomLevel, viewerSize }) {
        this.legend.innerText = `Params
position: ${position.x}px x ${position.y}px
viewerPosition: ${this.fmt.format(viewerPosition.yaw)}rad / ${this.fmt.format(viewerPosition.pitch)}rad
zoomLevel: ${zoomLevel}%
viewerSize: ${viewerSize.width}px x ${viewerSize.height}px
`;
        this.tooltip.classList.toggle('bottom', position.y < viewerSize.height / 2);
    }
}

const STYLE = `
:host {
    display: block;
    position: relative;
    width: 50px;
    height: 50px;
}

button {
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    background: none;
    color: white;
    border-radius: 50%;
}
button:hover {
    animation: shadow 1s ease-out;
}
@keyframes shadow {
    0% { box-shadow: 0 0 0 0px rgba(97, 170, 242, 0); }
    20% {  box-shadow: 0 0 0 5px rgba(97, 170, 242, 1); }
    100% {  box-shadow: 0 0 0 20px rgba(97, 170, 242, 0); }
}

.tooltip {
    box-sizing: border-box;
    width: 300px;
    position: absolute;
    bottom: calc(100% + 10px);
    left: calc(50% -  150px);
    background: rgba(30, 30, 30, 0.8);
    color: white;
    border-radius: 15px;
    transform-origin: 50% calc(100% + 35px);
    transform: rotate(30deg);
    opacity: 0;
}
.tooltip.bottom {
    bottom: auto;
    top: calc(100% + 10px);
    transform-origin: 50% -35px;
}

.tooltip.hovered {
    animation: rotate-bounce-out 200ms ease forwards;
}

.tooltip slot::slotted(img) {
    width: 100%;
    border-radius: 15px 15px 0 0;
}
.tooltip slot::slotted(h2),
.tooltip slot::slotted(p) {
    margin: 1rem;
    text-align: justify;
}
.tooltip pre {
    font-size: 0.8em;
    margin: 1rem;
}

.tooltip::after {
    content: '';
    width: 0px;
    height: 0px;
    color: rgba(30, 30, 30, 0.8);
    border: 10px solid transparent;
    border-top-color: currentColor;
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -10px;
}
.tooltip.bottom::after {
    border-top-color: transparent;
    border-bottom-color: currentColor;
    top: auto;
    bottom: 100%;
}

button:hover + .tooltip {
    animation: rotate-bounce-in 300ms ease forwards;
}
@keyframes rotate-bounce-in {
    0% { transform: rotate(30deg); opacity: 0; }
    70% { transform: rotate(-10deg); }
    100% { transform: rotate(0deg); opacity: 1; }
}
@keyframes rotate-bounce-out {
    0% { transform: rotate(0deg); opacity: 1; }
    100% { transform: rotate(30deg); opacity: 0; }
}
`;

const ICON = `<svg viewBox="0 0 100 100">
<circle cx=50 cy=50 r=25 fill="currentColor"/>
<circle cx=50 cy=50 r=40 stroke-width=10 fill="none" stroke="currentColor"/>
</svg>`;
