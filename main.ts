import { App, Modal, Plugin, setIcon } from 'obsidian';

const MERMAID_SELECTOR = '.mermaid';
const HOST_CLASS = 'mermaid-fs-host';
const BUTTON_CLASS = 'mermaid-fs-button';
const MODAL_CLASS = 'mermaid-fs-modal';
const VIEWPORT_CLASS = 'mermaid-fs-viewport';
const STAGE_CLASS = 'mermaid-fs-stage';

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const MAX_FIT_SCALE = 2.5;
const VIEWPORT_PADDING = 48;

interface PointerPosition {
	x: number;
	y: number;
}

export default class MermaidFullscreenPlugin extends Plugin {
	private observer: MutationObserver | null = null;
	private scanScheduled = false;
	private activeModal: MermaidFullscreenModal | null = null;

	onload(): void {
		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.addedNodes.length > 0) {
					this.scheduleScan();
					return;
				}
			}
		});
		this.observer.observe(document.body, { childList: true, subtree: true });

		this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleScan()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleScan()));
		this.registerDomEvent(window, 'resize', () => this.scheduleScan());
		this.app.workspace.onLayoutReady(() => this.scheduleScan());
		// 同步扫一遍：插件重载时窗口可能处于后台，requestAnimationFrame 会被节流
		this.decorateAll();
	}

	onunload(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.activeModal?.close();

		for (const button of Array.from(document.querySelectorAll(`.${BUTTON_CLASS}`))) {
			button.remove();
		}
		for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) {
			host.removeClass(HOST_CLASS);
		}
	}

	private scheduleScan(): void {
		if (this.scanScheduled) return;
		this.scanScheduled = true;
		window.requestAnimationFrame(() => {
			this.scanScheduled = false;
			this.decorateAll();
		});
	}

	private decorateAll(): void {
		for (const block of Array.from(document.querySelectorAll<HTMLElement>(MERMAID_SELECTOR))) {
			this.decorateBlock(block);
		}
	}

	private decorateBlock(block: HTMLElement): void {
		// 全屏弹窗里的克隆节点也带 .mermaid，不能再给它加按钮
		if (block.closest(`.${MODAL_CLASS}`)) return;
		if (!block.querySelector('svg')) return;

		const host = (block.closest('.cm-embed-block')
			?? block.closest('.mermaid-wrapper')
			?? block.closest('el-pre')
			?? block) as HTMLElement;

		const existing = host.querySelector(`:scope > .${BUTTON_CLASS}`);
		if (existing) {
			this.positionButton(host, existing as HTMLElement, block);
			return;
		}

		host.addClass(HOST_CLASS);

		const button = createEl('button', { cls: `clickable-icon ${BUTTON_CLASS}` });
		button.setAttribute('aria-label', '全屏查看 Mermaid 图');
		button.setAttribute('title', '全屏查看');
		setIcon(button, 'maximize');

		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			// 实时预览可能重新渲染，点击时再取一次 svg
			const currentSvg = block.querySelector('svg');
			if (!currentSvg) return;
			this.activeModal = new MermaidFullscreenModal(this.app, currentSvg);
			this.activeModal.open();
		});

		host.appendChild(button);
		this.positionButton(host, button, block);
	}

	// 把按钮贴到「图」的左上角，而不是整个代码块的最左侧
	private positionButton(host: HTMLElement, button: HTMLElement, block: HTMLElement): void {
		const svg = block.querySelector('svg');
		if (!svg) return;

		const hostRect = host.getBoundingClientRect();
		const svgRect = svg.getBoundingClientRect();
		if (hostRect.width === 0 || svgRect.width === 0) return;

		const top = svgRect.top - hostRect.top + 8;
		const left = svgRect.left - hostRect.left + 8;
		button.style.top = `${Math.max(4, top)}px`;
		button.style.left = `${Math.max(4, left)}px`;
		button.style.right = '';
	}
}

class MermaidFullscreenModal extends Modal {
	private readonly sourceSvg: SVGSVGElement;
	private readonly naturalWidth: number;
	private readonly naturalHeight: number;

	private viewport!: HTMLElement;
	private stage!: HTMLElement;
	private scaleLabel!: HTMLElement;

	private scale = 1;
	private translateX = 0;
	private translateY = 0;

	private readonly pointers = new Map<number, PointerPosition>();
	private dragging = false;
	private lastPointer: PointerPosition | null = null;
	private pinchDistance = 0;
	private pinchMidpoint: PointerPosition = { x: 0, y: 0 };

	private readonly cleanups: Array<() => void> = [];

	constructor(app: App, sourceSvg: SVGSVGElement) {
		super(app);
		this.sourceSvg = sourceSvg;

		const viewBox = sourceSvg.viewBox?.baseVal;
		const rect = sourceSvg.getBoundingClientRect();
		this.naturalWidth = viewBox && viewBox.width > 0 ? viewBox.width : rect.width || 800;
		this.naturalHeight = viewBox && viewBox.height > 0 ? viewBox.height : rect.height || 600;
	}

	onOpen(): void {
		this.modalEl.addClass(MODAL_CLASS);
		this.contentEl.addClass('mermaid-fs-content');
		this.contentEl.empty();

		this.viewport = this.contentEl.createDiv({ cls: VIEWPORT_CLASS });
		this.stage = this.viewport.createDiv({ cls: STAGE_CLASS });

		// 用原生 .mermaid 包裹：Obsidian 的深色模式反色与字体规则都依赖这个选择器
		const holder = this.stage.createDiv({ cls: 'mermaid mermaid-fs-clone' });
		const clone = this.sourceSvg.cloneNode(true) as SVGSVGElement;
		clone.style.width = `${this.naturalWidth}px`;
		clone.style.height = `${this.naturalHeight}px`;
		clone.style.maxWidth = 'none';
		clone.style.display = 'block';
		holder.appendChild(clone);

		this.buildControls();
		this.bindInteractions();

		window.requestAnimationFrame(() => this.fitToViewport());
	}

	onClose(): void {
		for (const cleanup of this.cleanups.splice(0)) cleanup();
		this.contentEl.empty();
	}

	private buildControls(): void {
		const controls = this.contentEl.createDiv({ cls: 'mermaid-fs-controls' });

		const addButton = (icon: string, label: string, onClick: () => void): HTMLElement => {
			const button = controls.createEl('button', { cls: 'clickable-icon mermaid-fs-control-button' });
			setIcon(button, icon);
			button.setAttribute('aria-label', label);
			button.setAttribute('title', label);
			button.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				onClick();
			});
			return button;
		};

		addButton('minus', '缩小', () => this.zoomBy(1 / 1.25));
		this.scaleLabel = controls.createSpan({ cls: 'mermaid-fs-scale' });
		addButton('plus', '放大', () => this.zoomBy(1.25));
		addButton('rotate-ccw', '适应窗口', () => this.fitToViewport());
		addButton('x', '关闭', () => this.close());

		this.updateScaleLabel();
	}

	private bindInteractions(): void {
		const { viewport } = this;

		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			const rect = viewport.getBoundingClientRect();
			const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
			this.zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
		};

		const onPointerDown = (event: PointerEvent): void => {
			if ((event.target as HTMLElement).closest('button')) return;
			viewport.setPointerCapture(event.pointerId);
			this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (this.pointers.size === 1) {
				this.dragging = true;
				this.lastPointer = { x: event.clientX, y: event.clientY };
				viewport.addClass('is-dragging');
			} else if (this.pointers.size === 2) {
				this.dragging = false;
				viewport.removeClass('is-dragging');
				const [a, b] = Array.from(this.pointers.values());
				this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
				this.pinchMidpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			}
		};

		const onPointerMove = (event: PointerEvent): void => {
			if (!this.pointers.has(event.pointerId)) return;
			this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (this.pointers.size === 2) {
				const [a, b] = Array.from(this.pointers.values());
				const distance = Math.hypot(a.x - b.x, a.y - b.y);
				const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				const rect = viewport.getBoundingClientRect();

				if (this.pinchDistance > 0) {
					this.translateX += midpoint.x - this.pinchMidpoint.x;
					this.translateY += midpoint.y - this.pinchMidpoint.y;
					this.zoomAt(distance / this.pinchDistance, midpoint.x - rect.left, midpoint.y - rect.top);
				}

				this.pinchDistance = distance;
				this.pinchMidpoint = midpoint;
				return;
			}

			if (!this.dragging || !this.lastPointer) return;
			this.translateX += event.clientX - this.lastPointer.x;
			this.translateY += event.clientY - this.lastPointer.y;
			this.lastPointer = { x: event.clientX, y: event.clientY };
			this.applyTransform();
		};

		const endPointer = (event: PointerEvent): void => {
			this.pointers.delete(event.pointerId);
			if (this.pointers.size < 2) this.pinchDistance = 0;
			if (this.pointers.size === 0) {
				this.dragging = false;
				this.lastPointer = null;
				viewport.removeClass('is-dragging');
			} else if (this.pointers.size === 1) {
				const [remaining] = Array.from(this.pointers.values());
				this.dragging = true;
				this.lastPointer = { x: remaining.x, y: remaining.y };
			}
		};

		const onDoubleClick = (): void => this.fitToViewport();

		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				this.close();
			} else if (event.key === '+' || event.key === '=') {
				this.zoomBy(1.25);
			} else if (event.key === '-') {
				this.zoomBy(1 / 1.25);
			} else if (event.key === '0') {
				this.fitToViewport();
			}
		};

		viewport.addEventListener('wheel', onWheel, { passive: false });
		viewport.addEventListener('pointerdown', onPointerDown);
		viewport.addEventListener('pointermove', onPointerMove);
		viewport.addEventListener('pointerup', endPointer);
		viewport.addEventListener('pointercancel', endPointer);
		viewport.addEventListener('dblclick', onDoubleClick);
		document.addEventListener('keydown', onKeyDown);

		this.cleanups.push(() => {
			viewport.removeEventListener('wheel', onWheel);
			viewport.removeEventListener('pointerdown', onPointerDown);
			viewport.removeEventListener('pointermove', onPointerMove);
			viewport.removeEventListener('pointerup', endPointer);
			viewport.removeEventListener('pointercancel', endPointer);
			viewport.removeEventListener('dblclick', onDoubleClick);
			document.removeEventListener('keydown', onKeyDown);
		});
	}

	private fitToViewport(): void {
		const width = this.viewport.clientWidth;
		const height = this.viewport.clientHeight;
		if (width <= 0 || height <= 0) return;

		const availableWidth = Math.max(width - VIEWPORT_PADDING * 2, 64);
		const availableHeight = Math.max(height - VIEWPORT_PADDING * 2, 64);
		const fitScale = Math.min(availableWidth / this.naturalWidth, availableHeight / this.naturalHeight, MAX_FIT_SCALE);

		this.scale = Math.max(fitScale, MIN_SCALE);
		this.translateX = (width - this.naturalWidth * this.scale) / 2;
		this.translateY = (height - this.naturalHeight * this.scale) / 2;
		this.applyTransform();
	}

	private zoomBy(factor: number): void {
		this.zoomAt(factor, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2);
	}

	private zoomAt(factor: number, centerX: number, centerY: number): void {
		const nextScale = Math.min(Math.max(this.scale * factor, MIN_SCALE), MAX_SCALE);
		const ratio = nextScale / this.scale;
		this.translateX = centerX - (centerX - this.translateX) * ratio;
		this.translateY = centerY - (centerY - this.translateY) * ratio;
		this.scale = nextScale;
		this.applyTransform();
	}

	private applyTransform(): void {
		this.stage.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
		this.updateScaleLabel();
	}

	private updateScaleLabel(): void {
		if (this.scaleLabel) this.scaleLabel.setText(`${Math.round(this.scale * 100)}%`);
	}
}
