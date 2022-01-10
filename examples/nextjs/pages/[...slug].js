import { useRouter } from 'next/router'

const CatchAll = () => {
  const router = useRouter()
  const { slug } = router.query

  return <p>Slug: {slug}</p>
}

export default CatchAll
