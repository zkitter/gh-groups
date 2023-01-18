import votersGqlQuery from 'graphql/voters-gql-query'
import { getTime, minusOneMonth } from 'utils'
import { URLS } from '../constants'
import { getSpaces } from '../snapshot/get-spaces'

export const getVotersGroup = async (
  {
    maxOrgs = 100,
    minFollowers = 10_000,
    since,
    until = new Date(),
  }: { maxOrgs?: number; minFollowers?: number; since?: Date; until?: Date } = {
    maxOrgs: 100,
    minFollowers: 10_000,
    until: new Date(),
  },
) => {
  if (since === undefined) since = minusOneMonth(until)
  const spacesIds = await getSpaces({ maxOrgs, minFollowers })()

  const res = await fetch(URLS.SNAPSHOT_GQL, {
    body: JSON.stringify({
      query: votersGqlQuery,
      variables: {
        created_gte: getTime(since),
        created_lte: getTime(until),
        space_in: spacesIds,
      },
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  const { votes } = await res.json()
  return (votes as Array<{ voter: string }>).map(({ voter }) => voter)
}
