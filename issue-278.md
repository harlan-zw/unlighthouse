Describe the bug
Every time I run to scan my site, I only get errors like this for each page from my site. This is an example:

$ npx unlighthouse --site https://[mysite] --desktop

// ....
[Unlighthouse 6:57:48 PM]  ERROR  Failed to run lighthouse for route /home/grover/.unlighthouse/[mysite]/5d6a/reports/tipos-de-marcaje-de-asistencia/lighthouse.json: ENOENT: no such file or directory, open '/home/grover/.unlighthouse/[mysite]/5d6a/reports/tipos-de-marcaje-de-asistencia/lighthouse.json'

    at Object.openSync (node:fs:596:3)
    at Object.readFileSync (node:fs:464:35)
    at Object.readFileSync (.npm/_npx/944abecbf21dfffb/node_modules/jsonfile/index.js:50:22)
    at runLighthouseTask (.npm/_npx/944abecbf21dfffb/node_modules/@unlighthouse/core/dist/index.mjs:1384:25)

✔ Completed runLighthouseTask for /tipos-de-marcaje-de-asistencia/. (Time Taken: 2.1s Samples: 1 100% complete)
I'd tried to search about this error in Google, but I don't found any result.

Any idea what's going on? Or what I'm missing?

Reproduction
npx unlighthouse --site https://[mysite] --desktop

System / Nuxt Info
System:
OS: Linux 6.8 Ubuntu 24.04.2 LTS 24.04.2 LTS (Noble Numbat)
CPU: (6) x64 Intel(R) Core(TM) i5-8400 CPU @ 2.80GHz
Memory: 25.21 GB / 31.22 GB
Container: Yes
Shell: 5.2.21 - /bin/bash
Binaries:
Node: 18.19.1 - /usr/bin/node
npm: 9.2.0 - /usr/bin/npm
Browsers:
Chrome: 136.0.7103.113
Activity
marcofognog
marcofognog commented 3 weeks ago
marcofognog
(Marco Antonio)
3 weeks ago · edited by marcofognog
I have similar behavior on my machine (plus Axios errors)

ERROR  Axios error response status: 403                                                                                       Unlighthouse 3:02:44 PM

ERROR  Axios error response headers: Object [AxiosHeaders] {                                                                  Unlighthouse 3:02:44 PM
date: 'Thu, 05 Jun 2025 13:02:44 GMT',
...
Node Version: v18.19.1

Thommyaso
Thommyaso commented 2 days ago
Thommyaso
2 days ago
You need to update your version of node, unlighthouse doesn't create json files anymore so your scan is failing. Get the latest lts.
