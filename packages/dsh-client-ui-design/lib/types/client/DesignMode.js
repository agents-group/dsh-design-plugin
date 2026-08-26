import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Full-frame design-mode overlay. While active it re-flows the app shell to a
 * 25% chat column (via the `data-dsh-design-mode` body attribute and the
 * global reflow stylesheet) and renders the preview iframe in the remaining
 * 75%. Selection capture runs through a same-origin injected bridge plus a
 * postMessage listener for cooperative cross-origin previews; a header switch
 * drives the bridge's hover-highlight / click-select mode, and the URL field
 * keeps a recent history it offers on focus.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BRIDGE_SOURCE } from "./bridge.js";
import { CHAT_WIDTH_DEFAULT, CHAT_WIDTH_MAX, CHAT_WIDTH_MIN } from "./stores.js";
import css from './DesignMode.module.css';
const PROXY_PATH = '/api/design.proxy';
/**
 * Rewrite a preview target to the same-origin proxy route when it is cross-origin
 * with the DSH UI, so the overlay can inject the selection bridge (browsers block
 * cross-origin iframe DOM access). Same-origin targets load directly. The address
 * bar keeps showing the original URL; only the iframe src is proxied.
 */
const proxySrc = (target) => {
    if (target === '')
        return target;
    try {
        if (new URL(target).origin === window.location.origin)
            return target;
    }
    catch {
        // Unparseable: pass through to the proxy, which answers 400.
    }
    return PROXY_PATH + '?url=' + encodeURIComponent(target);
};
/** Close/exit glyph. */
const CloseIcon = () => (_jsx("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "M18 6 6 18M6 6l12 12" }) }));
/** Cursor glyph: element-selection mode. */
const CursorIcon = () => (_jsx("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" }) }));
export const DesignMode = ({ useStore, actions, citeSelection, removeCitation, useCitation }) => {
    const active = useStore(s => s.active);
    const url = useStore(s => s.url);
    const selectMode = useStore(s => s.selectMode);
    const urlHistory = useStore(s => s.urlHistory);
    const chatWidth = useStore(s => (typeof s.chatWidth === 'number' ? s.chatWidth : CHAT_WIDTH_DEFAULT));
    const citation = useCitation(s => s);
    const frameRef = useRef(null);
    const overlayRef = useRef(null);
    const selectModeRef = useRef(selectMode);
    selectModeRef.current = selectMode;
    const [selections, setSelections] = useState([]);
    const [draftUrl, setDraftUrl] = useState(url);
    const [urlMenuOpen, setUrlMenuOpen] = useState(false);
    const chatDockRef = useRef(null);
    const dragRef = useRef(null);
    const dragFrameRef = useRef(null);
    // Keep the address-bar draft in step with the committed URL.
    useEffect(() => { setDraftUrl(url); }, [url]);
    // Re-flow the shell while active; the global stylesheet keys off this flag.
    useEffect(() => {
        if (!active)
            return;
        document.body.dataset.dshDesignMode = 'true';
        return () => { delete document.body.dataset.dshDesignMode; };
    }, [active]);
    // Publish the resizable chat width as a CSS custom property for the reflow sheet.
    useEffect(() => {
        document.body.style.setProperty('--dsh-design-chat-width', `${chatWidth}%`);
        return () => { document.body.style.removeProperty('--dsh-design-chat-width'); };
    }, [chatWidth]);
    // A citation was removed from the composer: clear the matching iframe selection.
    useEffect(() => {
        if (citation.clearSeq === 0)
            return;
        frameRef.current?.contentWindow?.postMessage({ type: 'dsh-design:clear', id: citation.clearedId }, '*');
        setSelections(prev => prev.filter(item => item.id !== citation.clearedId));
    }, [citation.clearSeq, citation.clearedId]);
    // Accept selection messages from the preview iframe (cross-origin bridge).
    useEffect(() => {
        if (!active)
            return;
        const onMessage = (event) => {
            const data = event.data;
            if (data === null || typeof data !== 'object')
                return;
            if (data.type === 'dsh-design:deselect') {
                const id = typeof data.id === 'string' ? data.id : '';
                setSelections(prev => prev.filter(item => item.id !== id));
                removeCitation(id);
                return;
            }
            if (data.type !== 'dsh-design:selection')
                return;
            const id = typeof data.id === 'string' ? data.id : '';
            const next = {
                id,
                text: typeof data.text === 'string' ? data.text : '',
                selector: typeof data.selector === 'string' ? data.selector : '',
                tagName: typeof data.tagName === 'string' ? data.tagName : '',
                href: typeof data.href === 'string' ? data.href : '',
            };
            setSelections(prev => prev.some(item => item.id === id) ? prev : [...prev, { id, selection: next }]);
            citeSelection(next);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [active, citeSelection, removeCitation]);
    // Push the selection-mode switch state into the iframe bridge.
    useEffect(() => {
        if (!active)
            return;
        frameRef.current?.contentWindow?.postMessage({ type: 'dsh-design:mode', active: selectMode }, '*');
    }, [active, selectMode]);
    // Inject the bridge into a same-origin iframe once its document is ready,
    // then push the current selection-mode state (the fresh bridge defaults off).
    const onFrameLoad = useCallback(() => {
        const frame = frameRef.current;
        if (frame === null)
            return;
        try {
            const doc = frame.contentDocument;
            if (doc !== null && doc.head !== null && doc.getElementById('dsh-design-bridge') === null) {
                const script = doc.createElement('script');
                script.id = 'dsh-design-bridge';
                script.textContent = BRIDGE_SOURCE;
                doc.head.appendChild(script);
            }
        }
        catch {
            // Cross-origin frame: the preview app must include the bridge snippet itself.
        }
        frame.contentWindow?.postMessage({ type: 'dsh-design:mode', active: selectModeRef.current }, '*');
    }, []);
    const commit = useCallback((value) => {
        const trimmed = value.trim();
        if (trimmed === '') {
            setDraftUrl(url);
            return;
        }
        actions.commitUrl(trimmed);
    }, [actions, url]);
    // Divider drag: rAF-throttled DOM writes while dragging, one store commit on
    // release (mirrors AppFrame's DragHandle so the column edge tracks the pointer
    // without a React re-render per pointermove).
    const onDividerDown = useCallback((event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startX: event.clientX, startWidth: chatWidth, latestPct: chatWidth };
        document.body.dataset.dshDesignDragging = 'true';
    }, [chatWidth]);
    const onDividerMove = useCallback((event) => {
        const state = dragRef.current;
        if (state === null || !event.currentTarget.hasPointerCapture(event.pointerId))
            return;
        const clientX = event.clientX;
        if (dragFrameRef.current === null) {
            dragFrameRef.current = requestAnimationFrame(() => {
                dragFrameRef.current = null;
                const current = dragRef.current;
                if (current === null)
                    return;
                const width = overlayRef.current?.getBoundingClientRect().width ?? window.innerWidth;
                const pct = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, current.startWidth + ((clientX - current.startX) / width) * 100));
                current.latestPct = pct;
                if (chatDockRef.current !== null)
                    chatDockRef.current.style.width = `${pct}%`;
                document.body.style.setProperty('--dsh-design-chat-width', `${pct}%`);
            });
        }
    }, []);
    const onDividerUp = useCallback((event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }
        const state = dragRef.current;
        if (state !== null)
            actions.setChatWidth(state.latestPct);
        dragRef.current = null;
        delete document.body.dataset.dshDesignDragging;
    }, [actions]);
    if (!active)
        return null;
    return (_jsxs("div", { ref: overlayRef, className: css.overlay, style: { pointerEvents: 'none' }, children: [_jsx("div", { ref: chatDockRef, className: css.chatDock, style: { width: `${chatWidth}%` }, "aria-hidden": "true" }), _jsx("div", { className: css.divider, onPointerDown: onDividerDown, onPointerMove: onDividerMove, onPointerUp: onDividerUp, onPointerCancel: onDividerUp }), _jsxs("section", { className: css.preview, style: { pointerEvents: 'auto' }, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { className: css.urlWrap, children: [_jsx("input", { className: css.url, value: draftUrl, spellCheck: false, placeholder: "http://localhost:3000", "aria-label": "\u9884\u89C8\u5730\u5740", onFocus: () => setUrlMenuOpen(true), onChange: event => setDraftUrl(event.currentTarget.value), onKeyDown: (event) => {
                                            if (event.key === 'Enter') {
                                                commit(draftUrl);
                                                event.currentTarget.blur();
                                            }
                                            else if (event.key === 'Escape') {
                                                setDraftUrl(url);
                                                event.currentTarget.blur();
                                            }
                                        }, onBlur: () => {
                                            commit(draftUrl);
                                            window.setTimeout(() => setUrlMenuOpen(false), 150);
                                        } }), urlMenuOpen && urlHistory.length > 0 ? (_jsx("ul", { className: css.urlMenu, children: urlHistory.map(item => (_jsx("li", { children: _jsx("button", { type: "button", className: css.urlMenuItem, onMouseDown: (event) => {
                                                    event.preventDefault();
                                                    setDraftUrl(item);
                                                    actions.commitUrl(item);
                                                    setUrlMenuOpen(false);
                                                }, children: item }) }, item))) })) : null] }), _jsx("button", { type: "button", className: css.selectToggle, role: "switch", "aria-checked": selectMode, "data-active": selectMode || undefined, title: selectMode ? '切换到浏览模式' : '切换到选中模式', onClick: () => actions.setSelectMode(!selectMode), children: _jsx(CursorIcon, {}) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": "\u9000\u51FA\u8BBE\u8BA1\u6A21\u5F0F", title: "\u9000\u51FA\u8BBE\u8BA1\u6A21\u5F0F", onClick: () => actions.setActive(false), children: _jsx(CloseIcon, {}) })] }), _jsx("div", { className: css.frameWrap, children: _jsx("iframe", { ref: frameRef, className: css.frame, src: proxySrc(url), title: "\u8BBE\u8BA1\u9884\u89C8", onLoad: onFrameLoad }) }), selections.length > 0 ? (_jsxs("footer", { className: css.citation, children: [_jsxs("span", { className: css.citationLabel, children: ["\u5F15\u7528 \u00B7 ", selections.length] }), _jsx("span", { className: css.citationText, title: selections.map(item => item.selection.text).join('、'), children: selections.map(item => item.selection.text || item.selection.tagName).join('、') }), _jsx("button", { type: "button", className: css.button, onClick: () => {
                                    void navigator.clipboard?.writeText(selections.map(item => item.selection.text).filter(text => text !== '').join('\n'));
                                }, children: "\u590D\u5236" })] })) : null] })] }));
};
//# sourceMappingURL=DesignMode.js.map