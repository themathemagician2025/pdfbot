// Helper functions for the Mathemagician bot

/**
 * Get a random element from an array
 * @param {Array} array - The input array
 * @returns {*} A random element from the array
 */
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Format a number to a specified number of decimal places
 * @param {number} num - The number to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number as string
 */
function formatDecimal(num, decimals = 2) {
    return Number(num).toFixed(decimals);
}

/**
 * Generate a random number within a range
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number} Random number within range
 */
function randomInRange(min, max, decimals = 2) {
    const rand = Math.random() * (max - min) + min;
    return parseFloat(rand.toFixed(decimals));
}

/**
 * Calculate stop loss and take profit levels based on direction and volatility
 * @param {string} direction - 'BUY' or 'SELL'
 * @param {number} entryPrice - Entry price
 * @param {number} volatility - Volatility percentage (0-100)
 * @returns {Object} Object containing stopLoss and takeProfit levels
 */
function calculateLevels(direction, entryPrice, volatility) {
    const riskRewardRatio = 2; // 1:2 risk-reward ratio
    const stopDistance = (entryPrice * volatility) / 100;
    
    if (direction === 'BUY') {
        return {
            stopLoss: entryPrice - stopDistance,
            takeProfit: entryPrice + (stopDistance * riskRewardRatio)
        };
    } else {
        return {
            stopLoss: entryPrice + stopDistance,
            takeProfit: entryPrice - (stopDistance * riskRewardRatio)
        };
    }
}

/**
 * Format a price with proper currency symbols and decimal places
 * @param {number} price - The price to format
 * @param {string} pair - The currency pair (e.g., 'BTC/USD')
 * @returns {string} Formatted price string
 */
function formatPrice(price, pair) {
    const isCrypto = ['BTC', 'ETH', 'XRP'].some(crypto => pair.startsWith(crypto));
    
    if (isCrypto) {
        // For crypto, show more decimal places
        return `$${parseFloat(price).toFixed(8).replace(/\.?0+$/, '')}`;
    } else {
        // For forex/others, show fewer decimal places
        return `$${parseFloat(price).toFixed(4)}`;
    }
}

module.exports = {
    getRandomElement,
    formatDecimal,
    randomInRange,
    calculateLevels,
    formatPrice
};
