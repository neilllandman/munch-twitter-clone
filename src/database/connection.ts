import { Sequelize } from 'sequelize';
import * as connectionOptions from './config/config';

export const sequelize = new Sequelize(connectionOptions);
