import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'no-use-before-define': 'off',
    'node/prefer-global/process': 'off',
    'ts/no-use-before-define': 'off',
    'ts/prefer-ts-expect-error': 'off',
  },
  // exclude examples dir
  ignores: [
    'test/*',
    'examples/*',
    'examples/**/*.*',
  ],
})
