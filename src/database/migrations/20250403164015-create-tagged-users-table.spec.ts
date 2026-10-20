import { QueryInterface } from 'sequelize';
import migration from './20250403164015-create-tagged-users-table';

jest.mock('../../shared/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

describe('tagged_users migration', () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  const queryInterface = {
    sequelize: { transaction: jest.fn().mockResolvedValue(transaction) },
    createTable: jest.fn(),
    addIndex: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the table and indexes in one committed transaction', async () => {
    await migration.up(queryInterface as unknown as QueryInterface);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'tagged_users',
      expect.any(Object),
      { transaction },
    );
    for (const field of ['userId', 'tweetId']) {
      expect(queryInterface.addIndex).toHaveBeenCalledWith(
        'tagged_users',
        [field],
        { transaction },
      );
    }
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it.each(['createTable', 'addIndex'] as const)(
    'rolls back and propagates a failure in %s',
    async (operation) => {
      const error = new Error('Migration failed');
      queryInterface[operation].mockRejectedValueOnce(error);

      await expect(
        migration.up(queryInterface as unknown as QueryInterface),
      ).rejects.toThrow(error);

      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      expect(transaction.commit).not.toHaveBeenCalled();
    },
  );
});
