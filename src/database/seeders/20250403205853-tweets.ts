import { QueryInterface } from 'sequelize';

// TODO: Write a seed file to populate the database with initial data
export default {
  async up(queryInterface: QueryInterface) {
    const userQueryRes =
      await queryInterface.sequelize.query(`SELECT * FROM users;`);
    const users: any[] = userQueryRes[0];

    const tweets: any[] = [];

    users.forEach((user) => {
      const userTweets = [
        {
          userId: user.id,
          content: `First tweet from ${user.username}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          userId: user.id,
          content: `Second tweet from ${user.username}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      users
        .filter((u) => u.id !== user.id)
        .forEach((u) => {
          userTweets.push({
            userId: user.id,
            content: `Tweet from ${user.username} tagging @${u.username}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });

      tweets.push(...userTweets);
    });

    await queryInterface.bulkInsert('tweets', tweets, {});
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.bulkDelete('tweets', null, {});
  },
};
