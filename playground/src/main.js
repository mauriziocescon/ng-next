import { sections } from './data/sections.js';
import { goTo, navigate, onNavigate, bindKeyboard } from './navigation.js';
import { renderNav, renderSections, updateActiveSection } from './renderer.js';
import { initQuiz } from './quiz.js';

/**
 * Application entry point.
 * Wires data, navigation, rendering, and quiz together.
 */
function init() {
  const navList = document.getElementById('nav-list');
  const mainContent = document.getElementById('main-content');

  // Render initial DOM
  renderNav(navList);
  renderSections(mainContent);

  // Wire navigation callbacks
  onNavigate((index) => {
    updateActiveSection(index);
    if (sections[index].id === 'quiz') initQuiz();
  });

  // Bind nav item clicks (event delegation)
  navList.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (item) goTo(Number(item.dataset.idx));
  });

  // Bind prev/next buttons
  document.getElementById('prev-btn').addEventListener('click', () => navigate(-1));
  document.getElementById('next-btn').addEventListener('click', () => navigate(1));

  // Keyboard navigation
  bindKeyboard();

  // Initial state
  updateActiveSection(0);
  hljs.highlightAll();
}

document.addEventListener('DOMContentLoaded', init);
