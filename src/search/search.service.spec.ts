import { literal, Op } from 'sequelize';
import { Tweet, User } from '../database/models';
import { SearchService } from './search.service';

jest.mock('../database/models');

describe('SearchService', () => {
  const service = new SearchService();

  beforeEach(() => jest.clearAllMocks());

  it('binds post search text and applies the cursor before limiting results', async () => {
    (Tweet.findAll as jest.Mock).mockResolvedValue([]);
    await service.searchTweets({
      q: " running ' OR 1=1 -- ",
      beforeId: 50,
      limit: 10,
    });

    expect(Tweet.findAll).toHaveBeenCalledWith({
      where: {
        id: { [Op.lt]: 50 },
        [Op.and]: literal(
          `to_tsvector('english', "Tweet"."content") @@ plainto_tsquery('english', $query)`,
        ),
      },
      bind: { query: "running ' OR 1=1 --" },
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
      ],
      order: [['id', 'DESC']],
      limit: 10,
    });
  });

  it.each([
    [' ali ', 'ali%'],
    ['a_%!', 'a!_!%!!%'],
    ['a\\b', 'a\\b%'],
    ["' OR 1=1 --", "' OR 1=1 --%"],
  ])('treats username query %j as a literal prefix', async (q, prefix) => {
    (User.findAll as jest.Mock).mockResolvedValue([]);
    await service.searchUsers({ q, beforeId: 30, limit: 5 });

    expect(User.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { [Op.lt]: 30 },
          [Op.and]: literal(
            `lower("User"."username") LIKE lower($prefix) ESCAPE '!'`,
          ),
        },
        bind: { prefix },
        attributes: ['id', 'username'],
        order: [['id', 'DESC']],
        limit: 5,
      }),
    );
  });

  it('defaults both searches to 25 results', async () => {
    await service.searchTweets({ q: 'hello' });
    await service.searchUsers({ q: 'ali' });
    expect(Tweet.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
    expect(User.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
  });
});
