import { FastifyInstance } from 'fastify';
import { ControllerInterface } from './shared/interfaces/controller.interface';

export class AppController implements ControllerInterface {
  constructor(private app: FastifyInstance) {}

  async healthCheck(request: any, reply: any): Promise<void> {
    reply.send({ status: 'ok' });
  }

  async register(): Promise<void> {
    // Need to use `bind` to ensure `this` context is correct
    this.app.get('/healthz', this.healthCheck.bind(this));
  }
}
