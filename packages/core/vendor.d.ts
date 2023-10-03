declare module 'launch-editor' {
  function launch(file: string): Promise<boolean>
  export default launch
}

declare module 'lighthouse/core/lib/median-run.js' {
  export function computeMedianRun(reports: any[]): string
}
