import { QueryInterface } from 'sequelize';
import { extractMentionedUsernames } from '../../shared/utils/mentions';

export default {
  async up(queryInterface: QueryInterface) {
    const userQueryRes =
      await queryInterface.sequelize.query(`SELECT * FROM users;`);
    const users: any[] = userQueryRes[0];

    const tweetsQueryRes = await queryInterface.sequelize.query(
      `SELECT * FROM tweets;`,
    );
    const tweets: any[] = tweetsQueryRes[0];

    const allTaggedUsers: any[] = [];

    tweets.forEach((tweet) => {
      const user = users.find((u) => u.id === tweet.userId);
      const taggedUserNames = extractMentionedUsernames(tweet.content);

      const taggedUsers = users.filter((u) => {
        return taggedUserNames.includes(u.username) && u.id !== user.id;
      });
      allTaggedUsers.push(
        ...taggedUsers.map((u) => {
          return {
            tweetId: tweet.id,
            userId: u.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      );
    });
    await queryInterface.bulkInsert('tagged_users', allTaggedUsers, {});
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.bulkDelete('tagged_users', null, {});
  },
};
