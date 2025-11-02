// Mathematical operators for trading signal generation
const mathematicalOperators = {
  // Calculus Operators
  derivative: {
    symbol: 'd/dx',
    description: 'The derivative measures the rate of change of price with respect to time, indicating momentum.',
    mathematicalForm: 'dP/dt = lim(Δt→0) [P(t+Δt) - P(t)]/Δt',
    applications: [
      'Momentum trading: Positive first derivative indicates uptrend (BUY signal), negative indicates downtrend (SELL signal).',
      'Identifying trend strength and potential reversals in price action.',
      'Used in MACD (Moving Average Convergence Divergence) indicators.'
    ]
  },
  
  gradient: {
    symbol: '∇',
    description: 'The gradient shows the direction of steepest price increase across multiple timeframes.',
    mathematicalForm: '∇P = [∂P/∂t₁, ∂P/∂t₂, ..., ∂P/∂tₙ]',
    applications: [
      'Multi-timeframe analysis for confirming trade directions.',
      'Identifying strongest trending assets across different time horizons.',
      'Used in gradient-based optimization of trading strategies.'
    ]
  },
  
  laplace: {
    symbol: 'Δ',
    description: 'The Laplacian operator measures the divergence of the gradient, indicating price consolidation or breakout potential.',
    mathematicalForm: 'ΔP = ∇·(∇P) = ∂²P/∂t²',
    applications: [
      'Identifying potential breakouts when price volatility compresses (low Laplacian) followed by expansion.',
      'Mean-reversion strategies during high Laplacian (consolidation) periods.',
      'Used in options pricing models to assess volatility.'
    ]
  },
  
  // Probability Operators
  probability: {
    symbol: 'P',
    description: 'Probability measures the likelihood of price reaching certain levels based on historical patterns.',
    mathematicalForm: 'P(price > target) = ∫[target,∞] p(x) dx',
    applications: [
      'Risk assessment for position sizing and stop-loss placement.',
      'Calculating probability of profit in options trading.',
      'Monte Carlo simulations for trade outcome distributions.'
    ]
  },
  
  expectation: {
    symbol: 'E',
    description: 'Expected value calculation for risk-reward assessment of potential trades.',
    mathematicalForm: 'E[R] = ∑ (P(x) × R(x))',
    applications: [
      'Evaluating positive expectancy trading strategies.',
      'Optimal position sizing using Kelly Criterion.',
      'Comparing different trading setups based on expected returns.'
    ]
  },
  
  // Linear Algebra Operators
  dotProduct: {
    symbol: '·',
    description: 'Measures the correlation between different technical indicators or price series.',
    mathematicalForm: 'A·B = |A||B|cos(θ)',
    applications: [
      'Indicator correlation analysis for strategy diversification.',
      'Portfolio optimization by finding uncorrelated assets.',
      'Pattern recognition in price action.'
    ]
  },
  
  // Specialized Trading Operators
  volatility: {
    symbol: 'σ',
    description: 'Standard deviation of returns, measuring price variability and risk.',
    mathematicalForm: 'σ = √(1/N ∑(r - μ)²)',
    applications: [
      'Volatility-based position sizing.',
      'Bollinger Bands and other volatility-based indicators.',
      'Adjusting stop-loss levels based on market conditions.'
    ]
  },
  
  momentum: {
    symbol: 'p',
    description: 'Rate of change of price, indicating the strength of a trend.',
    mathematicalForm: 'p = m×v (where m is mass/volume, v is velocity)',
    applications: [
      'Momentum trading strategies (buying winners, selling losers).',
      'Identifying overbought/oversold conditions.',
      'Divergence trading between price and momentum.'
    ]
  }
};

// Helper function to get a random operator
function getRandomOperator() {
  const operators = Object.keys(mathematicalOperators);
  const randomIndex = Math.floor(Math.random() * operators.length);
  return {
    name: operators[randomIndex],
    ...mathematicalOperators[operators[randomIndex]]
  };
}

module.exports = {
  mathematicalOperators,
  getRandomOperator
};
