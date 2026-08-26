window.__ModuleLoader__.load({
	id: "@dpsagent/dsh-client-ui-design",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/cite.ts
		/** Source name keying the `design` reference codec. */
		const DESIGN_SOURCE = "design";
		/**
		* Tracks the id→ref pairs of every active citation and signals the overlay
		* when one of them disappears from the composer.
		*/
		var CitationController = class {
			active = /* @__PURE__ */ new Map();
			snapshot = {
				clearSeq: 0,
				clearedId: null
			};
			listeners = /* @__PURE__ */ new Set();
			getSnapshot = () => this.snapshot;
			subscribe = (fn) => {
				this.listeners.add(fn);
				return () => {
					this.listeners.delete(fn);
				};
			};
			emit() {
				for (const fn of [...this.listeners]) fn();
			}
			/** The ref of one active citation by element id, or undefined. */
			refOf(id) {
				return this.active.get(id);
			}
			/** Register an active citation's id→ref pair. */
			add(id, ref) {
				this.active.set(id, ref);
			}
			/** Forget one active citation by element id (local insert/remove). */
			remove(id) {
				this.active.delete(id);
			}
			/** Snapshot the active id→ref pairs (safe to mutate while iterating). */
			entries() {
				return [...this.active.entries()];
			}
			/** An active citation was removed externally: forget it and signal the overlay. */
			requestClear(id) {
				this.active.delete(id);
				this.snapshot = {
					clearSeq: this.snapshot.clearSeq + 1,
					clearedId: id
				};
				this.emit();
			}
		};
		/** Truncate a citation label to a chip-friendly length. */
		function selectionLabel(selection) {
			const text = selection.text.trim();
			const base = text === "" ? selection.tagName : text.slice(0, 40);
			return base === "" ? "设计元素" : base;
		}
		/** Human-readable clipboard projection of one citation. */
		function selectionClipboard(selection) {
			return [
				`<${selection.tagName}>`,
				`"${selection.text}"`,
				selection.href
			].filter((part) => part !== "" && part !== "<>").join(" ");
		}
		/** Model form of one citation: enough for the agent to locate and edit the source. */
		function serializeDesignRef(ref) {
			try {
				const selection = JSON.parse(ref);
				return `<design-selection tag="${selection.tagName}" selector="${selection.selector}" href="${selection.href}">${selection.text}</design-selection>`;
			} catch {
				return `<design-selection>${ref}</design-selection>`;
			}
		}
		/** Resolve the current session's input facade, or undefined. */
		function resolveInput(ctx) {
			const sessions = ctx.get("sessions");
			const conversation = ctx.get("conversation");
			if (sessions === void 0 || conversation === void 0) return void 0;
			const sessionId = sessions.list.getSnapshot().current;
			if (sessionId === void 0) return void 0;
			const binding = sessions.binding(sessionId);
			if (binding === void 0) return void 0;
			try {
				return conversation.input.for(binding.ctx);
			} catch {
				return;
			}
		}
		/**
		* Register the `design` reference source under the `@` roster. It contributes
		* no menu candidates; its codec is what serializes inserted citations on
		* submit.
		* @param ctx - Client root context.
		*/
		function registerDesignSource(ctx) {
			const inputTriggers = ctx.get("inputTriggers");
			if (inputTriggers === void 0) return;
			ctx.effect(() => inputTriggers.registerSource({
				trigger: "@",
				name: DESIGN_SOURCE,
				showGroupTitle: false,
				candidates: async () => [],
				onPick: () => void 0,
				codec: {
					clipboardText: (ref) => ref,
					serialize: (ref) => Promise.resolve(serializeDesignRef(ref))
				}
			}), "ui-design: reference source");
		}
		/**
		* Build the callback that inserts one captured selection as an inline
		* reference into the current session's composer draft and registers its
		* id→ref pair.
		* @param ctx - Client root context.
		* @param controller - the citation controller tracking active id→ref pairs.
		* @returns a stable insertion callback; a no-op when no session is current.
		*/
		function makeCiteSelection(ctx, controller) {
			return (selection) => {
				const input = resolveInput(ctx);
				if (input === void 0) return;
				const ref = JSON.stringify(selection);
				controller.add(selection.id, ref);
				try {
					const snapshot = input.state.getSnapshot();
					input.insertReference({
						source: DESIGN_SOURCE,
						ref,
						label: selectionLabel(selection),
						clipboardText: selectionClipboard(selection)
					}, {
						start: snapshot.draft.length,
						end: snapshot.draft.length,
						draftRev: snapshot.draftRev
					});
				} catch {}
			};
		}
		/**
		* Build the callback that removes the citation for one element id.
		* @param ctx - Client root context.
		* @param controller - the citation controller tracking active id→ref pairs.
		* @returns a stable removal callback; a no-op when the id is unknown.
		*/
		function makeRemoveCitation(ctx, controller) {
			return (id) => {
				const ref = controller.refOf(id);
				if (ref === void 0) return;
				const input = resolveInput(ctx);
				if (input === void 0) return;
				controller.remove(id);
				try {
					const snapshot = input.state.getSnapshot();
					const occurrence = snapshot.occurrences.find((o) => o.source === DESIGN_SOURCE && o.ref === ref);
					if (occurrence === void 0) return;
					const end = occurrence.offset + occurrence.length;
					const tailEnd = snapshot.draft[end] === " " ? end + 1 : end;
					input.setDraft(snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(tailEnd), {
						start: occurrence.offset,
						end: tailEnd,
						insertedLength: 0
					});
				} catch {}
			};
		}
		/**
		* Watch the current session's input state; when any active citation's
		* occurrence disappears (the user deleted the chip), signal the overlay so it
		* clears the matching iframe selection.
		* @param ctx - Client root context.
		* @param controller - the citation controller tracking active id→ref pairs.
		*/
		function watchCitationRemoval(ctx, controller) {
			const sessions = ctx.get("sessions");
			const conversation = ctx.get("conversation");
			if (sessions === void 0 || conversation === void 0) return;
			let inputOff;
			const attach = () => {
				if (inputOff !== void 0) {
					inputOff();
					inputOff = void 0;
				}
				const sessionId = sessions.list.getSnapshot().current;
				if (sessionId === void 0) return;
				const binding = sessions.binding(sessionId);
				if (binding === void 0) return;
				let input;
				try {
					input = conversation.input.for(binding.ctx);
				} catch {
					return;
				}
				inputOff = input.state.subscribe(() => {
					const occurrences = input.state.getSnapshot().occurrences;
					for (const [id, ref] of controller.entries()) if (!occurrences.some((o) => o.source === DESIGN_SOURCE && o.ref === ref)) controller.requestClear(id);
				});
			};
			const offList = sessions.list.subscribe(attach);
			attach();
			ctx.effect(() => () => {
				offList();
				if (inputOff !== void 0) inputOff();
			}, "ui-design: citation removal watch");
		}
		//#endregion
		//#region src/client/bridge.ts
		/**
		* The selection bridge injected into a same-origin preview iframe, and the
		* snippet a cross-origin preview app must include itself to participate.
		* In selection mode it highlights the hovered element, toggles persistent
		* selection boxes on click, supports shift-click multi-select, and posts each
		* change back to the parent window keyed by a stable element id. The parent
		* drives the mode and per-id clearing through postMessage.
		*/
		const BRIDGE_SOURCE = `(function () {
  if (window.__dshDesignBridge) return
  window.__dshDesignBridge = true

  var active = false
  var hoverEl = null
  var idCounter = 0
  // Element -> { id, box }: one selection box per selected element.
  var selected = new Map()

  function makeBox(color, bg) {
    var box = document.createElement('div')
    box.setAttribute('data-dsh-overlay', 'true')
    box.style.cssText = 'position:fixed;pointer-events:none;border:2px solid ' + color + ';border-radius:3px;z-index:2147483647;background:' + bg + ';display:none;'
    document.documentElement.appendChild(box)
    return box
  }

  var hoverBox = makeBox('#4f46e5', 'rgba(79,70,229,0.08)')

  var tagLabel = document.createElement('div')
  tagLabel.setAttribute('data-dsh-overlay', 'true')
  tagLabel.style.cssText = 'position:fixed;pointer-events:none;background:#4f46e5;color:#fff;font:11px/1.5 -apple-system,"Segoe UI",sans-serif;padding:2px 7px;border-radius:4px;z-index:2147483647;display:none;white-space:nowrap;'
  document.documentElement.appendChild(tagLabel)

  function isOverlay(el) {
    return !!el && el.getAttribute && el.getAttribute('data-dsh-overlay') === 'true'
  }

  function cssPath(node) {
    var parts = []
    var depth = 0
    while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
      var part = node.tagName.toLowerCase()
      if (node.id) { parts.unshift(part + '#' + node.id); break }
      var cls = (typeof node.className === 'string' ? node.className : '').trim().split(/\\s+/).slice(0, 2).join('.')
      if (cls) part += '.' + cls
      parts.unshift(part)
      node = node.parentElement
      depth += 1
    }
    return parts.join(' > ')
  }

  function place(box, el) {
    var r = el.getBoundingClientRect()
    if (r.width < 1 && r.height < 1) { box.style.display = 'none'; return false }
    box.style.display = 'block'
    box.style.left = r.left + 'px'
    box.style.top = r.top + 'px'
    box.style.width = r.width + 'px'
    box.style.height = r.height + 'px'
    return true
  }

  function refreshHover() {
    if (hoverEl && active) {
      if (place(hoverBox, hoverEl)) {
        var r = hoverEl.getBoundingClientRect()
        tagLabel.style.display = 'block'
        tagLabel.textContent = hoverEl.tagName.toLowerCase()
        tagLabel.style.left = r.left + 'px'
        tagLabel.style.top = Math.max(0, r.top - 22) + 'px'
      } else {
        tagLabel.style.display = 'none'
      }
    } else {
      hoverBox.style.display = 'none'
      tagLabel.style.display = 'none'
    }
  }

  function refreshSelected() {
    selected.forEach(function (entry, el) { place(entry.box, el) })
  }

  function describe(el) {
    return {
      type: 'dsh-design:selection',
      id: '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 500),
      selector: cssPath(el),
      tagName: el.tagName.toLowerCase(),
      href: location.href,
    }
  }

  function select(el) {
    if (selected.has(el)) return
    var id = 'dsh-' + (++idCounter)
    var box = makeBox('#e11d48', 'rgba(225,29,72,0.10)')
    box.setAttribute('data-dsh-selected', 'true')
    selected.set(el, { id: id, box: box })
    place(box, el)
    var data = describe(el)
    data.id = id
    parent.postMessage(data, '*')
  }

  function deselect(el, post) {
    var entry = selected.get(el)
    if (!entry) return
    entry.box.remove()
    selected.delete(el)
    if (post !== false) {
      parent.postMessage({ type: 'dsh-design:deselect', id: entry.id }, '*')
    }
  }

  function clearAll() {
    var els = []
    selected.forEach(function (_entry, el) { els.push(el) })
    for (var i = 0; i < els.length; i++) { deselect(els[i], true) }
  }

  function setActive(v) {
    if (active === v) return
    active = v
    if (!v) {
      hoverEl = null
      hoverBox.style.display = 'none'
      tagLabel.style.display = 'none'
      clearAll()
    }
  }

  function onMove(e) {
    if (!active) return
    var el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && isOverlay(el)) el = null
    hoverEl = el
    refreshHover()
  }

  function onClick(e) {
    if (!active) return
    var el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || isOverlay(el)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.shiftKey) {
      if (selected.has(el)) { deselect(el, true) } else { select(el) }
    } else if (selected.size === 1 && selected.has(el)) {
      deselect(el, true)
    } else {
      clearAll()
      select(el)
    }
  }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  window.addEventListener('scroll', function () { refreshHover(); refreshSelected() }, true)
  window.addEventListener('resize', function () { refreshHover(); refreshSelected() })

  window.addEventListener('message', function (event) {
    var data = event.data
    if (!data || typeof data !== 'object') return
    if (data.type === 'dsh-design:mode') setActive(data.active === true)
    if (data.type === 'dsh-design:clear') {
      selected.forEach(function (entry, el) {
        if (entry.id === data.id) deselect(el, false)
      })
    }
  })
})()`;
		//#endregion
		//#region src/client/stores.ts
		/**
		* Design-mode interaction store: the transient viewing state behind the
		* sidebar toggle and the full-frame design overlay. Both entries are
		* root-scope, so they share the single handle constructed in `apply`. The
		* URL and its history persist across reloads; `selection` is deliberately
		* transient and lives in the overlay component instead.
		*/
		/** Default preview URL; editable from the design panel header. */
		const DEFAULT_PREVIEW_URL = "http://localhost:3000";
		/**
		* Create the design-mode store handle. Constructed once in `apply` and shared
		* by the toggle and overlay registrations; never exported at module level.
		* @returns the shared store handle.
		*/
		function createDesignStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					active: false,
					url: DEFAULT_PREVIEW_URL,
					selectMode: true,
					urlHistory: [],
					chatWidth: 25
				}),
				persist: "dsh-design-v2",
				actions: {
					setActive: (draft, active) => {
						draft.active = active;
					},
					setSelectMode: (draft, selectMode) => {
						draft.selectMode = selectMode;
					},
					commitUrl: (draft, url) => {
						const trimmed = url.trim();
						if (trimmed === "") return;
						draft.url = trimmed;
						draft.urlHistory = [trimmed, ...draft.urlHistory.filter((item) => item !== trimmed)].slice(0, 10);
					},
					setChatWidth: (draft, chatWidth) => {
						draft.chatWidth = Math.min(60, Math.max(15, chatWidth));
					}
				}
			});
		}
		//#endregion
		//#region \0dsh-css:/root/workplace/deepseek-harness-src/packages/client/ui-design/src/client/DesignMode.module.css.mjs
		const css$1 = "._WIuaa_overlay{z-index:20;display:flex;position:absolute;inset:0}._WIuaa_chatDock{min-width:0}._WIuaa_divider{cursor:col-resize;pointer-events:auto;touch-action:none;flex:none;width:8px;position:relative}._WIuaa_divider:after{content:\"\";background:var(--dsw-alias-border-l2);width:1px;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);position:absolute;top:0;bottom:0;left:50%;transform:translate(-50%)}._WIuaa_divider:hover:after{background:var(--dsw-alias-brand-primary)}._WIuaa_preview{background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l2);flex-direction:column;flex:1;min-width:0;display:flex}._WIuaa_header{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);flex:none;align-items:center;gap:8px;min-width:0;padding:8px 12px;display:flex}._WIuaa_urlWrap{flex:0 320px;min-width:120px;position:relative}._WIuaa_url{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);width:100%;min-width:0;height:32px;color:var(--dsw-alias-label-primary);transition:border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out), box-shadow var(--ds-transition-duration-fast) var(--ds-ease-in-out);border-radius:8px;outline:none;padding:0 10px;font-family:inherit;font-size:13px;line-height:20px;display:block}._WIuaa_url::placeholder{color:var(--dsw-alias-label-tertiary)}._WIuaa_url:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent)}._WIuaa_urlMenu{background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);max-height:240px;box-shadow:var(--dsw-shadow-lv3);z-index:30;border-radius:12px;margin:0;padding:4px;list-style:none;position:absolute;top:calc(100% + 6px);left:0;right:0;overflow-y:auto}._WIuaa_urlMenuItem{width:100%;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:none;border-radius:8px;padding:6px 8px;font-family:inherit;font-size:13px;line-height:20px;display:block;overflow:hidden}._WIuaa_urlMenuItem:hover{background:var(--dsw-alias-interactive-bg-hover)}._WIuaa_selectToggle{width:32px;height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out), color var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;border:none;border-radius:8px;flex:none;justify-content:center;align-items:center;margin-left:auto;padding:0;display:inline-flex}._WIuaa_selectToggle:hover{background:var(--dsw-alias-interactive-bg-hover)}._WIuaa_selectToggle[data-active]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-active)}._WIuaa_selectToggle:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent);outline:none}._WIuaa_button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);border-radius:8px;flex:none;justify-content:center;align-items:center;gap:6px;padding:0 12px;font-family:inherit;font-size:13px;line-height:20px;display:inline-flex}._WIuaa_button:hover{background:var(--dsw-alias-interactive-bg-hover)}._WIuaa_button:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent);outline:none}._WIuaa_iconButton{width:32px;height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;border:none;border-radius:8px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}._WIuaa_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}._WIuaa_iconButton:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent);outline:none}._WIuaa_frameWrap{background:var(--dsw-alias-bg-layer-1);flex:1;min-height:0}._WIuaa_frame{background:#fff;border:none;width:100%;height:100%;display:block}._WIuaa_citation{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex:none;align-items:center;gap:10px;padding:8px 12px;display:flex}._WIuaa_citationLabel{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:12px;font-weight:500;line-height:18px}._WIuaa_citationText{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;line-height:20px;overflow:hidden}._WIuaa_citationMeta{text-overflow:ellipsis;white-space:nowrap;max-width:40%;color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:18px;overflow:hidden}@media (prefers-reduced-motion:reduce){._WIuaa_url,._WIuaa_switchTrack,._WIuaa_switchThumb,._WIuaa_button{transition:none}}";
		const tagId$1 = "@dpsagent/dsh-client-ui-design/DesignMode.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dpsagent/dsh-client-ui-design";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var DesignMode_module_css_default = {
			"button": "_WIuaa_button",
			"chatDock": "_WIuaa_chatDock",
			"citation": "_WIuaa_citation",
			"citationLabel": "_WIuaa_citationLabel",
			"citationMeta": "_WIuaa_citationMeta",
			"citationText": "_WIuaa_citationText",
			"divider": "_WIuaa_divider",
			"frame": "_WIuaa_frame",
			"frameWrap": "_WIuaa_frameWrap",
			"header": "_WIuaa_header",
			"iconButton": "_WIuaa_iconButton",
			"overlay": "_WIuaa_overlay",
			"preview": "_WIuaa_preview",
			"selectToggle": "_WIuaa_selectToggle",
			"switchThumb": "_WIuaa_switchThumb",
			"switchTrack": "_WIuaa_switchTrack",
			"url": "_WIuaa_url",
			"urlMenu": "_WIuaa_urlMenu",
			"urlMenuItem": "_WIuaa_urlMenuItem",
			"urlWrap": "_WIuaa_urlWrap"
		};
		//#endregion
		//#region src/client/DesignMode.tsx
		/**
		* Full-frame design-mode overlay. While active it re-flows the app shell to a
		* 25% chat column (via the `data-dsh-design-mode` body attribute and the
		* global reflow stylesheet) and renders the preview iframe in the remaining
		* 75%. Selection capture runs through a same-origin injected bridge plus a
		* postMessage listener for cooperative cross-origin previews; a header switch
		* drives the bridge's hover-highlight / click-select mode, and the URL field
		* keeps a recent history it offers on focus.
		*/
		/**
		* Rewrite a preview target to the same-origin proxy route when it is cross-origin
		* with the DSH UI, so the overlay can inject the selection bridge (browsers block
		* cross-origin iframe DOM access). Same-origin targets load directly. The address
		* bar keeps showing the original URL; only the iframe src is proxied.
		*/
		const proxySrc = (target) => {
			if (target === "") return target;
			try {
				if (new URL(target).origin === window.location.origin) return target;
			} catch {}
			return "/api/design.proxy?url=" + encodeURIComponent(target);
		};
		/** Close/exit glyph. */
		const CloseIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			viewBox: "0 0 24 24",
			width: "16",
			height: "16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M18 6 6 18M6 6l12 12" })
		});
		/** Cursor glyph: element-selection mode. */
		const CursorIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			viewBox: "0 0 24 24",
			width: "16",
			height: "16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" })
		});
		const DesignMode = ({ useStore, actions, citeSelection, removeCitation, useCitation }) => {
			const active = useStore((s) => s.active);
			const url = useStore((s) => s.url);
			const selectMode = useStore((s) => s.selectMode);
			const urlHistory = useStore((s) => s.urlHistory);
			const chatWidth = useStore((s) => typeof s.chatWidth === "number" ? s.chatWidth : 25);
			const citation = useCitation((s) => s);
			const frameRef = (0, react.useRef)(null);
			const overlayRef = (0, react.useRef)(null);
			const selectModeRef = (0, react.useRef)(selectMode);
			selectModeRef.current = selectMode;
			const [selections, setSelections] = (0, react.useState)([]);
			const [draftUrl, setDraftUrl] = (0, react.useState)(url);
			const [urlMenuOpen, setUrlMenuOpen] = (0, react.useState)(false);
			const chatDockRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const dragFrameRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				setDraftUrl(url);
			}, [url]);
			(0, react.useEffect)(() => {
				if (!active) return;
				document.body.dataset.dshDesignMode = "true";
				return () => {
					delete document.body.dataset.dshDesignMode;
				};
			}, [active]);
			(0, react.useEffect)(() => {
				document.body.style.setProperty("--dsh-design-chat-width", `${chatWidth}%`);
				return () => {
					document.body.style.removeProperty("--dsh-design-chat-width");
				};
			}, [chatWidth]);
			(0, react.useEffect)(() => {
				if (citation.clearSeq === 0) return;
				frameRef.current?.contentWindow?.postMessage({
					type: "dsh-design:clear",
					id: citation.clearedId
				}, "*");
				setSelections((prev) => prev.filter((item) => item.id !== citation.clearedId));
			}, [citation.clearSeq, citation.clearedId]);
			(0, react.useEffect)(() => {
				if (!active) return;
				const onMessage = (event) => {
					const data = event.data;
					if (data === null || typeof data !== "object") return;
					if (data.type === "dsh-design:deselect") {
						const id = typeof data.id === "string" ? data.id : "";
						setSelections((prev) => prev.filter((item) => item.id !== id));
						removeCitation(id);
						return;
					}
					if (data.type !== "dsh-design:selection") return;
					const id = typeof data.id === "string" ? data.id : "";
					const next = {
						id,
						text: typeof data.text === "string" ? data.text : "",
						selector: typeof data.selector === "string" ? data.selector : "",
						tagName: typeof data.tagName === "string" ? data.tagName : "",
						href: typeof data.href === "string" ? data.href : ""
					};
					setSelections((prev) => prev.some((item) => item.id === id) ? prev : [...prev, {
						id,
						selection: next
					}]);
					citeSelection(next);
				};
				window.addEventListener("message", onMessage);
				return () => window.removeEventListener("message", onMessage);
			}, [
				active,
				citeSelection,
				removeCitation
			]);
			(0, react.useEffect)(() => {
				if (!active) return;
				frameRef.current?.contentWindow?.postMessage({
					type: "dsh-design:mode",
					active: selectMode
				}, "*");
			}, [active, selectMode]);
			const onFrameLoad = (0, react.useCallback)(() => {
				const frame = frameRef.current;
				if (frame === null) return;
				try {
					const doc = frame.contentDocument;
					if (doc !== null && doc.head !== null && doc.getElementById("dsh-design-bridge") === null) {
						const script = doc.createElement("script");
						script.id = "dsh-design-bridge";
						script.textContent = BRIDGE_SOURCE;
						doc.head.appendChild(script);
					}
				} catch {}
				frame.contentWindow?.postMessage({
					type: "dsh-design:mode",
					active: selectModeRef.current
				}, "*");
			}, []);
			const commit = (0, react.useCallback)((value) => {
				const trimmed = value.trim();
				if (trimmed === "") {
					setDraftUrl(url);
					return;
				}
				actions.commitUrl(trimmed);
			}, [actions, url]);
			const onDividerDown = (0, react.useCallback)((event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = {
					startX: event.clientX,
					startWidth: chatWidth,
					latestPct: chatWidth
				};
				document.body.dataset.dshDesignDragging = "true";
			}, [chatWidth]);
			const onDividerMove = (0, react.useCallback)((event) => {
				if (dragRef.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
				const clientX = event.clientX;
				if (dragFrameRef.current === null) dragFrameRef.current = requestAnimationFrame(() => {
					dragFrameRef.current = null;
					const current = dragRef.current;
					if (current === null) return;
					const width = overlayRef.current?.getBoundingClientRect().width ?? window.innerWidth;
					const pct = Math.min(60, Math.max(15, current.startWidth + (clientX - current.startX) / width * 100));
					current.latestPct = pct;
					if (chatDockRef.current !== null) chatDockRef.current.style.width = `${pct}%`;
					document.body.style.setProperty("--dsh-design-chat-width", `${pct}%`);
				});
			}, []);
			const onDividerUp = (0, react.useCallback)((event) => {
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
				if (dragFrameRef.current !== null) {
					cancelAnimationFrame(dragFrameRef.current);
					dragFrameRef.current = null;
				}
				const state = dragRef.current;
				if (state !== null) actions.setChatWidth(state.latestPct);
				dragRef.current = null;
				delete document.body.dataset.dshDesignDragging;
			}, [actions]);
			if (!active) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: overlayRef,
				className: DesignMode_module_css_default.overlay,
				style: { pointerEvents: "none" },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: chatDockRef,
						className: DesignMode_module_css_default.chatDock,
						style: { width: `${chatWidth}%` },
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: DesignMode_module_css_default.divider,
						onPointerDown: onDividerDown,
						onPointerMove: onDividerMove,
						onPointerUp: onDividerUp,
						onPointerCancel: onDividerUp
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: DesignMode_module_css_default.preview,
						style: { pointerEvents: "auto" },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: DesignMode_module_css_default.header,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: DesignMode_module_css_default.urlWrap,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: DesignMode_module_css_default.url,
											value: draftUrl,
											spellCheck: false,
											placeholder: "http://localhost:3000",
											"aria-label": "预览地址",
											onFocus: () => setUrlMenuOpen(true),
											onChange: (event) => setDraftUrl(event.currentTarget.value),
											onKeyDown: (event) => {
												if (event.key === "Enter") {
													commit(draftUrl);
													event.currentTarget.blur();
												} else if (event.key === "Escape") {
													setDraftUrl(url);
													event.currentTarget.blur();
												}
											},
											onBlur: () => {
												commit(draftUrl);
												window.setTimeout(() => setUrlMenuOpen(false), 150);
											}
										}), urlMenuOpen && urlHistory.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											className: DesignMode_module_css_default.urlMenu,
											children: urlHistory.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: DesignMode_module_css_default.urlMenuItem,
												onMouseDown: (event) => {
													event.preventDefault();
													setDraftUrl(item);
													actions.commitUrl(item);
													setUrlMenuOpen(false);
												},
												children: item
											}) }, item))
										}) : null]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: DesignMode_module_css_default.selectToggle,
										role: "switch",
										"aria-checked": selectMode,
										"data-active": selectMode || void 0,
										title: selectMode ? "切换到浏览模式" : "切换到选中模式",
										onClick: () => actions.setSelectMode(!selectMode),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CursorIcon, {})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: DesignMode_module_css_default.iconButton,
										"aria-label": "退出设计模式",
										title: "退出设计模式",
										onClick: () => actions.setActive(false),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, {})
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: DesignMode_module_css_default.frameWrap,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
									ref: frameRef,
									className: DesignMode_module_css_default.frame,
									src: proxySrc(url),
									title: "设计预览",
									onLoad: onFrameLoad
								})
							}),
							selections.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
								className: DesignMode_module_css_default.citation,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: DesignMode_module_css_default.citationLabel,
										children: ["引用 · ", selections.length]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: DesignMode_module_css_default.citationText,
										title: selections.map((item) => item.selection.text).join("、"),
										children: selections.map((item) => item.selection.text || item.selection.tagName).join("、")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: DesignMode_module_css_default.button,
										onClick: () => {
											navigator.clipboard?.writeText(selections.map((item) => item.selection.text).filter((text) => text !== "").join("\n"));
										},
										children: "复制"
									})
								]
							}) : null
						]
					})
				]
			});
		};
		//#endregion
		//#region \0dsh-css:/root/workplace/deepseek-harness-src/packages/client/ui-design/src/client/DesignToggle.module.css.mjs
		const css = ".R7NJpW_button{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:8px;flex:none;align-items:center;gap:6px;padding:8px 10px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}.R7NJpW_button:hover{background:var(--dsw-alias-interactive-bg-hover)}.R7NJpW_button[data-active]{color:var(--dsw-alias-brand-primary)}.R7NJpW_button:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary);outline:none}.R7NJpW_icon{flex:none;justify-content:center;align-items:center;width:16px;height:16px;display:inline-flex}.R7NJpW_label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.R7NJpW_separator{background:var(--dsw-alias-border-l2);flex:none;height:1px;margin:4px 10px}";
		const tagId = "@dpsagent/dsh-client-ui-design/DesignToggle.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dpsagent/dsh-client-ui-design";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var DesignToggle_module_css_default = {
			"button": "R7NJpW_button",
			"icon": "R7NJpW_icon",
			"label": "R7NJpW_label",
			"separator": "R7NJpW_separator"
		};
		//#endregion
		//#region src/client/DesignToggle.tsx
		/** Palette glyph. */
		const PaletteIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			viewBox: "0 0 24 24",
			width: "16",
			height: "16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "13.5",
					cy: "6.5",
					r: ".5",
					fill: "currentColor"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "17.5",
					cy: "10.5",
					r: ".5",
					fill: "currentColor"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8.5",
					cy: "7.5",
					r: ".5",
					fill: "currentColor"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "6.5",
					cy: "12.5",
					r: ".5",
					fill: "currentColor"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" })
			]
		});
		const DesignToggle = ({ useStore, actions, wide }) => {
			const active = useStore((s) => s.active);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: DesignToggle_module_css_default.button,
				"data-active": active || void 0,
				"aria-pressed": active,
				title: active ? "退出设计模式" : "进入设计模式",
				onClick: () => actions.setActive(!active),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DesignToggle_module_css_default.icon,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PaletteIcon, {})
				}), wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: DesignToggle_module_css_default.label,
					children: active ? "退出设计模式" : "设计模式"
				}) : null]
			}), wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: DesignToggle_module_css_default.separator,
				"aria-hidden": "true"
			}) : null] });
		};
		//#endregion
		//#region \0dsh-inline-css:/root/workplace/deepseek-harness-src/packages/client/ui-design/src/client/styles.css.mjs
		var styles_css_default = "[data-dsh-design-mode=true] [data-slot=root]>div{grid-template-columns:0 minmax(0, var(--dsh-design-chat-width,25%)) 0!important}[data-dsh-design-dragging=true] [data-slot=root]>div{transition:none!important}[data-dsh-design-mode=true] [data-slot=root]>div>:has(>[data-slot=sidebar]){border-right:none}[data-dsh-design-mode=true] [data-slot=root]>div>:has(>[data-slot=details]){border-left:none}";
		//#endregion
		//#region src/client/index.ts
		/** Slot registry required by this presentation plugin. */
		const inject = ["slots"];
		/**
		* Register the design-mode surface without exporting React components as
		* package values. The toggle and overlay share one root-scope store handle.
		* @param ctx - Client root context.
		*/
		function apply(ctx) {
			const store = createDesignStore();
			registerDesignSource(ctx);
			const citation = new CitationController();
			watchCitationRemoval(ctx, citation);
			const citeSelection = makeCiteSelection(ctx, citation);
			const removeCitation = makeRemoveCitation(ctx, citation);
			if (typeof document !== "undefined") ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@dpsagent/dsh-client-ui-design";
				tag.dataset.pluginCss = "@dpsagent/dsh-client-ui-design/styles.css";
				tag.textContent = styles_css_default;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "ui-design: stylesheet");
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "design",
				order: 30,
				label: "设计模式",
				store
			}, DesignToggle));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "design",
				order: 50,
				store,
				inject: () => ({
					citeSelection,
					removeCitation,
					hooks: { citation }
				})
			}, DesignMode));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map