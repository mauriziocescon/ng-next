import { quizQuestions } from './data/quiz-questions.js';
const QUESTIONS_PER_ROUND = 5;
let state = createFreshState();
function createFreshState() {
    return {
        current: 0,
        score: 0,
        answered: false,
        order: [],
    };
}
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Initializes or resets the quiz with shuffled questions. */
export function initQuiz() {
    state = createFreshState();
    state.order = shuffle([...Array(quizQuestions.length).keys()]);
    renderQuestion();
}
/** Renders the current question or final score. */
function renderQuestion() {
    const container = document.getElementById('quiz-container');
    if (!container)
        return;
    const total = Math.min(QUESTIONS_PER_ROUND, state.order.length);
    if (state.current >= total) {
        container.innerHTML = `
      <div class="quiz-score">🎯 Score: ${state.score} / ${total}</div>
      <div style="text-align:center; margin-top:1rem;">
        <button class="quiz-btn" id="quiz-retry">Try Again</button>
      </div>
    `;
        container.querySelector('#quiz-retry')?.addEventListener('click', initQuiz);
        return;
    }
    const questionIndex = state.order[state.current];
    if (questionIndex === undefined)
        return;
    const q = quizQuestions[questionIndex];
    if (!q)
        return;
    state.answered = false;
    container.innerHTML = `
    <div class="quiz-card">
      <div class="question">
        <strong>Question ${state.current + 1}:</strong> Is this code valid?
      </div>
      <div class="code-block">
        <pre><code class="language-typescript">${escapeHtml(q.code)}</code></pre>
      </div>
      <div class="quiz-actions">
        <button class="quiz-btn" id="btn-valid">✓ Valid</button>
        <button class="quiz-btn" id="btn-invalid">✗ Invalid</button>
      </div>
      <div class="quiz-explanation" id="quiz-explanation">${q.explanation}</div>
      <div class="quiz-next" id="quiz-next">
        <button class="quiz-btn" id="btn-next">Next →</button>
      </div>
    </div>
  `;
    // Bind answer buttons
    container.querySelector('#btn-valid')?.addEventListener('click', () => answer(true));
    container.querySelector('#btn-invalid')?.addEventListener('click', () => answer(false));
    container.querySelector('#btn-next')?.addEventListener('click', nextQuestion);
    // Highlight code
    container.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
}
/** Handles a user's answer. */
function answer(userSaidValid) {
    if (state.answered)
        return;
    state.answered = true;
    const questionIndex = state.order[state.current];
    if (questionIndex === undefined)
        return;
    const q = quizQuestions[questionIndex];
    if (!q)
        return;
    const correct = userSaidValid === q.valid;
    if (correct)
        state.score++;
    // Highlight buttons
    const btnValid = document.getElementById('btn-valid');
    const btnInvalid = document.getElementById('btn-invalid');
    if (q.valid) {
        btnValid?.classList.add('correct');
        if (!correct)
            btnInvalid?.classList.add('wrong');
    }
    else {
        btnInvalid?.classList.add('correct');
        if (!correct)
            btnValid?.classList.add('wrong');
    }
    // Show explanation
    const explanation = document.getElementById('quiz-explanation');
    explanation?.classList.add('show', correct ? 'correct' : 'wrong');
    // Show next button
    document.getElementById('quiz-next')?.classList.add('show');
}
/** Advances to the next question. */
function nextQuestion() {
    state.current++;
    renderQuestion();
}
//# sourceMappingURL=quiz.js.map