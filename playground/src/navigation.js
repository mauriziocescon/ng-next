import { sections } from './data/sections.js';

let currentIndex = 0;
let onSectionChange = null;

/**
 * Returns the current section index.
 */
export function getCurrentIndex() {
  return currentIndex;
}

/**
 * Returns total number of sections.
 */
export function getSectionCount() {
  return sections.length;
}

/**
 * Registers a callback invoked whenever the active section changes.
 * @param {(index: number) => void} callback
 */
export function onNavigate(callback) {
  onSectionChange = callback;
}

/**
 * Navigate to a specific section by index.
 * @param {number} index
 */
export function goTo(index) {
  if (index < 0 || index >= sections.length) return;
  currentIndex = index;
  onSectionChange?.(currentIndex);
}

/**
 * Navigate forward or backward.
 * @param {1 | -1} direction
 */
export function navigate(direction) {
  goTo(currentIndex + direction);
}

/**
 * Binds keyboard arrow navigation.
 */
export function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
  });
}
