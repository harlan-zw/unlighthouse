import { reactive} from "@nuxtjs/composition-api";
import slugify from 'slugify'
import pokedexJson from '../pokedex.json'
import {Pokemon} from "./types";

const mapPokemon = (pokemon: Pokemon) => {
    const slug = slugify(pokemon.name.english, { lower: true, remove: /[']/g })
    const number = pokemon.id.toString().padStart(3, '0')
    return {
        ...pokemon,
        slug,
        number,
        thumbnail: `/thumbnails/${number}.webp`,
        url: `/pokemon/${slug}`
    }
}

export const pokedex  = reactive<Pokemon[]>(
    // @ts-ignore
    pokedexJson.map(mapPokemon)
)

export const starterPokedex = reactive<Pokemon[]>(
    pokedex.slice(0, 100)
)

export const getPokemonForSlug: (slug: string) => Pokemon = (slug: string) => pokedex.filter(pokemon => pokemon.slug === slug)[0]
