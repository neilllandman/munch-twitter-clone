import { TweetQuery } from '../../tweets/dtos/tweet-query';

export interface SearchQuery extends TweetQuery {
  q: string;
}
