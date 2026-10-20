import { literal, Op } from 'sequelize';
import { Tweet, User } from '../database/models';
import { SearchQuery } from './dtos/search-query';

export class SearchService {
  async searchTweets({ q, beforeId, limit = 25 }: SearchQuery) {
    return Tweet.findAll({
      where: {
        ...(beforeId ? { id: { [Op.lt]: beforeId } } : {}),
        [Op.and]: literal(
          `to_tsvector('english', "Tweet"."content") @@ plainto_tsquery('english', $query)`,
        ),
      },
      bind: { query: q.trim() },
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
      ],
      order: [['id', 'DESC']],
      limit,
    });
  }

  async searchUsers({ q, beforeId, limit = 25 }: SearchQuery) {
    // Escape LIKE metacharacters before adding the prefix wildcard.
    const prefix = q.trim().replace(/[!%_]/g, '!$&') + '%';
    return User.findAll({
      where: {
        ...(beforeId ? { id: { [Op.lt]: beforeId } } : {}),
        [Op.and]: literal(
          `lower("User"."username") LIKE lower($prefix) ESCAPE '!'`,
        ),
      },
      bind: { prefix },
      attributes: ['id', 'username'],
      order: [['id', 'DESC']],
      limit,
    });
  }
}
