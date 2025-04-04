import { QueryInterface, DataTypes } from 'sequelize';
import { logger } from '../../shared/utils/logger';

export default {
  async up(queryInterface: QueryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('tagged_users', {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id',
          },
        },
        tweetId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'tweets',
            key: 'id',
          },
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
      });

      await queryInterface.addIndex('tagged_users', ['userId'], {
        transaction,
      });
      await queryInterface.addIndex('tagged_users', ['tweetId'], {
        transaction,
      });
    } catch (_err) {
      logger.error('Error creating tagged_users table', _err);
      await transaction.rollback();
    }
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.dropTable('tagged_users');
  },
};
