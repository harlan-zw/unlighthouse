declare module 'launch-editor' {
  function launch(file: string): Promise<boolean>
  export default launch
}
