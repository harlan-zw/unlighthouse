import { useRouter } from 'next/router'

function CatchAll() {
  const router = useRouter()
  const { slug } = router.query

  return <p>Slug: {slug}</p>
}

export default CatchAll
