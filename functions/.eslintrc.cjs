module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    commonjs: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  ignorePatterns: ['node_modules/**'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }]
  }
};
