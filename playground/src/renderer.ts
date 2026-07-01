import { sections } from './data/sections.js';
import { getSectionCount } from './navigation.js';

declare const hljs: { highlightElement(el: Element): void };

/** Renders the sidebar navigation items. */
export function renderNav(container: HTMLElement): void {
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

/** Renders all section containers into the main area. */
export function renderSections(container: HTMLElement): void {
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

/** Updates the UI to reflect the currently active section. */
export function updateActiveSection(index: number): void {
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
  const progressBar = document.getElementById('progress-bar') as HTMLElement | null;
  if (progressBar) progressBar.style.width = `${pct}%`;

  // Nav buttons
  const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = index === getSectionCount() - 1;

  // Syntax highlighting for newly visible code
  document
    .querySelectorAll('.section.active pre code:not(.hljs)')
    .forEach((el) => hljs.highlightElement(el));
}
