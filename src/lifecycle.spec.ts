import fastify, { FastifyInstance } from 'fastify';
import {
  ApplicationLifecycle,
  StartupCancelled,
  waitForDatabase,
} from './lifecycle';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function fixture() {
  const app = {
    ready: jest.fn().mockResolvedValue(undefined),
    listen: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const deps = {
    createApp: jest.fn().mockReturnValue(app as unknown as FastifyInstance),
    database: {
      authenticate: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    },
    config: { appHost: '127.0.0.1', appPort: 0 },
    logger,
    setExitCode: jest.fn(),
    forceExit: jest.fn(),
  };
  return { app, deps, lifecycle: new ApplicationLifecycle(deps) };
}

describe('database startup retries', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries failed authentication and clears its deadline after success', async () => {
    const authenticate = jest
      .fn()
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValue(undefined);
    const warn = jest.fn();
    const started = waitForDatabase(
      authenticate,
      new AbortController().signal,
      warn,
    );
    await jest.advanceTimersByTimeAsync(1000);
    await started;
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops at the 30-second budget, even if an attempt is stuck', async () => {
    const started = waitForDatabase(
      () => new Promise(() => {}),
      new AbortController().signal,
      jest.fn(),
    );
    const assertion = expect(started).rejects.toThrow(
      'timed out after 30000 ms',
    );
    await jest.advanceTimersByTimeAsync(30000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels retry delays immediately', async () => {
    const cancellation = new AbortController();
    const authenticate = jest.fn().mockRejectedValue(new Error('not ready'));
    const started = waitForDatabase(
      authenticate,
      cancellation.signal,
      jest.fn(),
    );
    const assertion = expect(started).rejects.toBeInstanceOf(StartupCancelled);
    await jest.advanceTimersByTimeAsync(0);
    cancellation.abort();
    await assertion;
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('application lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('drains HTTP before closing the database and handles repeated stop calls once', async () => {
    const { app, deps, lifecycle } = fixture();
    let finishRequests: () => void;
    let closing: () => void;
    const closeStarted = new Promise<void>((resolve) => {
      closing = resolve;
    });
    app.close.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRequests = resolve;
          closing();
        }),
    );
    await lifecycle.start();
    expect(app.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 0 });
    const stopped = lifecycle.stop();
    expect(lifecycle.stop()).toBe(stopped);
    await closeStarted;
    expect(deps.database.close).not.toHaveBeenCalled();
    finishRequests();
    await stopped;
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(deps.database.close).toHaveBeenCalledTimes(1);
    expect(deps.setExitCode).toHaveBeenCalledWith(0);
  });

  it('cleans up when binding the HTTP port fails', async () => {
    const { app, deps, lifecycle } = fixture();
    app.listen.mockRejectedValue(new Error('port occupied'));
    await lifecycle.start();
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(deps.database.close).toHaveBeenCalledTimes(1);
    expect(deps.setExitCode).toHaveBeenCalledWith(1);
  });

  it('cleans up if app construction fails before authentication', async () => {
    const { deps, lifecycle } = fixture();
    deps.createApp.mockImplementation(() => {
      throw new Error('missing key');
    });
    await lifecycle.start();
    expect(deps.database.authenticate).not.toHaveBeenCalled();
    expect(deps.database.close).toHaveBeenCalledTimes(1);
    expect(deps.setExitCode).toHaveBeenCalledWith(1);
  });

  it('still closes the pool if closing HTTP fails', async () => {
    const { app, deps, lifecycle } = fixture();
    await lifecycle.start();
    app.close.mockRejectedValue(new Error('close failed'));
    await lifecycle.stop();
    expect(deps.database.close).toHaveBeenCalledTimes(1);
    expect(deps.setExitCode).toHaveBeenCalledWith(1);
  });

  it('forces a failing exit if shutdown exceeds five seconds', async () => {
    jest.useFakeTimers();
    try {
      const { app, deps, lifecycle } = fixture();
      await lifecycle.start();
      let finish: () => void;
      app.close.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const stopped = lifecycle.stop();
      await jest.advanceTimersByTimeAsync(5000);
      expect(deps.forceExit).toHaveBeenCalledWith(1);
      finish();
      await stopped;
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not listen after shutdown interrupts authentication', async () => {
    const { app, deps, lifecycle } = fixture();
    let complete: () => void;
    deps.database.authenticate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const started = lifecycle.start();
    for (let i = 0; i < 10 && !complete; i++) await Promise.resolve();
    const stopped = lifecycle.stop();
    expect(deps.database.close).not.toHaveBeenCalled();
    complete();
    await Promise.all([started, stopped]);
    expect(app.listen).not.toHaveBeenCalled();
    expect(deps.database.close).toHaveBeenCalledTimes(1);
    expect(deps.setExitCode).toHaveBeenCalledWith(0);
  });

  it('allows an actual in-flight HTTP request to use the database while draining', async () => {
    const { deps } = fixture();
    const app = fastify({ forceCloseConnections: 'idle' });
    deps.createApp.mockReturnValue(app);
    let reached: () => void;
    let resume: () => void;
    const inside = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    app.get('/slow', async () => {
      reached();
      await gate;
      expect(deps.database.close).not.toHaveBeenCalled();
      await deps.database.authenticate();
      return { ok: true };
    });
    const lifecycle = new ApplicationLifecycle(deps);
    await lifecycle.start();
    const address = app.server.address() as { port: number };
    const response = fetch(`http://127.0.0.1:${address.port}/slow`);
    await inside;
    const stopped = lifecycle.stop();
    resume();
    expect(await (await response).json()).toEqual({ ok: true });
    await stopped;
    expect(deps.database.close).toHaveBeenCalledTimes(1);
  });
});
