import { hashSync } from 'bcryptjs';
import { QueryInterface } from 'sequelize';

// TODO: Write a seed file to populate the database with initial data
export default {
  async up(queryInterface: QueryInterface) {
    await queryInterface.bulkInsert(
      'users',
      [
        {
          email: 'alice@example.org',
          username: 'alice',
          password: hashSync('alice@password', 10),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          email: 'bob@example.org',
          username: 'bob',
          password: hashSync('bob@password', 10),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          email: 'chris@example.org',
          username: 'chris',
          password: hashSync('chris@password', 10),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          email: 'dan@example.org',
          username: 'dan',
          password: hashSync('dan@password', 10),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {},
    );
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.bulkDelete('users', null, {});
  },
};
