import { parse } from 'regexparam'
import {NormalisedRoute, RouteDefinition} from "../../types";
import {$URL} from "ufo";
import {basename} from "path";
import {hashPathName} from "../../core";

export type MockRouter = { match: (path: string) => RouteDefinition }

export const normaliseRoute = (url: string, router: MockRouter) : NormalisedRoute|false => {
    const $url = new $URL(url)
    const path = $url.pathname
    const definition = router.match(path)
    if (!definition) {
        return false
    }
    const dynamic = definition.path !== path
    return {
        id: hashPathName(path),
        url,
        $url,
        path,
        definition: {
            ...definition,
            componentBaseName: basename(definition.component)
        },
        dynamic,
        static: !dynamic,
    }
}

export const createMockRouter
    : (routeDefinitions : RouteDefinition[]) => MockRouter
    = (routeDefinitions : RouteDefinition[]) => {

    const patterns = routeDefinitions.map((r) => {
        return {
            routeDefinition: r,
            matcher: parse(r.path)
        }
    })

    return {
        match(path: string) {
            return patterns.filter(p => p.matcher.pattern.test(path))[0]?.routeDefinition
        }
    }
}
