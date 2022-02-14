# CI

<sponsor-banner />



Unlighthouse can be ran in a CI mode to:
- to perform an assertion on a specific score budget
- generate a static build of the report

#### Budget

Unlighthouse simplifies budget assertions. You can provide a single budget number which will be used
to validate all pages and on all selected categories.

```bash
# Install unlighthouse
npm install -g unlighthouse
# Run the CI with a budget, will fail if any pages report any category less than 50
unlighthouse-ci --site <your-site> --debug --budget 50
```


#### Static Build

**Examples**
- https://vue-demo.unlighthouse.dev/
- https://inspect.unlighthouse.dev/

**Instructions**

Install Unlighthouse and run the ci script

```bash
# NPM
npm install -g unlighthouse
unlighthouse-ci --site harlanzw.com --debug --build-static
```

This will generate files in your `outputPath` (`.lighthouse` by default).

You can upload the directory `client` to a static host from there.

For example using Github Actions with Netlify:

```yml
  - name: Deploy to Netlify
    uses: nwtgck/actions-netlify@v1.2
    with:
      publish-dir: './.lighthouse/client'
      production-branch: main
      production-deploy: true
      github-token: ${{ secrets.GITHUB_TOKEN }}
      deploy-message: "New Release Deploy from GitHub Actions"
      enable-pull-request-comment: false
      enable-commit-comment: true
      overwrites-pull-request-comment: true
    env:
      NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
      NETLIFY_SITE_ID: ${{ secrets.NETLIFY_DEMO_SITE_ID }}
    timeout-minutes: 1
```
