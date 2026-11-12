import { useEffect } from 'react';
import './fieldNavigation.css';

const FIELD_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'week', 'time']);
const CONTROL_SELECTOR = 'input,textarea,select,button,[role="combobox"],[tabindex]';

function available(element) {
  return element.tabIndex >= 0 && !element.matches(':disabled')
    && !element.closest('[hidden],[inert],[aria-hidden="true"]')
    && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0;
}

function navigationControl(element) {
  if (!available(element) || element.matches('input[readonly],textarea[readonly]')) return false;
  if (element.tagName === 'BUTTON') {
    // Icon utilities remain reachable with Tab; Enter advances to a field or labelled action.
    return Boolean(element.textContent.trim() || element.hasAttribute('aria-expanded') || element.hasAttribute('aria-haspopup'));
  }
  return true;
}

export function useFieldNavigation() {
  useEffect(() => {
    document.body.classList.add('field-navigation-enabled');
    let activeField;
    let activeWrapper;
    function clearGlow() {
      activeField?.removeAttribute('data-field-focus-contained');
      activeWrapper?.removeAttribute('data-active-field-wrapper');
      activeField = null;
      activeWrapper = null;
    }
    function highlightField(event) {
      clearGlow();
      const field = event.target;
      if (!(field instanceof HTMLElement) || !field.matches('input,textarea,select,button,[role="combobox"]')) return;
      const bordered = (element) => {
        const style = getComputedStyle(element);
        return ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(style[`border${side}Width`]) > 0 && !['none', 'hidden'].includes(style[`border${side}Style`]));
      };
      if (bordered(field)) return;
      const fieldHeight = field.getBoundingClientRect().height;
      let wrapper = field.parentElement;
      for (let depth = 0; wrapper && depth < 4; depth++, wrapper = wrapper.parentElement) {
        if (bordered(wrapper) && wrapper.getBoundingClientRect().height <= Math.max(72, fieldHeight * 2)) {
          activeField = field;
          activeWrapper = wrapper;
          field.setAttribute('data-field-focus-contained', '');
          wrapper.setAttribute('data-active-field-wrapper', '');
          break;
        }
      }
    }
    function nextField(event) {
      // Keep native form submission on the public authentication screens. The
      // Enter-to-next-field behavior is intended for the signed-in application.
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      if (path === '/login' || path === '/register') return;
      if (event.defaultPrevented || event.key !== 'Enter' || event.isComposing || event.repeat
        || event.ctrlKey || event.metaKey || event.altKey) return;
      const field = event.target;
      if (!(field instanceof HTMLInputElement) || !FIELD_TYPES.has(field.type) || field.readOnly
        || field.closest('[data-enter-navigation="off"],[contenteditable="true"]')) return;
      // Component handlers run first, so scanners, autocomplete and dropdowns retain their actions.
      if (field.getAttribute('aria-expanded') === 'true' || field.getAttribute('aria-activedescendant')) return;
      const scope = field.closest('form,[role="dialog"],[data-keyboard-scope]')
        || field.closest('main') || document.getElementById('root') || document.body;
      const controls = [...scope.querySelectorAll(CONTROL_SELECTOR)].filter(navigationControl);
      controls.sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
      const index = controls.indexOf(field);
      if (index < 0) return;
      const next = controls[index + (event.shiftKey ? -1 : 1)];
      if (!next) return;
      event.preventDefault();
      next.focus();
      if (next instanceof HTMLInputElement && ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(next.type)) {
        try { next.select(); } catch { /* Some browser input types cannot select their text. */ }
      }
    }
    document.addEventListener('keydown', nextField);
    document.addEventListener('focusin', highlightField);
    document.addEventListener('focusout', clearGlow);
    highlightField({ target: document.activeElement });
    return () => {
      document.removeEventListener('keydown', nextField);
      document.removeEventListener('focusin', highlightField);
      document.removeEventListener('focusout', clearGlow);
      clearGlow();
      document.body.classList.remove('field-navigation-enabled');
    };
  }, []);
}
