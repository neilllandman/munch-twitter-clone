/**
 * Use index file for importing models in project to ensure
 * all models are loaded before associations are created
 */

import { User } from './user';
import { Tweet } from './tweet';
import { TaggedUser } from './tagged-user';

export * from './user';
export * from './tweet';
export * from './tagged-user';

// User associations
User.hasMany(Tweet, {
  foreignKey: 'userId',
  as: 'tweets',
});

User.hasMany(TaggedUser, {
  foreignKey: 'userId',
  as: 'taggedIn',
});

// Tweet associations
Tweet.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

Tweet.hasMany(TaggedUser, {
  foreignKey: 'tweetId',
  as: 'taggedUsers',
});

// TaggedUser associations
TaggedUser.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});
TaggedUser.belongsTo(Tweet, {
  foreignKey: 'tweetId',
  as: 'tweet',
});
