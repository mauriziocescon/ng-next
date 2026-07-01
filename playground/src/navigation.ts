import { sections } from './data/sections';

type NavigationCallback = (index: number) => void;

let currentIndex = 0;
let onSectionChange: NavigationCallback | null = null;

/** Returns the current section index. */
export function getCurrentIndex(): number {
  return currentIndex;
}

/** Returns total number of sections. */
export function getSectionCount(): number {
  return sections.length;
}

/** Registers a callback invoked whenever the active section changes. */
export function onNavigate(callback: NavigationCallback): void {
  onSectionChange = callback;
}

/** Navigate to a specific section by index. */
export function goTo(index: number): void {
  if (index < 0 || index >= sections.length) return;
  currentIndex = index;
  onSectionChange?.(currentIndex);
}

/** Navigate forward or backward. */
export function navigate(direction: 1 | -1): void {
  goTo(currentIndex + direction);
}

/** Binds keyboard arrow navigation. */
export function bindKeyboard(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
  });
}
