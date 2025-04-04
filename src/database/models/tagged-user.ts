import { CreationOptional, DataTypes, Model } from 'sequelize';
import { sequelize } from '../connection';

export class TaggedUser extends Model {
  declare id: number;
  declare userId: number;
  declare tweetId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

TaggedUser.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    tweetId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      references: {
        model: 'tweets',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    tableName: 'tagged_users',
    modelName: 'tagged_users',
    timestamps: true,
  },
);
