import { Service } from 'typedi'
import {
  GithubRepository,
  MongoRepository,
  SnapshotRepository,
} from 'repositories'
import { OrgData, Space } from 'types'
import { filterSpaces, split } from 'utils'
import WhitelistServiceInterface from './interface'

@Service()
export class WhitelistService implements WhitelistServiceInterface {
  constructor(
    readonly db: MongoRepository,
    readonly gh: GithubRepository,
    readonly snapshot: SnapshotRepository,
  ) {}

  async getSpaces(
    {
      maxOrgs = 100,
      minFollowers = 10_000,
    }: {
      maxOrgs?: number
      minFollowers?: number
    } = { maxOrgs: 100, minFollowers: 10_000 },
  ) {
    const spaces = await this.snapshot.getSpaces()

    return Object.entries(spaces)
      .reduce<Space[]>((spaces, [snapshotId, space]) => {
        if (filterSpaces(minFollowers)(space)) {
          const _space = {
            followers: space.followers as number,
            snapshotId,
            snapshotName: space.name,
          }
          if (space.followers_7d !== undefined) {
            // @ts-expect-error
            _space.followers7d = space.followers_7d
          }
          spaces.push(_space)
        }
        return spaces
      }, [])
      .sort((a, b) => b.followers - a.followers)
      .slice(0, maxOrgs)
      .reduce<Record<string, Space>>((spaces, space) => {
        spaces[space.snapshotId] = space
        return spaces
      }, {})
  }

  async getGhOrgs(snapshotNames: string[]) {
    const spaces = await this.snapshot.getGhOrgsBySpaceIds(snapshotNames)
    return spaces.reduce<Array<{ ghName: string; snapshotId: string }>>(
      (spaces, space) => {
        if (typeof space.ghName === 'string')
          spaces.push({ ghName: space.ghName, snapshotId: space.snapshotId })
        return spaces
      },
      [],
    )
  }

  async getOrgsWithReposAndVoters(
    {
      maxOrgs,
      minFollowers,
    }: {
      maxOrgs?: number
      minFollowers?: number
    } = { maxOrgs: 100, minFollowers: 10_000 },
  ) {
    const spaces = await this.getSpaces({ maxOrgs, minFollowers })
    const orgs: Record<string, OrgData> = await this.snapshot.getVoters(
      Object.keys(spaces),
    )

    await Promise.all(
      split(Object.keys(spaces)).map(async (snapshotNames) => {
        const ghOrgs = await this.getGhOrgs(snapshotNames)

        await Promise.all(
          ghOrgs.map(async ({ ghName, snapshotId }) => {
            const repos = await this.gh.getReposByOrg(ghName)
            if (repos.length > 0) {
              orgs[snapshotId] = { ...spaces[snapshotId], ghName, repos }
            }
          }),
        )
      }),
    )

    return orgs
  }

  async getWhitelistShort() {
    const orgs = await this.db.findAllWhitelistedOrgs()
    return orgs
      .map(({ ghName, repos }) => repos.map((repo) => `${ghName}/${repo}`))
      .flat()
  }

  async getWhitelist(format: 'short' | 'long' = 'short') {
    if (format === 'long') return this.db.findAllWhitelistedOrgs()
    return this.getWhitelistShort()
  }

  async refresh() {
    const orgs = await this.getOrgsWithReposAndVoters()
    return this.db.upsertOrgs(Object.values(orgs))
  }

  async unWhitelist(ghNameOrSnapshotId: string): Promise<any> {
    return Promise.resolve('unimplemented')
  }
}
