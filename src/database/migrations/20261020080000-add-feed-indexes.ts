import { QueryInterface } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addIndex('tweets', ['userId', 'id'], {
        name: 'tweets_user_id_id',
        transaction,
      });
      await queryInterface.addIndex('tagged_users', ['userId', 'tweetId'], {
        name: 'tagged_users_user_id_tweet_id',
        unique: true,
        transaction,
      });
      // The composite index also supports lookups by userId alone.
      await queryInterface.removeIndex('tagged_users', 'tagged_users_user_id', {
        transaction,
      });
    });
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addIndex('tagged_users', ['userId'], {
        transaction,
      });
      await queryInterface.removeIndex(
        'tagged_users',
        'tagged_users_user_id_tweet_id',
        {
          transaction,
        },
      );
      await queryInterface.removeIndex('tweets', 'tweets_user_id_id', {
        transaction,
      });
    });
  },
};
