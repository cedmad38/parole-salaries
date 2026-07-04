/* ===================================================================
   Parole Salariés By Cedmad — Helpers UI partagés
   =================================================================== */
(function (global) {
  'use strict';

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  let toastHost;
  function toast(msg, kind) {
    if (!toastHost) {
      toastHost = document.getElementById('toast-host') || el('div', { id: 'toast-host' });
      document.body.appendChild(toastHost);
    }
    const t = el('div', { class: 'toast ' + (kind === 'err' ? 'err' : 'ok'), role: 'status', text: msg });
    toastHost.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 3200);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
             ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }
  function fmtDay(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch (e) { return iso; }
  }

  function badge(text, color) {
    return `<span class="badge badge-${color || 'mute'}">${text}</span>`;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.PS = global.PS || {};
  global.PS.ui = { $, $$, el, toast, fmtDate, fmtDay, badge, escapeHTML };

})(window);
