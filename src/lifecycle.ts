import { FastifyInstance, FastifyBaseLogger } from 'fastify';

export class StartupCancelled extends Error {}

async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new StartupCancelled('Startup cancelled'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

export async function waitForDatabase(
  authenticate: () => Promise<unknown>,
  signal: AbortSignal,
  warn: () => void,
  timeoutMs = 30000,
) {
  const budget = new AbortController();
  const cancel = () => budget.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const deadline = setTimeout(cancel, timeoutMs);
  try {
    for (;;) {
      if (budget.signal.aborted)
        throw new StartupCancelled('Startup cancelled');
      try {
        await abortable(authenticate(), budget.signal);
        return;
      } catch (error) {
        if (budget.signal.aborted) throw error;
        warn();
        let retry: NodeJS.Timeout;
        try {
          await abortable(
            new Promise<void>((resolve) => {
              retry = setTimeout(resolve, 1000);
            }),
            budget.signal,
          );
        } finally {
          clearTimeout(retry);
        }
      }
    }
  } catch (error) {
    if (signal.aborted) throw new StartupCancelled('Startup cancelled');
    if (budget.signal.aborted)
      throw new Error(`Database startup timed out after ${timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', cancel);
  }
}

interface Dependencies {
  createApp: () => FastifyInstance;
  database: {
    authenticate: () => Promise<unknown>;
    close: () => Promise<void>;
  };
  config: { appHost: string; appPort: number };
  logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  setExitCode: (code: number) => void;
  forceExit: (code: number) => void;
  shutdownMs?: number;
}

export class ApplicationLifecycle {
  private app: FastifyInstance;
  private readonly cancellation = new AbortController();
  private startupWork: Promise<void>;
  private started: Promise<void>;
  private authentication: Promise<unknown>;
  private shutdown: Promise<void>;
  private stopping = false;
  private exitCode = 0;

  constructor(private readonly deps: Dependencies) {}

  start(): Promise<void> {
    if (this.started) return this.started;
    this.startupWork = this.startInternal();
    this.started = this.startupWork.catch(async (error) => {
      if (this.stopping) return;
      this.deps.logger.error({ err: error }, 'Application startup failed');
      await this.stop(1);
    });
    return this.started;
  }

  private async startInternal() {
    if (this.stopping) return;
    this.app = this.deps.createApp();
    await this.app.ready();
    if (this.stopping) return;
    await waitForDatabase(
      () => {
        this.authentication = this.deps.database.authenticate();
        return this.authentication;
      },
      this.cancellation.signal,
      () => this.deps.logger.warn('Database unavailable; retrying startup'),
    );
    if (this.stopping) return;
    await this.app.listen({
      host: this.deps.config.appHost,
      port: this.deps.config.appPort,
    });
    this.deps.logger.info('Application startup complete');
  }

  stop(code = 0): Promise<void> {
    if (code !== 0) this.exitCode = 1;
    if (this.shutdown) return this.shutdown;
    this.stopping = true;
    this.cancellation.abort();
    this.deps.logger.info('Application shutdown requested');
    const deadline = setTimeout(() => {
      this.deps.logger.error('Application shutdown timed out');
      this.deps.forceExit(1);
    }, this.deps.shutdownMs ?? 5000);
    deadline.unref();
    this.shutdown = (async () => {
      try {
        await this.startupWork?.catch(() => {});
        // An aborted startup may still have a bounded connection attempt in flight.
        await this.authentication?.catch(() => {});
        try {
          await this.app?.close();
        } finally {
          await this.deps.database.close();
        }
      } catch (error) {
        this.exitCode = 1;
        this.deps.logger.error({ err: error }, 'Application cleanup failed');
      } finally {
        clearTimeout(deadline);
        this.deps.setExitCode(this.exitCode);
        this.deps.logger.info(
          { exitCode: this.exitCode },
          'Application shutdown complete',
        );
      }
    })();
    return this.shutdown;
  }
}
