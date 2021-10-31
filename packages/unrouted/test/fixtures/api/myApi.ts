import { createRouter, useQuery, useParams, useBody, UnroutedOptions } from '../../../src'
import { join, resolve } from "path";
import cors from 'cors'
import type { Middleware} from "h3";

type Article = {
    id: number
    title: string
}
let articles : Article[] = []

export default (options : UnroutedOptions = {}) => {
    const { get, serve, group, handle, any, redirect, permanentRedirect } = createRouter({
        prefix: options.prefix ?? undefined,
    })

    // 3rd-party module
    get('*', cors() as Middleware)

    // basic GET
    get('/greeting', 'Hello :)')

    // named parameters
    get('/greeting/:name', (req) => {
        const params = useParams<{ name: string}>()
        const args = {
            greeting: 'Hello',
            smiley: ':)',
                ...useQuery(req)
        }
        const { greeting, smiley } = args
        return `${greeting} ${params.name} ${smiley}`
    })

    // serve static files
    serve('/static', resolve(join(__dirname, '..', 'demo')))

    // groups
    group('names', ({ get, post }) => {
        const names : string[] = []

        get('/', names)
        post('/', async () => {
            const { name } = useBody<{ name: string}>()
            names.push(name)
            return {
                success: true,
                data: {
                    name
                }
            }
        })
    })

    // redirects
    redirect('/old-link', '/new-link')
    permanentRedirect('/older-link', '/new-permalink')

    get('new-link', 'You were redirected temporarily :)')
    get('new-permalink', 'You were redirected permanently :)')

    // resource group
    group('blog', ({ get, post, match, del }) => {

        // list
        get('articles', articles)
        // create
        post('articles', () => {
            const article = useBody<Article>()
            articles.push(article)
            return article
        })
        // update
        match(['POST', 'PUT'], 'articles/:id',  () => {
            const { id } = useParams<{ id: number }>()
            const updateData = useBody<Article>()
            let newArticle: null|Article = null
            articles = articles.map((article) => {
                if (article.id !== id) {
                    return article
                }
                newArticle = {
                    ...article,
                    ...updateData,
                }
                return newArticle
            })
            return newArticle
        })
        // delete
        del('articles/:id', () => {
            const { id } = useParams<{ id: number }>()
            articles = articles.filter(article => article.id !== id)
            return {
                id
            }
        })
        // read
        get('articles/:id', () => {
            const { id } = useParams<{ id: number }>()
            const article = articles.filter(article => article.id === id)
            return article[0]
        })
    })

    any('/any-route', (req) => req.method)

    return handle
}
