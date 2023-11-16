import { useRouter } from 'next/router'

function Post() {
  const router = useRouter()
  const { pid } = router.query

  return (
    <p>
      Post:
      {pid}
    </p>
  )
}

export default Post
