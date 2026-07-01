import { sections } from './data/sections.js';
import { getSectionCount } from './navigation.js';

/**
 * Renders the sidebar navigation items.
 * @param {HTMLElement} container
 */
export function renderNav(container) {
  container.innerHTML = sections
    .map(
      (s, i) => `
      <div class="nav-item${i === 0 ? ' active' : ''}" data-idx="${i}">
        <span class="num">${i + 1}</span>
        <span>${s.title}</span>
      </div>
    `,
    )
    .join('');
}

/**
 * Renders all section containers into the main area.
 * @param {HTMLElement} container
 */
export function renderSections(container) {
  container.innerHTML = sections
    .map(
      (s, i) => `
      <section class="section${i === 0 ? ' active' : ''}" id="section-${s.id}">
        ${s.content}
      </section>
    `,
    )
    .join('');
}

/**
 * Updates the UI to reflect the currently active section.
 * @param {number} index
 */
export function updateActiveSection(index) {
  // Sections
  document.querySelectorAll('.section').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  // Progress bar
  const pct = ((index + 1) / getSectionCount()) * 100;
  document.getElementById('progress-bar').style.width = `${pct}%`;

  // Nav buttons
  document.getElementById('prev-btn').disabled = index === 0;
  document.getElementById('next-btn').disabled = index === getSectionCount() - 1;

  // Syntax highlighting for newly visible code
  document
    .querySelectorAll('.section.active pre code:not(.hljs)')
    .forEach((el) => hljs.highlightElement(el));
}
