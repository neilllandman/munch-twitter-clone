import { CreationOptional, DataTypes, Model } from 'sequelize';
import { sequelize } from '../connection';

export class Tweet extends Model {
  declare id: number;
  declare userId: number;
  declare content: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Tweet.init(
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
    content: {
      type: DataTypes.STRING(280),
      validate: {
        max: 280,
      },
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'tweets',
    modelName: 'Tweet',
    timestamps: true,
  },
);
