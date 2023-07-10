export interface Pokemon {
  id: number
  slug: string
  url: string
  thumbnail: string
  number: number
  name: {
    english: string
    japanese: string
    chinese: string
    french: string
  }
  type: string[]
  base: {
    HP: number
    Attack: number
    Defence: number
    'Sp. Attack': number
    'Sp. Defence': number
    Speed: number
  }
}
