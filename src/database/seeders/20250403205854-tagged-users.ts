import { QueryInterface } from 'sequelize';

// TODO: Write a seed file to populate the database with initial data
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
      const taggedUserNames = tweet.content.match(/@(\w+)/g);

      const taggedUsers = users.filter((u) => {
        const taggedUserName = taggedUserNames?.find(
          (username: string) => username === `@${u.username}`,
        );
        return taggedUserName && u.id !== user.id;
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
