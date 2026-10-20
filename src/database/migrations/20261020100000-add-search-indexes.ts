import { QueryInterface } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `CREATE INDEX tweets_content_search_gin ON tweets
         USING GIN (to_tsvector('english', content))`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX users_username_prefix ON users (lower(username) text_pattern_ops)`,
        { transaction },
      );
    });
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex('users', 'users_username_prefix', {
        transaction,
      });
      await queryInterface.removeIndex('tweets', 'tweets_content_search_gin', {
        transaction,
      });
    });
  },
};
