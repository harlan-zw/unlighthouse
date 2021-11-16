export const extractBgColor = (str: string) => {
    const regex = /background color: (.*?),/gm
    const m = regex.exec(str)
    // eslint-disable-next-line no-cond-assign
    if (m !== null) {
        // The result can be accessed through the `m`-variable.
        return m[1]
    }
}

export const extractFgColor = (str: string) => {
    const regex = /foreground color: (.*?),/gm
    const m = regex.exec(str)
    // eslint-disable-next-line no-cond-assign
    if (m !== null) {
        // The result can be accessed through the `m`-variable.
        return m[1]
    }
}
