import { sections } from './data/sections.js';
import { goTo, navigate, onNavigate, bindKeyboard } from './navigation.js';
import { renderNav, renderSections, updateActiveSection } from './renderer.js';
import { initQuiz } from './quiz.js';

declare const hljs: { highlightAll(): void };

/**
 * Application entry point.
 * Wires data, navigation, rendering, and quiz together.
 */
function init(): void {
  const navList = document.getElementById('nav-list');
  const mainContent = document.getElementById('main-content');
  if (!navList || !mainContent) return;

  // Render initial DOM
  renderNav(navList);
  renderSections(mainContent);

  // Wire navigation callbacks
  onNavigate((index: number) => {
    updateActiveSection(index);
    if (sections[index]?.id === 'quiz') initQuiz();
  });

  // Bind nav item clicks (event delegation)
  navList.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.nav-item') as HTMLElement | null;
    if (item?.dataset['idx']) goTo(Number(item.dataset['idx']));
  });

  // Bind prev/next buttons
  document.getElementById('prev-btn')?.addEventListener('click', () => navigate(-1));
  document.getElementById('next-btn')?.addEventListener('click', () => navigate(1));

  // Keyboard navigation
  bindKeyboard();

  // Initial state
  updateActiveSection(0);
  hljs.highlightAll();
}

document.addEventListener('DOMContentLoaded', init);
