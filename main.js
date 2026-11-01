/* Mermaid Fullscreen - built bundle */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MermaidFullscreenPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var MERMAID_SELECTOR = ".mermaid";
var HOST_CLASS = "mermaid-fs-host";
var BUTTON_CLASS = "mermaid-fs-button";
var MODAL_CLASS = "mermaid-fs-modal";
var VIEWPORT_CLASS = "mermaid-fs-viewport";
var STAGE_CLASS = "mermaid-fs-stage";
var MIN_SCALE = 0.05;
var MAX_SCALE = 8;
var MAX_FIT_SCALE = 2.5;
var VIEWPORT_PADDING = 48;
var MermaidFullscreenPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.observer = null;
    this.scanScheduled = false;
    this.activeModal = null;
  }
  onload() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          this.scheduleScan();
          return;
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleScan()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleScan()));
    this.registerDomEvent(window, "resize", () => this.scheduleScan());
    this.app.workspace.onLayoutReady(() => this.scheduleScan());
    this.decorateAll();
  }
  onunload() {
    var _a, _b;
    (_a = this.observer) == null ? void 0 : _a.disconnect();
    this.observer = null;
    (_b = this.activeModal) == null ? void 0 : _b.close();
    for (const button of Array.from(document.querySelectorAll(`.${BUTTON_CLASS}`))) {
      button.remove();
    }
    for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) {
      host.removeClass(HOST_CLASS);
    }
  }
  scheduleScan() {
    if (this.scanScheduled) return;
    this.scanScheduled = true;
    window.requestAnimationFrame(() => {
      this.scanScheduled = false;
      this.decorateAll();
    });
  }
  decorateAll() {
    for (const block of Array.from(document.querySelectorAll(MERMAID_SELECTOR))) {
      this.decorateBlock(block);
    }
  }
  decorateBlock(block) {
    var _a, _b, _c;
    if (block.closest(`.${MODAL_CLASS}`)) return;
    if (!block.querySelector("svg")) return;
    const host = (_c = (_b = (_a = block.closest(".cm-embed-block")) != null ? _a : block.closest(".mermaid-wrapper")) != null ? _b : block.closest("el-pre")) != null ? _c : block;
    const existing = host.querySelector(`:scope > .${BUTTON_CLASS}`);
    if (existing) {
      this.positionButton(host, existing, block);
      return;
    }
    host.addClass(HOST_CLASS);
    const button = createEl("button", { cls: `clickable-icon ${BUTTON_CLASS}` });
    button.setAttribute("aria-label", "\u5168\u5C4F\u67E5\u770B Mermaid \u56FE");
    button.setAttribute("title", "\u5168\u5C4F\u67E5\u770B");
    (0, import_obsidian.setIcon)(button, "maximize");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentSvg = block.querySelector("svg");
      if (!currentSvg) return;
      this.activeModal = new MermaidFullscreenModal(this.app, currentSvg);
      this.activeModal.open();
    });
    host.appendChild(button);
    this.positionButton(host, button, block);
  }
  // 把按钮贴到「图」的左上角，而不是整个代码块的最左侧
  positionButton(host, button, block) {
    const svg = block.querySelector("svg");
    if (!svg) return;
    const hostRect = host.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    if (hostRect.width === 0 || svgRect.width === 0) return;
    const top = svgRect.top - hostRect.top + 8;
    const left = svgRect.left - hostRect.left + 8;
    button.style.top = `${Math.max(4, top)}px`;
    button.style.left = `${Math.max(4, left)}px`;
    button.style.right = "";
  }
};
var MermaidFullscreenModal = class extends import_obsidian.Modal {
  constructor(app, sourceSvg) {
    var _a;
    super(app);
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.pointers = /* @__PURE__ */ new Map();
    this.dragging = false;
    this.lastPointer = null;
    this.pinchDistance = 0;
    this.pinchMidpoint = { x: 0, y: 0 };
    this.cleanups = [];
    this.sourceSvg = sourceSvg;
    const viewBox = (_a = sourceSvg.viewBox) == null ? void 0 : _a.baseVal;
    const rect = sourceSvg.getBoundingClientRect();
    this.naturalWidth = viewBox && viewBox.width > 0 ? viewBox.width : rect.width || 800;
    this.naturalHeight = viewBox && viewBox.height > 0 ? viewBox.height : rect.height || 600;
  }
  onOpen() {
    this.modalEl.addClass(MODAL_CLASS);
    this.contentEl.addClass("mermaid-fs-content");
    this.contentEl.empty();
    this.viewport = this.contentEl.createDiv({ cls: VIEWPORT_CLASS });
    this.stage = this.viewport.createDiv({ cls: STAGE_CLASS });
    const holder = this.stage.createDiv({ cls: "mermaid mermaid-fs-clone" });
    const clone = this.sourceSvg.cloneNode(true);
    clone.style.width = `${this.naturalWidth}px`;
    clone.style.height = `${this.naturalHeight}px`;
    clone.style.maxWidth = "none";
    clone.style.display = "block";
    holder.appendChild(clone);
    this.buildControls();
    this.bindInteractions();
    window.requestAnimationFrame(() => this.fitToViewport());
  }
  onClose() {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.contentEl.empty();
  }
  buildControls() {
    const controls = this.contentEl.createDiv({ cls: "mermaid-fs-controls" });
    const addButton = (icon, label, onClick) => {
      const button = controls.createEl("button", { cls: "clickable-icon mermaid-fs-control-button" });
      (0, import_obsidian.setIcon)(button, icon);
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    };
    addButton("minus", "\u7F29\u5C0F", () => this.zoomBy(1 / 1.25));
    this.scaleLabel = controls.createSpan({ cls: "mermaid-fs-scale" });
    addButton("plus", "\u653E\u5927", () => this.zoomBy(1.25));
    addButton("rotate-ccw", "\u9002\u5E94\u7A97\u53E3", () => this.fitToViewport());
    addButton("x", "\u5173\u95ED", () => this.close());
    this.updateScaleLabel();
  }
  bindInteractions() {
    const { viewport } = this;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    const onPointerDown = (event) => {
      if (event.target.closest("button")) return;
      viewport.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.lastPointer = { x: event.clientX, y: event.clientY };
        viewport.addClass("is-dragging");
      } else if (this.pointers.size === 2) {
        this.dragging = false;
        viewport.removeClass("is-dragging");
        const [a, b] = Array.from(this.pointers.values());
        this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        this.pinchMidpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    };
    const onPointerMove = (event) => {
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
    const endPointer = (event) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinchDistance = 0;
      if (this.pointers.size === 0) {
        this.dragging = false;
        this.lastPointer = null;
        viewport.removeClass("is-dragging");
      } else if (this.pointers.size === 1) {
        const [remaining] = Array.from(this.pointers.values());
        this.dragging = true;
        this.lastPointer = { x: remaining.x, y: remaining.y };
      }
    };
    const onDoubleClick = () => this.fitToViewport();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        this.close();
      } else if (event.key === "+" || event.key === "=") {
        this.zoomBy(1.25);
      } else if (event.key === "-") {
        this.zoomBy(1 / 1.25);
      } else if (event.key === "0") {
        this.fitToViewport();
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);
    viewport.addEventListener("dblclick", onDoubleClick);
    document.addEventListener("keydown", onKeyDown);
    this.cleanups.push(() => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", endPointer);
      viewport.removeEventListener("pointercancel", endPointer);
      viewport.removeEventListener("dblclick", onDoubleClick);
      document.removeEventListener("keydown", onKeyDown);
    });
  }
  fitToViewport() {
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
  zoomBy(factor) {
    this.zoomAt(factor, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2);
  }
  zoomAt(factor, centerX, centerY) {
    const nextScale = Math.min(Math.max(this.scale * factor, MIN_SCALE), MAX_SCALE);
    const ratio = nextScale / this.scale;
    this.translateX = centerX - (centerX - this.translateX) * ratio;
    this.translateY = centerY - (centerY - this.translateY) * ratio;
    this.scale = nextScale;
    this.applyTransform();
  }
  applyTransform() {
    this.stage.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    this.updateScaleLabel();
  }
  updateScaleLabel() {
    if (this.scaleLabel) this.scaleLabel.setText(`${Math.round(this.scale * 100)}%`);
  }
};
