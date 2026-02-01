// ==========================================
// GRAHAM BYTES - TRIVIA INTERACTION LOGIC
// ==========================================

const TOTAL_TRIVIA = 50;

// Score tracking using localStorage
const ScoreTracker = {
    getScores() {
        const scores = localStorage.getItem('grahamBytesScores');
        return scores ? JSON.parse(scores) : { correct: 0, incorrect: 0, streak: 0, bestStreak: 0 };
    },
    
    saveScores(scores) {
        localStorage.setItem('grahamBytesScores', JSON.stringify(scores));
    },
    
    addCorrect() {
        const scores = this.getScores();
        scores.correct++;
        scores.streak++;
        if (scores.streak > scores.bestStreak) {
            scores.bestStreak = scores.streak;
        }
        this.saveScores(scores);
        this.updateDisplay();
    },
    
    addIncorrect() {
        const scores = this.getScores();
        scores.incorrect++;
        scores.streak = 0;
        this.saveScores(scores);
        this.updateDisplay();
    },
    
    updateDisplay() {
        const scores = this.getScores();
        const correctEl = document.querySelector('.correct-score');
        const incorrectEl = document.querySelector('.incorrect-score');
        const streakEl = document.querySelector('.streak-score');
        
        if (correctEl) correctEl.textContent = scores.correct;
        if (incorrectEl) incorrectEl.textContent = scores.incorrect;
        if (streakEl) streakEl.textContent = scores.streak;
    },
    
    reset() {
        localStorage.removeItem('grahamBytesScores');
        this.updateDisplay();
    }
};

// Confetti animation
function createConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    
    const colors = ['#F5A623', '#D4851F', '#2E86AB', '#00A8E8', '#FFD700', '#4CAF50'];
    const shapes = ['square', 'circle'];
    
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.borderRadius = shapes[Math.floor(Math.random() * shapes.length)] === 'circle' ? '50%' : '0';
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        container.appendChild(confetti);
    }
    
    // Remove confetti after animation
    setTimeout(() => {
        container.remove();
    }, 4000);
}

// Initialize trivia page
function initTrivia() {
    const options = document.querySelectorAll('.option');
    const resultSection = document.querySelector('.result');
    const feedbackDiv = document.querySelector('.feedback');
    let answered = false;
    
    // Update score display on load
    ScoreTracker.updateDisplay();
    
    options.forEach(option => {
        option.addEventListener('click', function() {
            if (answered) return;
            answered = true;
            
            const isCorrect = this.dataset.correct === 'true';
            
            // Disable all options
            options.forEach(opt => {
                opt.classList.add('disabled');
                if (opt.dataset.correct === 'true') {
                    opt.classList.add('show-correct');
                }
            });
            
            // Mark selected option
            if (isCorrect) {
                this.classList.add('correct');
                ScoreTracker.addCorrect();
                createConfetti();
                
                feedbackDiv.classList.add('correct');
                feedbackDiv.innerHTML = `
                    <span class="feedback-icon">🎉</span>
                    <p class="feedback-text">Correct! Amazing!</p>
                    <p class="feedback-subtext">You really know your tech stuff!</p>
                `;
            } else {
                this.classList.add('incorrect');
                ScoreTracker.addIncorrect();
                
                feedbackDiv.classList.add('incorrect');
                feedbackDiv.innerHTML = `
                    <span class="feedback-icon">😅</span>
                    <p class="feedback-text">Oops! Not quite!</p>
                    <p class="feedback-subtext">Check out the correct answer highlighted in green!</p>
                `;
            }
            
            // Show result section
            resultSection.classList.remove('hidden');
            
            // Scroll to result
            setTimeout(() => {
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
    });
}

// Go to random trivia (different from current)
function goToRandomTrivia() {
    const currentNumMatch = window.location.pathname.match(/trivia-(\d+)/);
    const currentNum = currentNumMatch ? parseInt(currentNumMatch[1]) : 0;
    
    let randomPage;
    do {
        randomPage = Math.floor(Math.random() * TOTAL_TRIVIA) + 1;
    } while (randomPage === currentNum && TOTAL_TRIVIA > 1);
    
    const paddedNum = String(randomPage).padStart(3, '0');
    window.location.href = `trivia-${paddedNum}.html`;
}

// Go to home
function goToHome() {
    window.location.href = '../index.html';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initTrivia);

// Make functions available globally
window.goToRandomTrivia = goToRandomTrivia;
window.goToHome = goToHome;
window.ScoreTracker = ScoreTracker;
