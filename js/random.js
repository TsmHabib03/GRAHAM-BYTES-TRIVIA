// ==========================================
// GRAHAM BYTES - RANDOM TRIVIA REDIRECTOR
// ==========================================

const TOTAL_TRIVIA = 50;

/**
 * Redirects to a random trivia page
 */
function goToRandomTrivia() {
    const randomPage = Math.floor(Math.random() * TOTAL_TRIVIA) + 1;
    const paddedNum = String(randomPage).padStart(3, '0');
    
    // Check if we're on the landing page or a trivia page
    const isTriviPage = window.location.pathname.includes('/trivia/');
    const basePath = isTriviPage ? '' : 'trivia/';
    
    window.location.href = `${basePath}trivia-${paddedNum}.html`;
}

/**
 * Gets a random trivia number different from current
 * @param {number} currentNum - Current trivia number to exclude
 * @returns {string} - Padded trivia number
 */
function getRandomTriviaExcluding(currentNum) {
    let randomPage;
    do {
        randomPage = Math.floor(Math.random() * TOTAL_TRIVIA) + 1;
    } while (randomPage === currentNum && TOTAL_TRIVIA > 1);
    
    return String(randomPage).padStart(3, '0');
}

// Make functions available globally
window.goToRandomTrivia = goToRandomTrivia;
window.getRandomTriviaExcluding = getRandomTriviaExcluding;
