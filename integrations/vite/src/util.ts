export const once = <A extends any[], R, T>(
  fn: (this: T, ...arg: A) => R,
): ((this: T, ...arg: A) => R | undefined) => {
  let done = false
  return function(this: T, ...args: A) {
    return done ? undefined : ((done = true), fn.apply(this, args))
  }
}
